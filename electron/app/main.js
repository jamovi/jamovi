
'use strict';

const electron = require('electron');
const app = electron.app;
const path = require('path');
const fs = require('fs');

const version = function() {
    let versionPath = path.join(path.dirname(process.execPath), '..', 'Resources', 'jamovi', 'version');
    try {
        return fs.readFileSync(versionPath, { encoding: 'utf-8' }).trim();
    }
    catch(e) {
        return 'unknown version';
    }
}

const marshallArgs = function(argv, wd, first) {

    let cmd = { first: first };

    if (argv.length < 2) {
        cmd.open = '';
    }
    else if (argv[1] === '--version') {
        console.log(version());
        cmd.exit = true;
    }
    else if (argv[1] === '--install') {
        if (argv.length > 2) {
            let p = path.resolve(wd, argv[2]);
            if (fs.existsSync(p))
                cmd.install = p;
            else
                cmd.error = 'File not found';
        }
        else {
            cmd.error = 'You must specify a .jmo file to install';
        }
    }
    else if (argv[1].startsWith('-psn')) {
        // https://github.com/electron/electron/issues/3657
        cmd.open = '';
    }
    else {
        cmd.open = path.resolve(wd, argv[1]);
    }

    return cmd;
}

let argvCmd = marshallArgs(process.argv, '.', true)
if (argvCmd.error)
    console.log(argvCmd.error);
if (argvCmd.exit)
    app.quit();

let alreadyRunning = app.makeSingleInstance((argv, wd) => {
    let cmd = marshallArgs(argv, wd);
    handleCommand(cmd);
});

if (alreadyRunning)
    app.quit()

// proxy servers can interfere with accessing localhost
app.commandLine.appendSwitch('no-proxy-server');

const BrowserWindow = electron.BrowserWindow;
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const child_process = require('child_process');

const ini = require('./ini');
const tmp = require('./tmp');

let confPath = path.join(path.dirname(process.execPath), 'env.conf');
let content = fs.readFileSync(confPath, 'utf8');
let conf = ini.parse(content);
let rootPath = path.resolve(path.dirname(process.execPath), conf.ENV.JAMOVI_CLIENT_PATH) + '/';

let serverCMD = conf.ENV.JAMOVI_SERVER_CMD.split(' ')
let cmd = path.resolve(path.dirname(process.execPath), serverCMD[0]);
let args = serverCMD.slice(1);
global.version = version();

let env = { };
if (process.platform === 'linux') {
    // maintain environmental variables from linux
    Object.assign(env, process.env);
}
else if (process.platform === 'darwin') {
    // fontconfig in R on macOS likes HOME to be defined
    if (process.env.HOME)
        env.HOME = process.env.HOME;
}
Object.assign(env, conf.ENV);

for (let name in env) {
    // expand paths
    if (name.endsWith('PATH') || name.endsWith('HOME')) {
        let value = env[name];
        let paths = value.split(path.delimiter);
        paths = paths.map(p => path.resolve(path.dirname(process.execPath), p));
        value = paths.join(path.delimiter);
        env[name] = value;
    }
}

const convertToPDF = function(path) {

    let wind = new BrowserWindow({ width: 1280, height: 800, show: false });
    wind.webContents.loadURL('file://' + path);

    return new Promise((resolve, reject) => {

        wind.webContents.once('did-finish-load', () => resolve());

    }).then(() => {

        return new Promise((resolve, reject) => {
            wind.webContents.printToPDF({}, (err, data) => {
                setTimeout(() => wind.close());
                if (err)
                    reject(err)
                resolve(data);
            });
        });
    }).then((data) => {

        return new Promise((resolve, reject) => {
            tmp.file({ postfix: '.pdf' }, (err, path, fd) => {
                if (err)
                    reject(err);
                resolve({fd: fd, path: path, data: data});
            });
        });
    }).then((obj) => {
        return new Promise((resolve, reject) => {
            fs.writeFile(obj.fd, obj.data, (err) => {
                if (err)
                    reject(err)
                resolve(obj.path);
            });
        });
    });
}

let server;
let ports = null;

let spawn = new Promise((resolve, reject) => {

    server = child_process.spawn(cmd, args, { env: env, detached: true });
    // detached, because weird stuff happens on windows if not detached

    let dataListener = (chunk) => {
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

        let cmdRegex = /^request: ([a-z-]+) \(([0-9]+)\) ?(.*)$/
        let match = cmdRegex.exec(chunk)
        if (match !== null) {
            let id = match[2];
            switch (match[1]) {
            case 'convert-to-pdf':
                match = /^"(.*)"$/.exec(match[3]);
                if (match) {
                    convertToPDF(match[1]).then((path) => {
                        let response = 'response: convert-to-pdf (' + id + ') 1 "' + path + '"\n';
                        server.stdin.write(response);
                        console.log(response);
                    }).catch((err) => {
                        let response = 'response: convert-to-pdf (' + id + ') 0 "' + err + '"\n';
                        server.stdin.write(response);
                        console.log(response);
                    });
                }
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
        let cmd = { open: path };
        if (app.isReady())
            createWindow(cmd);
        else
            argvCmd = cmd;
        event.preventDefault();
    });
});

let ready = new Promise(resolve => {
    app.on('ready', resolve);
});

Promise.all([ready, spawn]).then(() => {
    handleCommand(argvCmd);
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

const handleCommand = function(cmd) {
    if ('error' in cmd) {
        if (cmd.first)
            app.quit();
    }
    else if ('open' in cmd) {
        createWindow(cmd);
    }
    else if ('install' in cmd) {
        server.stdin.write('install: ' + cmd.install + '\n');
        if (cmd.first)
            app.quit();
    }
};

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
