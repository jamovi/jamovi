
'use strict';

const electron = require('electron');
const app = electron.app;
const path = require('path');

let alreadyRunning = app.makeSingleInstance((argv, wd) => {
    let toOpen = '';
    if (argv.length > 1)
        toOpen = path.resolve(wd, argv[1])
    createWindow({ open: toOpen });
});

if (alreadyRunning)
    app.quit()

const BrowserWindow = electron.BrowserWindow;
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const fs = require('fs');
const child_process = require('child_process');

const ini = require('./ini');

let confPath = path.join(path.dirname(process.execPath), 'env.conf');
let content = fs.readFileSync(confPath, 'utf8');
let conf = ini.parse(content);
let rootPath = path.resolve(path.dirname(process.execPath), conf.JAMOVI.CLIENT_PATH) + '/';

let serverCMD = conf.JAMOVI.SERVER_CMD.split(' ')
let cmd = path.resolve(path.dirname(process.execPath), serverCMD[0]);
let args = serverCMD.slice(1);

let env = { };
if (process.env.HOME)  // fontconfig in R on macOS likes HOME to be defined
    env.HOME = process.env.HOME;
Object.assign(env, conf.ENV);

for (let name in env) {
    if (name.endsWith('PATH') || name.endsWith('HOME')) {
        let value = env[name];
        let paths = value.split(path.delimiter);
        paths = paths.map(p => path.resolve(path.dirname(process.execPath), p));
        value = paths.join(path.delimiter);
        env[name] = value;
    }
}

let server;
let ports = null;

let spawn = new Promise((resolve, reject) => {

    server = child_process.spawn(cmd, args, { env: env, detached: true });
    // detached, because weird stuff happens on windows if not detached

    let dataListener = chunk => {
        console.log(chunk);
        if (ports === null) {
            // the server sends back the ports it has opened through stdout
            ports = /ports: ([0-9]*), ([0-9]*), ([0-9]*)/.exec(chunk);
            if (ports !== null) {
                ports = ports.slice(1, 4);
                ports = ports.map(x => parseInt(x));
                resolve(ports);
            }
        }
    };

    server.on('error', error => reject(error));
    server.stdout.setEncoding('utf8');
    server.stderr.setEncoding('utf8');
    server.stdout.on('data', dataListener);
    server.stderr.on('data', dataListener);

}).then(ports => {

    app.on('quit', () => server.stdin.end())  // closing stdin terminates the server
    global.mainPort = ports[0];
    global.analysisUIPort = ports[1];
    global.resultsViewPort = ports[2];

}).catch(error => {
    console.log(error)
    dialog.showErrorBox('Server Error', 'Unfortunately, the jamovi server could not be started, and jamovi must now close. We regret the inconvenience.\n\nPlease report your experiences to the jamovi team.');
    app.quit();
});

let toOpen = '';
if (process.argv.length >= 2)
    toOpen = process.argv[1];

let windows = [ ];

// windows path adjustments
if (rootPath.startsWith('/') === false)
    rootPath = '/' + rootPath;
rootPath = rootPath.replace(/\\/g, '/');

let rootUrl = encodeURI('file://' + rootPath);
let serverUrl = rootUrl + 'analyses/';

app.on('window-all-closed', () => app.quit());

app.on('will-finish-launching', () => {
    // macOS file open events
    app.on('open-file', (event, path) => {
        event.preventDefault();
        createWindow({ open: path });
    });
});

let ready = new Promise(resolve => {
    app.on('ready', resolve);
});

Promise.all([ready, spawn]).then(() => {
    createWindow({ open: toOpen });
});

// handle requests sent from the browser instances
ipc.on('request', (event, arg) => {

    // locate the sender
    let wind = null;
    for (let i = 0; i < windows.length; i++) {
        wind = windows[i];
        if (wind.webContents === event.sender)
            break;
    }

    let eventType = arg.type;
    let eventData = arg.data;

    switch (eventType) {
        case 'openDevTools':
            wind.webContents.toggleDevTools();
            break;
        case 'openWindow':
            createWindow({ id: eventData });
            break;
        case 'close':
            wind.close();
            break;
        case 'minimize':
            wind.minimize();
            break;
        case 'maximize':
            if (wind.isMaximized())
                wind.unmaximize();
            else
                wind.maximize();
            break;
    }
});

const createWindow = function(open) {

    let wind = new BrowserWindow({ width: 1280, height: 800, frame: process.platform !== 'win32' });
    windows.push(wind);

    let url = rootUrl + 'index.html';
    if (open.id)
        url += '?id=' + open.id;
    else if (open.open)
        url += '?open=' + path.resolve(open.open);

    wind.loadURL(url);

    let requests = wind.webContents.session.webRequest;
    requests.onBeforeRequest((details, callback) => {
        // redirect requests to the local tornado server when appropriate
        let url = details.url;

        if (url.startsWith(serverUrl)) {
            let relative = url.slice(serverUrl.length);
            let newUrl = 'http://localhost:' + global.mainPort + '/analyses/' + relative;
            callback({ redirectURL : newUrl });  // redirect
        }
        else {
            callback({});  // don't redirect
        }
    });

    wind.on('closed', function() {
        windows = windows.filter(w => w != wind);
    });
};
