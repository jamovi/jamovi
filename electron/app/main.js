
'use strict';

const electron = require('electron');
const app = electron.app;
const path = require('path');
const fs = require('fs');
const os = require('os');
const shell = electron.shell;
const Menu = electron.Menu;

const ini = require('./ini');
const tmp = require('./tmp');

app.allowRendererProcessReuse = true;

// required to hide the application menu on linux
// https://github.com/electron/electron/issues/16521
Menu.setApplicationMenu(null);

process.on('uncaughtException', (e) => {
    console.log(e);
});

let _config;

function readConfig() {

    if (_config)
        return _config;

    let execDir = path.dirname(process.execPath);
    let confPath = path.join(execDir, 'env.conf');
    let content;

    try {
        content = fs.readFileSync(confPath, 'utf8');
    }
    catch (e) {
        confPath = path.join(execDir, '..', 'Resources', 'env.conf');
        content = fs.readFileSync(confPath, 'utf8');
    }

    let conf = ini.parse(content);
    let env = conf.ENV;

    let clientPath;
    clientPath = env.JAMOVI_CLIENT_PATH;
    clientPath = path.resolve(execDir, clientPath) + '/';
    // windows path adjustments
    if ( ! clientPath.startsWith('/'))
        clientPath = '/' + clientPath;
    clientPath = clientPath.replace(/\\/g, '/');

    let versionPath;
    versionPath = env.JAMOVI_VERSION_PATH;
    if (versionPath)
        versionPath = path.resolve(execDir, versionPath);
    else
        versionPath = path.join(execDir, '..', 'Resources', 'jamovi', 'version');

    let version;
    try {
        version = fs.readFileSync(versionPath, { encoding: 'utf-8' }).trim();
    }
    catch(e) {
        version = '0.0.0.0';
    }

    let serverCmd = env.JAMOVI_SERVER_CMD.split(' ');
    let serverExe = path.resolve(execDir, serverCmd[0]);
    let serverArgs = serverCmd.slice(1);

    let iconPath = env.JAMOVI_ICON_PATH;
    if (iconPath)
        path.resolve(execDir, iconPath);

    _config = {
        clientPath,
        serverExe,
        serverArgs,
        version,
        env,
        iconPath,
    };

    return _config;
}

const marshallArgs = function(args, wd, first) {

    let cmd = { first: first };

    let i = 0;
    while (i < args.length) {
        let arg = args[i]
        if (arg.startsWith('--') && ! ['--version', '--r-version', '--install', '--debug'].includes(arg))
            // strip the chromium switches
            args.splice(i, 1);
        else
            i++;
    }

    if (args.length < 1) {
        cmd.open = '';
    }
    else if (args[0] === '--version') {
        console.log(readConfig().version);
        cmd.exit = true;
    }
    else if (args[0] === '--r-version') {
        console.log(readConfig().env.JAMOVI_R_VERSION);
        cmd.exit = true;
    }
    else if (args[0] === '--install') {

        if (args.length > 1) {

            // electron/chromium sometimes adds extra args like:
            // --allow-file-access-from-files --original-process-start-time=XXXX
            // so we perform the following to get rid of them
            args = [ args[0], args[args.length - 1] ];

            let p = path.resolve(wd, args[1]);
            if (fs.existsSync(p))
                cmd.install = p;
            else
                cmd.error = 'File not found';
        }
        else {
            cmd.error = 'You must specify a .jmo file to install';
        }
    }
    else if (args[0].startsWith('-psn')) {
        // https://github.com/electron/electron/issues/3657
        cmd.open = '';
    }
    else if (args[0] === '--debug') {
        cmd.open = '';
        cmd.debug = true;
    }
    else {
        let filePath = args[0];
        if (filePath.startsWith('http://') || filePath.startsWith('https://'))
            cmd.open = filePath
        else
            cmd.open = path.resolve(wd, filePath);
    }

    return cmd;
}

let argv = process.argv;
let debug;
if (argv.length >= 2 && argv[1] === '--py-debug') {
    argv.shift(); // remove exe
    argv.shift(); // remove --py-debug
    let pth = path.join(os.homedir(), 'jamovi-log.txt');
    debug = fs.createWriteStream(pth);

    console.log('Logging to: ' + pth);
    console.log();
}
else {
    argv.shift(); // remove exe
}

let argvCmd = marshallArgs(argv, '.', true)
if (argvCmd.error)
    console.log(argvCmd.error);
if (argvCmd.exit) {
    app.quit();
    process.exit(0);
}

let firstInstance = app.requestSingleInstanceLock();
if ( ! firstInstance) {
    app.quit();
    process.exit(0);
    // second instance event handled lower down
}

// proxy servers can interfere with accessing localhost
app.commandLine.appendSwitch('no-proxy-server');

const BrowserWindow = electron.BrowserWindow;
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const child_process = require('child_process');
const { URL } = require('url');

const config = readConfig();

if (debug)
    config.serverArgs.unshift('-vvv');
if (argvCmd.debug)
    config.serverArgs.push('--debug');

global.version = config.version;

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
Object.assign(env, config.env);

let bin = path.dirname(process.execPath);

for (let name in env) {
    // expand paths
    if (name.endsWith('PATH') || name.endsWith('HOME') || name.endsWith('LIBS')) {
        let value = env[name];
        let paths = value.split(path.delimiter);
        paths = paths.map(p => path.resolve(bin, p));
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

        return wind.webContents.printToPDF({})
            .finally(() => setTimeout(() => wind.close()));

    }).then((data) => {

        return new Promise((resolve, reject) => {
            tmp.file({ postfix: '.pdf' }, (err, path, fd) => {
                if (err)
                    reject(err);
                resolve({ fd: fd, path: path, data: data });
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
let windows = [ ];
let rootUrl;
let updateUrl;
let recorderWindow = null;

const spawn = new Promise((resolve, reject) => {

    server = child_process.spawn(
        config.serverExe,
        config.serverArgs,
        { env: env, detached: true });
    // detached, because weird stuff happens on windows if not detached

    let dataListener = (chunk) => {

        if (debug)
            debug.write(chunk);
        else
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

        let cmdRegex = /^request: ([a-z-]+) \(([0-9]+)\) ?(.*)\r?\n?$/
        let match = cmdRegex.exec(chunk)
        if (match !== null) {
            let id = match[2];
            switch (match[1]) {
            case 'convert-to-pdf':
                match = /^"(.*)"$/.exec(match[3]);
                if (match) {
                    convertToPDF(match[1]).then((path) => {
                        let response = `response: convert-to-pdf (${ id }) 1 "${ path }"\n`;
                        server.stdin.write(response);
                    }).catch((err) => {
                        let response = `response: convert-to-pdf (${ id }) 0 "${ err }"\n`;
                        server.stdin.write(response);
                    });
                }
            case 'software-update':
                match = /^"(.*)"$/.exec(match[3]);
                if (match) {
                    try {
                        checkForUpdate(updateUrl, match[1]);
                        let response = `response: software-update (${ id }) 1\n`;
                        server.stdin.write(response);
                    }
                    catch (e) {
                        let response = `response: software-update (${ id }) 0 "' + e.message + '"\n`;
                        server.stdin.write(response);
                    }
                }
            }
        }
    };

    server.on('error', error => reject(error));
    server.stdout.setEncoding('utf8');
    server.stderr.setEncoding('utf8');
    server.stdout.on('data', dataListener);
    server.stderr.on('data', dataListener);
    server.on('close', (code) => reject(`Failed to start (${code})`));

}).then(ports => {

    app.on('quit', () => server.stdin.end())  // closing stdin terminates the server
    server.on('close', (code) => { if (code === 0) app.quit(); });

    global.mainPort = ports[0];
    global.analysisUIPort = ports[1];
    global.resultsViewPort = ports[2];

    rootUrl = `http://127.0.0.1:${ ports[0] }/`

    let platform;
    if (process.platform === 'darwin')
        platform = 'macos';
    else if (process.platform === 'win32')
        platform = 'win64';
    else
        platform = 'linux';

    updateUrl = 'https://www.jamovi.org/downloads/update?p=' + platform + '&v=' + config.version + '&f=zip';

    setTimeout(() => checkForUpdate(updateUrl), 500);
    setInterval(() => checkForUpdate(updateUrl, 'checking', false), 60 * 1000);

}).catch(error => {
    console.log(error)
    dialog.showErrorBox('Server Error', 'Unfortunately, the jamovi server could not be started, and jamovi must now close. We regret the inconvenience.\n\nPlease report your experiences to the jamovi team.');
    app.quit();
});

app.on('window-all-closed', () => app.quit());

app.on('will-finish-launching', () => {
    // macOS file open events
    app.on('open-file', (event, path) => {
        let cmd = { open: decodeURIComponent(path) };
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

let splash = null;

if (os.platform() === 'win32') {
    ready.then(() => {
        if ('open' in argvCmd) {
            splash = new BrowserWindow({
                width: 390,
                height: 110,
                frame: false,
                transparent: true,
                center: true,
                focusable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
            });

            // https://github.com/jamovi/jamovi/issues/816
            splash.setIgnoreMouseEvents(true);

            splash.loadURL('file://' + __dirname + '/splash.html');
            splash.show();
            splash.webContents.on('will-navigate', (e, url) => {
                e.preventDefault();
                shell.openExternal(url);
            });
        }
    });
}

let completelyReady = Promise.all([ready, spawn]);

completelyReady.then(() => {
    handleCommand(argvCmd);
});

app.on('second-instance', async(e, argv, wd) => {
    await completelyReady;
    argv.shift(); // remove exe
    let cmd = marshallArgs(argv, wd);
    handleCommand(cmd);
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

    if (wind === null)
        return;

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
        case 'openRecorder':
            openRecorder(eventData);
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
        if (cmd.first)
            server.stdin.write('install-and-quit: ' + cmd.install + '\n');
        else
            server.stdin.write('install: ' + cmd.install + '\n');
    }
};

const createWindow = function(open) {

    let wind = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        vibrancy: 'titlebar',
        defaultEncoding: 'UTF-8',
        frame: process.platform !== 'win32',
        icon: config.iconPath,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: true,
        },
    });

    // as of electron 1.7.9 on linux, drag and drop from the fs to electron
    // doesn't seem to work, the drop event is never fired. so we handle the
    // navigate event here to achieve the same thing
    wind.webContents.on('will-navigate', (event, url) => {
        if ( ! url.startsWith(rootUrl)) {
            let path = new URL(url).pathname;
            createWindow({ open: path });
            event.preventDefault();
        }
    });

    if (recorderWindow !== null) {
        let script = `window.notifyCurrentWindowChanged(${wind.id})`;
        recorderWindow.webContents.executeJavaScript(script);
    }

    wind.on('focus', (event) => {
        if (recorderWindow !== null) {
            let script = `window.notifyCurrentWindowChanged(${event.sender.id})`;
            recorderWindow.webContents.executeJavaScript(script);
        }
    });

    wind.webContents.on('did-finish-load', (event) => {
        if (splash != null) {
            splash.close();
            splash = null;
        }
    });

    windows.push(wind);

    let url = rootUrl;
    if (open.id)
        url += open.id + '/';
    if (open.open) {
        let filePath = open.open;
        if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            url = `${ url }?open=${ filePath }`;
        }
        else {
            filePath = path.resolve(filePath);
            url = `${ url }?open=${ encodeURIComponent(filePath) }`;
        }
    }

    wind.loadURL(url);

    wind.webContents.on('new-window', function(e, url) {
        e.preventDefault();
        electron.shell.openExternal(url);
    });

    wind.on('closed', (event) => {
        windows = windows.filter(w => w != wind);
        if (windows.length === 0 && recorderWindow !== null) {
            let recorder = recorderWindow;
            // set it to null to really close
            recorderWindow = null;
            recorder.close();
        }
    });
};

const updater = electron.autoUpdater;

updater.on('error', () => {
    notifyUpdateStatus('error');
});

updater.on('update-downloaded', () => {
    notifyUpdateStatus('ready');
});

let lastUpdateCheck = new Date(0);

const checkForUpdate = function(url, type='checking', force=true) {

    if (process.platform !== 'darwin')  // only macOS for now
        return;

    let now = new Date()
    if (force === false && (now - lastUpdateCheck) < 60 * 60 * 1000)
        return;
    lastUpdateCheck = now;

    if (type === 'checking') {
        const https = require('https');
        let req = https.request(url);
        req.end();
        notifyUpdateStatus('checking');
        req.on('response', (message) => {
            if (message.statusCode === 204)
                notifyUpdateStatus('uptodate');
            else if (message.statusCode === 200)
                notifyUpdateStatus('available');
            else
                notifyUpdateStatus('checkerror');
        });
        req.on('error', (error) => {
            notifyUpdateStatus('checkerror');
        });
    }
    else if (type === 'downloading') {
        notifyUpdateStatus('downloading');
        updater.setFeedURL(updateUrl);
        updater.checkForUpdates();
    }
    else if (type === 'installing') {
        updater.quitAndInstall();
    }
};

const notifyUpdateStatus = function(status) {
    setTimeout(() => {
        try {
            let response = 'notification: update ' + status + '\n';
            server.stdin.write(response);
        }
        catch (e) {
            // do nothing
        }
    });
}

const openRecorder = function(id) {
    if (recorderWindow === null) {

        // setting focusable to false seems only useful on macOS
        // it's bad on windows, and completely useless on linux
        let focusable = process.platform !== 'darwin';

        // on linux, alwaysOnTop doesn't work, so it's better
        // to leave it in the taskbar
        let skipTaskbar = process.platform !== 'linux';

        recorderWindow = new BrowserWindow({
            show: false,
            width: 340,
            height: 240,
            resizable: false,
            minimizable: false,
            maximizable: false,
            alwaysOnTop: true,
            fullscreenable: false,
            focusable: focusable,
            skipTaskbar: skipTaskbar,
            vibrancy: 'titlebar',
            acceptFirstMouse: true,
            defaultEncoding: 'UTF-8',
            webPreferences: {
                nodeIntegration: true,
            },
        });

        recorderWindow.loadURL(rootUrl + 'recorder.html');
        recorderWindow.once('ready-to-show', () => {
            let script = `window.notifyCurrentWindowChanged(${id})`;
            recorderWindow.webContents.executeJavaScript(script);
            recorderWindow.show();
        });
        recorderWindow.on('close', (event) => {
            // set recorderWindow to null to close properly
            if (recorderWindow !== null) {
                recorderWindow.hide();
                event.preventDefault();
            }
        })
        recorderWindow.once('closed', (event) => {
            recorderWindow = null;
        });
    }
    else if (recorderWindow.isVisible()) {
        recorderWindow.focus();
        recorderWindow.flashFrame();
    }
    else {
        recorderWindow.show();
    }
}
