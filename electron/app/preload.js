
const events = require('events');

const APP_NAME = 'jamovi';


let dialogProvider;
let emitter = new events.EventEmitter();

let on = (name, args) => emitter.on(name, args);
let _notify = (name, args) => emitter.emit(name, args);

let os;
if (navigator.platform === 'Win32')
    os = 'win64';
else if (navigator.platform === 'MacIntel')
    os = 'macos';
else if (navigator.platform.startsWith('Linux'))
    os = 'linux';
else
    os = 'other';

const electron = require('electron');
const remote = electron.remote;
const webFrame = electron.webFrame;
const browserWindow = remote.getCurrentWindow();
const webContents = browserWindow.webContents;
const dialog = remote.dialog;
const Menu = remote.Menu;
const clipboard = electron.clipboard;
const nativeImage = electron.nativeImage;
const shell = electron.shell;
const contextBridge = electron.contextBridge;

const version = Promise.resolve(remote.getGlobal('version'));
const nameAndVersion = Promise.resolve(APP_NAME + ' ' + remote.getGlobal('version'));
const baseUrl = 'http://127.0.0.1:' + remote.getGlobal('mainPort') + '/';
const analysisUIUrl  = 'http://127.0.0.1:' + remote.getGlobal('analysisUIPort') + '/';
const resultsViewUrl = 'http://127.0.0.1:' + remote.getGlobal('resultsViewPort') + '/';

const ipc = electron.ipcRenderer;

// intercept page refreshes, so we can differentiate between
// a page refresh, and a window close

let beforeInputEvent = (event, input) => {
    if (input.type !== 'keyDown')
        return;
    if ((input.key === 'r' && input.meta) ||
        (input.key === 'F5') ||
        (input.key === 'r' && input.ctrlKey)) {
        loading = true;
        location.reload();
    }
};

webContents.on('before-input-event', beforeInputEvent);

let loading = false;
let closing = false;

// beforeunload is how we intercept window closes (prompt to save)
// but it also gets triggered for page refreshes. in general, the user
// shouldn't be able to refresh the page, but they're useful during
// development.

window.onbeforeunload = event => {
    if (closing !== true && loading !== true) {
        setTimeout(() => {
            let event = new Event('close', { cancelable: true });
            _notify('close', event);
            if (event.defaultPrevented === false) {
                closing = true;
                closeWindow();
            }
        });
        return false;
    }
    webContents.removeListener('before-input-event', beforeInputEvent);
};

function minimizeWindow() {
    ipc.send('request', { type: 'minimize' });
}

function maximizeWindow() {
    ipc.send('request', { type: 'maximize' });
}

function closeWindow(force) {
    if (force)
        closing = true;
    ipc.send('request', { type: 'close' });
}

function navigate(instanceId) {
    loading = true;
    window.location = `${ window.location.origin }/${ instanceId }/`;
}

function openWindow(instanceId) {
    ipc.send('request', { type: 'openWindow', data: instanceId });
}

function toggleDevTools() {
    ipc.send('request', { type: 'openDevTools' });
}

function openRecorder() {
    // we send the parent so it can be the first window for recording
    ipc.send('request', { type: 'openRecorder', data: browserWindow.id });
}

function openUrl(url) {
    if (url.startsWith('http://') || url.startsWith('https://'))
        shell.openExternal(url);
}

const zoomLevels = [ 30, 50, 67, 80, 90, 100, 110, 120, 133, 150, 170, 200, 240, 300 ];
let zoomLevel = 5;

function zoomIn() {
    if (zoomLevel < zoomLevels.length - 1) {
        zoomLevel++;
        let z = zoomLevels[zoomLevel];
        zoom(z);
    }
}

function zoomOut() {
    if (zoomLevel > 0) {
        zoomLevel--;
        let z = zoomLevels[zoomLevel];
        zoom(z);
    }
}

function zoom(z) {
    zoomLevel = zoomLevels.indexOf(z);
    if (zoomLevel === -1) {
        zoomLevel = 5;
        z = 100;
    }
    if (webFrame.setLayoutZoomLevelLimits) {
        // this was working around a bug in earlier electrons
        webFrame.setLayoutZoomLevelLimits(-999999, 999999);
        webFrame.setZoomFactor(z / 100);
        let ezl = webFrame.getZoomLevel();
        webFrame.setLayoutZoomLevelLimits(ezl, ezl);
    }
    else {
        webFrame.setZoomFactor(z / 100);
    }
}

function currentZoom() {
    return parseInt(100 * webFrame.getZoomFactor());
}

function showMessageBox(options) {
    return (dialog.showMessageBoxSync || dialog.showMessageBox)(browserWindow, options);
}

window.onkeydown = function(event) {
    if (os === 'macos') {
        if (event.key === '_' && event.metaKey && event.shiftKey) {
            zoomOut();
            event.preventDefault();
        }
        else if (event.key === '+' && event.metaKey && event.shiftKey) {
            zoomIn();
            event.preventDefault();
        }
    }
    else {
        if (event.key === '_' && event.ctrlKey && event.shiftKey) {
            zoomOut();
            event.preventDefault();
        }
        else if (event.key === '+' && event.ctrlKey && event.shiftKey) {
            zoomIn();
            event.preventDefault();
        }
    }
}

function setEdited(edited) {
    browserWindow.setDocumentEdited(edited);
}

function constructMenu(template) {
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function copyToClipboard(data) {
    if ('image' in data)
        data.image = nativeImage.createFromDataURL(data.image);
    clipboard.write(data);
    return Promise.resolve();
}

function pasteFromClipboard() {
    let text = clipboard.readText();
    let html = clipboard.readHTML();
    if (html === text)
        html = '';
    return { text, html };
}

function setDialogProvider(provider) {
    dialogProvider = provider;
}

async function showSaveDialog(options) {
    let selection = await dialogProvider.showDialog('export', options);
    // On linux we don't get an extension, so here we add the default one
    // https://github.com/electron/electron/issues/21935
    let hasExtension = /\.[^\/\\]+$/.test(selection.filePath);
    if (hasExtension === false && options.filters) {
        let defaultExt = options.filters[0].extensions[0];
        selection.filePath = `${ selection.filePath }.${ defaultExt }`;
    }
    return selection;
}

async function showSaveDialogExternal(options) {
    options = options || { };
    let result = await dialog.showSaveDialog(options);
    if (result.canceled) {
        return { cancelled: true };
    }
    else {
        let file = result.filePath.replace(/\\/g, '/');
        return { cancelled: false, file };
    }
}

async function showOpenDialog(options) {
    options = options || { };
    options.properties = options.properties || [ 'openFile' ];
    if (options.multiple)
        options.properties.push('multiSelections');

    let result = await dialog.showOpenDialog(options);
    if (result.canceled) {
        return { cancelled: true };
    }
    else {
        let files = result.filePaths.map(x => x.replace(/\\/g, '/'));
        return { cancelled: false, files };
    }
}

contextBridge.exposeInMainWorld(
    'host',
    {
        isElectron: true,
        version,
        nameAndVersion,
        baseUrl,
        analysisUIUrl,
        resultsViewUrl,
        minimizeWindow,
        maximizeWindow,
        closeWindow,
        openWindow,
        toggleDevTools,
        zoom,
        zoomIn,
        zoomOut,
        currentZoom,
        on,
        showMessageBox,
        setEdited,
        navigate,
        constructMenu,
        copyToClipboard,
        pasteFromClipboard,
        showSaveDialog,
        showSaveDialogExternal,
        showOpenDialog,
        os,
        openUrl,
        openRecorder,
        setDialogProvider
    });
