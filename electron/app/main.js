
'use strict';

const electron = require('electron');
const app = electron.app;
const path = require('path');
const fs = require('fs');
const os = require('os');
const shell = electron.shell;
const Menu = electron.Menu;

const { clipboard } = electron;
const { nativeImage } = electron;

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

    const cmd = { first };

    let i;

    // sorry, this is bit hacky, and should all be done properly
    // but i'm having a bad day. apologies in advance.
    i = 0;
    while (i < args.length) {
        let arg = args[i];
        if (arg.startsWith('--title=')) {
            cmd.title = args.splice(i, 1)[0].substring(8);
        }
        else if (arg == '--temp') {
            cmd.temp = true;
            args.splice(i, 1);
        }
        else {
            i++;
        }
    }

    i = 0;
    while (i < args.length) {
        let arg = args[i]
        if (arg.startsWith('--') && ! ['--version', '--r-version', '--install', '--debug2', '--devel'].includes(arg))
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
    else if (args[0] === '--debug2') {
        cmd.open = '';
        cmd.debug = true;
    }
    else if (args[0] === '--devel') {
        cmd.open = '';
        cmd.devel = true;
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
if (argvCmd.devel)
    config.serverArgs.push('--dev-server=http://localhost:5173');

const clientConfig = {
    version: config.version,
    roots: undefined,
}

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

    let wind = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        webPreferences: {
            contextIsolation: true,
        }
    });
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
let rootUrl;
let accessKey;

const spawn = new Promise((resolve, reject) => {

    server = child_process.spawn(
        config.serverExe,
        config.serverArgs,
        { env: env, detached: true, cwd: bin });
    // detached, because weird stuff happens on windows if not detached
    // set the working directory to bin so it doesn't pick up random dlls

    let dataListener = (chunk) => {

        if (debug)
            debug.write(chunk);
        else
            console.log(chunk);

        if (ports === null) {
            // the server sends back the ports it has opened through stdout
            ports = /ports: ([0-9]+), ([0-9]+), ([0-9]+), access_key: (.+)\r?\n/.exec(chunk);
            if (ports !== null) {
                let accessKey = ports[4];
                ports = ports.slice(1, 4);
                ports = ports.map(x => parseInt(x));
                resolve({ ports, accessKey });
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
            }
        }
    };

    server.on('error', error => reject(error));
    server.stdout.setEncoding('utf8');
    server.stderr.setEncoding('utf8');
    server.stdout.on('data', dataListener);
    server.stderr.on('data', dataListener);
    server.on('close', (code) => reject(`Failed to start (${code})`));

}).then(info => {

    server.on('close', (code) => { if (code === 0) app.quit(); });

    clientConfig.roots = [
        `http://127.0.0.1:${ info.ports[0] }/`,
        `http://127.0.0.1:${ info.ports[1] }/`,
        `http://127.0.0.1:${ info.ports[2] }/`,
    ];

    rootUrl = `http://127.0.0.1:${ info.ports[0] }/`;
    accessKey = info.accessKey;

    let platform;
    if (process.platform === 'darwin')
        platform = 'macos';
    else if (process.platform === 'win32')
        platform = 'win64';
    else
        platform = 'linux';

}).catch(error => {
    console.log(error)
    dialog.showErrorBox('Server Error', 'Unfortunately, the jamovi server could not be started, and jamovi must now close. We regret the inconvenience.\n\nMore information is available by visiting www.jamovi.org/troubleshooting.html');
    app.quit();
});

async function close() {
    if (server && server.exitCode === null) {
        server.stdin.end();  // closing stdin terminates the server
        let exit = new Promise((resolve) => {
            server.on('exit', resolve);
        });
        let timeout = new Promise((resolve) => setTimeout(resolve, 5000));
        await Promise.race([ exit, timeout ]);
        app.quit();
    }
    else {
        app.quit()
    }
}

app.on('window-all-closed', close);
app.on('will-quit', close);
app.on('quit', close);

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

const windowState = { };

ipc.handle('get-config', (event, arg) => {
    return clientConfig;
});

ipc.handle('show-message-box', async (event, options) => {
    const webContents = event.sender;
    const win = BrowserWindow.fromWebContents(webContents);
    const { response } = await dialog.showMessageBox(win, options);
    return response;
});

ipc.handle('copy-to-clipboard', (event, arg) => {
    let { content } = arg;
    if ('image' in content)
        content.image = nativeImage.createFromDataURL(content.image);
    clipboard.write(content);
    return undefined;
});

ipc.handle('paste-from-clipboard', (event, arg) => {
    const text = clipboard.readText();
    const html = clipboard.readHTML();
    return { text, html };
});

ipc.handle('show-open-dialog', (event, options) => {
    return dialog.showOpenDialog(options);
});

ipc.handle('show-save-dialog', (event, options) => {
    return dialog.showSaveDialog(options);
});

ipc.on('notify-return', (event, returned) => {
    if (returned.type === 'close' && returned.value !== false) {
        const webContents = event.sender;
        const win = BrowserWindow.fromWebContents(webContents);
        windowState[win.id].closing = true;
        win.close();
    }
});

// handle requests sent from the browser instances
ipc.on('request', (event, arg) => {

    const webContents = event.sender;
    const wind = BrowserWindow.fromWebContents(webContents);

    let eventType = arg.type;
    let eventData = arg.data;

    switch (eventType) {
        case 'toggleDevTools':
            webContents.toggleDevTools();
            break;
        case 'openWindow':
            createWindow({ id: eventData });
            break;
        case 'navigate':
            createWindow({ id: eventData, bounds: wind.getBounds() });
            wind.close();
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
        case 'setEdited':
            wind.setDocumentEdited(eventData.edited);
            break;
        case 'setMenu':
            const { template } = eventData;
            const menu = Menu.buildFromTemplate(template);
            Menu.setApplicationMenu(menu);
            break;
        case 'copyToClipboard':
            const { content } = eventData;
            if ('image' in content)
                content.image = nativeImage.createFromDataURL(content.image);
            clipboard.write(content);
            break;
        case 'zoom':
            const { zoom } = eventData;
            webContents.setZoomFactor(zoom);
            break;
        case 'openUrl':
            const { url } = eventData;
            if (url.startsWith('http://') || url.startsWith('https://'))
                shell.openExternal(url);
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

    let width = 1280;
    let height = 800;
    let x = undefined;
    let y = undefined;

    if (open && open.bounds) {
        width = open.bounds.width;
        height = open.bounds.height;
        x = open.bounds.x;
        y = open.bounds.y;
    }

    const wind = new BrowserWindow({
        width, height, x, y,
        minWidth: 800,
        minHeight: 600,
        vibrancy: 'titlebar',
        defaultEncoding: 'UTF-8',
        frame: process.platform !== 'win32',
        icon: config.iconPath,
        webPreferences: {
            enableRemoteModule: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    windowState[wind.id] = { loading: false, closing: false };

    const { webContents } = wind;

    const beforeInputEvent = (event, input) => {

        // intercept page refreshes, so we can differentiate between
        // a page refresh, and a window close

        if (input.type !== 'keyDown')
            return;

        if ((input.key === 'r' && input.meta)
                || (input.key === 'F5')
                || (input.key === 'r' && input.ctrlKey)) {
            windowState[wind.id].loading = true;
            wind.webContents.reload();
        }
    };

    webContents.on('before-input-event', beforeInputEvent);

    wind.on('close', (event) => {

        // beforeunload is how we intercept window closes (prompt to save)
        // but it also gets triggered for page refreshes. in general, the user
        // shouldn't be able to refresh the page, but they're useful during
        // development.

        const state = windowState[wind.id];

        if (state.closing !== true && state.loading !== true) {
            webContents.send('notify', { type: 'close', data: { } });
            event.preventDefault();
        }
        else {
            webContents.removeListener('before-input-event', beforeInputEvent);
        }
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

    wind.webContents.on('did-finish-load', (event) => {
        if (splash != null) {
            splash.close();
            splash = null;
        }
    });

    let url = rootUrl;
    if (open.id)
        url += open.id + '/';

    if (open.open) {

        let filePath = open.open;
        if ( ! (filePath.startsWith('http://') || filePath.startsWith('https://')))
            filePath = path.resolve(filePath);

        url = `${ url }?open=${ encodeURIComponent(filePath) }`;

        if (open.temp) {
            url = `${ url }&temp=1`;
            if (open.title)
                url = `${ url }&title=${ encodeURIComponent(open.title) }`;
        }
    }

    if (accessKey) {
        if (url.endsWith('/'))
            url += `?access_key=${ accessKey }`;
        else
            url += `&access_key=${ accessKey }`;
    }

    // wind.openDevTools();
    wind.loadURL(url);

    wind.webContents.setWindowOpenHandler((details) => {
        const { url, disposition } = details;
        if (disposition === 'foreground-tab') {
            // i suppose insisting on the foreground-tab is better security?
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });
};


