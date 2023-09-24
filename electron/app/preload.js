
const APP_NAME = 'jamovi';


let dialogProvider;
let listeners = [ ];

function on(name, callback) {
    listeners.push({ name, callback });
}

async function _notify(name, event) {
    for (const listener of listeners) {
        if (listener.name === name) {
            const ret = await Promise.resolve(listener.callback(event));
            if (ret === false)
                return ret;
        }
    }
}

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
const shell = electron.shell;
const contextBridge = electron.contextBridge;

const ipc = electron.ipcRenderer;

const version = new Promise(async (resolve) => {
    let config = await ipc.invoke('get-config');
    resolve(config.version);
});

const nameAndVersion = version.then((version) => {
    return `${ APP_NAME } ${ version }`;
});

ipc.on('notify', async (event, data) => {
    const { type, args } = data;
    const value = await _notify(type, args);
    ipc.send('notify-return', { type, value });
});

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
    ipc.send('request', { type: 'navigate', data: instanceId });
}

function openWindow(instanceId) {
    ipc.send('request', { type: 'openWindow', data: instanceId });
}

function toggleDevTools() {
    ipc.send('request', { type: 'toggleDevTools' });
}

function openUrl(url) {
    ipc.send('request', { type: 'openUrl', data: { url } });
}

const zoomLevels = [ 30, 50, 67, 80, 90, 100, 110, 120, 133, 150, 170, 200, 240, 300 ];
let zoomLevel = 5;

function zoomIn() {
    if (zoomLevel < zoomLevels.length - 1) {
        zoomLevel++;
        const z = zoomLevels[zoomLevel];
        zoom(z);
    }
}

function zoomOut() {
    if (zoomLevel > 0) {
        zoomLevel--;
        const z = zoomLevels[zoomLevel];
        zoom(z);
    }
}

function zoom(z) {
    zoomLevel = zoomLevels.indexOf(z);
    if (zoomLevel === -1) {
        zoomLevel = 5;
        z = 100;
    }
    ipc.send('request', { type: 'zoom', data: { zoom: z / 100 } });
}

function currentZoom() {
    return zoomLevels[zoomLevel];
}

async function showMessageBox(options) {
    return await ipc.invoke('show-message-box', options);
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
    ipc.send('request', { type: 'setEdited', data: { edited } });
}

function constructMenu(template) {
    ipc.send('request', { type: 'setMenu', data: { template } });
}

async function copyToClipboard(content) {
    await ipc.invoke('copy-to-clipboard', { content });
}

async function pasteFromClipboard() {
    const { text, html } = await ipc.invoke('paste-from-clipboard');
    if (html === text)
        html = '';
    return { text, html };
}

function setDialogProvider(provider) {
    dialogProvider = provider;
}

async function showSaveDialog(options) {
    return await dialogProvider.showDialog('export', options);
}

async function showSaveDialogExternal(options) {
    options = options || { };
    let result = await ipc.invoke('show-save-dialog', options);
    if (result.canceled) {
        return { cancelled: true };
    }
    else {
        let file = result.filePath.replace(/\\/g, '/');
        // On linux we don't get an extension, so here we add the default one
        // https://github.com/electron/electron/issues/21935
        let hasExtension = /\.[^\/\\]+$/.test(file);
        if (hasExtension === false && options.filters) {
            let defaultExt = options.filters[0].extensions[0];
            file = `${ file }.${ defaultExt }`;
        }
        return { cancelled: false, file };
    }
}

async function showOpenDialog(options) {

    options.properties = options.properties || [ 'openFile' ];
    if (options.multiple)
        options.properties.push('multiSelections');

    let result = await ipc.invoke('show-open-dialog', options);
    if (result.canceled) {
        return { cancelled: true };
    }
    else {
        let files = result.filePaths.map(x => x.replace(/\\/g, '/'));
        return { cancelled: false, files };
    }
}

contextBridge.exposeInMainWorld(
    'electronAPI',
    {
        isElectron: true,
        version,
        nameAndVersion,
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
        setDialogProvider
    });
