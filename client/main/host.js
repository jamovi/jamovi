//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const events = new require('events');

let baseUrl;
let analysisUIUrl;
let resultsViewUrl;

let isElectron;

let openWindow;
let toggleDevTools;
let minimizeWindow;
let maximizeWindow;
let closeWindow;
let zoom;
let zoomIn;
let zoomOut;
let currentZoom;
let setEdited;
let showMessageBox;
let navigate;
let constructMenu;
let copyToClipboard;
let pasteFromClipboard;
let showSaveDialog;
let version;

let emitter = new events.EventEmitter();

let on = (name, args) => emitter.on(name, args);
let _notify = (name, args) => emitter.emit(name, args);

if (window.require) {

    isElectron = true;

    const electron = window.require('electron');
    const remote = electron.remote;
    const webFrame = electron.webFrame;
    const browserWindow = remote.getCurrentWindow();
    const webContents = browserWindow.webContents;
    const dialog = remote.dialog;
    const Menu = remote.Menu;
    const clipboard = electron.clipboard;

    version = remote.getGlobal('version');
    baseUrl = 'http://localhost:' + remote.getGlobal('mainPort') + '/';
    analysisUIUrl  = 'http://localhost:' + remote.getGlobal('analysisUIPort') + '/';
    resultsViewUrl = 'http://localhost:' + remote.getGlobal('resultsViewPort') + '/';

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

    minimizeWindow = function() {
        ipc.send('request', { type: 'minimize' });
    };

    maximizeWindow = function() {
        ipc.send('request', { type: 'maximize' });
    };

    closeWindow = function(force) {
        if (force)
            closing = true;
        ipc.send('request', { type: 'close' });
    };

    navigate = function(instanceId) {
        loading = true;
        window.location = window.location.origin + window.location.pathname + '?id=' + instanceId;
    };

    openWindow = function(instanceId) {
        ipc.send('request', { type: 'openWindow', data: instanceId });
    };

    toggleDevTools = function() {
        ipc.send('request', { type: 'openDevTools' });
    };

    const zoomLevels = [ 0.3, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.2, 1.33, 1.5, 1.7, 2.0, 2.4, 3.0 ];
    let zoomLevel = 5;

    zoomIn = function() {
        if (zoomLevel < zoomLevels.length - 1)
            zoom(zoomLevel + 1);
    };

    zoomOut = function() {
        if (zoomLevel > 0)
            zoom(zoomLevel - 1);
    };

    zoom = function(level) {
        zoomLevel = level;
        let zoom = zoomLevels[level];
        webFrame.setLayoutZoomLevelLimits(-999999, 999999);
        webFrame.setZoomFactor(zoom);
        let ezl = webFrame.getZoomLevel();
        webFrame.setLayoutZoomLevelLimits(ezl, ezl);
        emitter.emit('zoom', { zoom: zoom });
    };

    currentZoom = function() {
        return webFrame.getZoomFactor();
    };

    showMessageBox = function(options) {
        return dialog.showMessageBox(browserWindow, options);
    };

    window.onkeydown = function(event) {
        if (navigator.platform === 'MacIntel') {
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
    };

    setEdited = function(edited) {
        browserWindow.setDocumentEdited(edited);
    };

    constructMenu = function(template) {
        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    };

    copyToClipboard = function(data) {
        clipboard.write(data);
    };

    pasteFromClipboard = function() {
        let text = clipboard.readText();
        let html = clipboard.readHTML();
        if (html === text)
            html = '';
        return { text: text, html: html };
    };

    showSaveDialog = dialog.showSaveDialog;

}
else {

    let mainPort = parseInt(window.location.port);

    baseUrl = window.location.protocol + '//' + window.location.hostname + ':' + (mainPort) + '/';
    analysisUIUrl  = window.location.protocol + '//' + window.location.hostname + ':' + (mainPort + 1) + '/';
    resultsViewUrl = window.location.protocol + '//' + window.location.hostname + ':' + (mainPort + 2) + '/';

    openWindow = instanceId => {
        window.location = window.location.origin + '/?id=' + instanceId;
    };
}

module.exports = {
    version,
    baseUrl,
    analysisUIUrl,
    resultsViewUrl,
    isElectron,
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
};
