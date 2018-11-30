//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const events = require('events');
const dialogs = require('dialogs');
const $ = require('jquery');

const APP_NAME = 'jamovi';

let baseUrl;
let analysisUIUrl;
let resultsViewUrl;

let isElectron;
let version;
let nameAndVersion;

let doNothing = () => {};

let openWindow = doNothing;
let toggleDevTools = doNothing;
let minimizeWindow = doNothing;
let maximizeWindow = doNothing;
let closeWindow = doNothing;
let zoom = doNothing;
let zoomIn = doNothing;
let zoomOut = doNothing;
let currentZoom = doNothing;
let setEdited = doNothing;
let showMessageBox = doNothing;
let navigate = doNothing;
let constructMenu = doNothing;
let copyToClipboard = doNothing;
let pasteFromClipboard = doNothing;
let showSaveDialog = doNothing;
let openUrl = doNothing;
let openRecorder = doNothing;

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
    const shell = electron.shell;

    version = Promise.resolve(remote.getGlobal('version'));
    nameAndVersion = Promise.resolve(APP_NAME + ' ' + remote.getGlobal('version'));
    baseUrl = 'http://127.0.0.1:' + remote.getGlobal('mainPort') + '/';
    analysisUIUrl  = 'http://127.0.0.1:' + remote.getGlobal('analysisUIPort') + '/';
    resultsViewUrl = 'http://127.0.0.1:' + remote.getGlobal('resultsViewPort') + '/';

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

    openRecorder = function() {
        // we send the parent so it can be the first window for recording
        ipc.send('request', { type: 'openRecorder', data: browserWindow.id });
    };

    openUrl = function(url) {
        shell.openExternal(url);
    };

    const zoomLevels = [ 30, 50, 67, 80, 90, 100, 110, 120, 133, 150, 170, 200, 240, 300 ];
    let zoomLevel = 5;

    zoomIn = function() {
        if (zoomLevel < zoomLevels.length - 1) {
            zoomLevel++;
            let z = zoomLevels[zoomLevel];
            zoom(z);
        }
    };

    zoomOut = function() {
        if (zoomLevel > 0) {
            zoomLevel--;
            let z = zoomLevels[zoomLevel];
            zoom(z);
        }
    };

    zoom = function(z) {
        zoomLevel = zoomLevels.indexOf(z);
        if (zoomLevel === -1) {
            zoomLevel = 5;
            z = 100;
        }
        webFrame.setLayoutZoomLevelLimits(-999999, 999999);
        webFrame.setZoomFactor(z / 100);
        let ezl = webFrame.getZoomLevel();
        webFrame.setLayoutZoomLevelLimits(ezl, ezl);
    };

    currentZoom = function() {
        return parseInt(100 * webFrame.getZoomFactor());
    };

    showMessageBox = function(options) {
        return dialog.showMessageBox(browserWindow, options);
    };

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

    showSaveDialog = (options, callback) => {
        return dialog.showSaveDialog(browserWindow, options, callback);
    };


}
else {

    let mainPort = parseInt(window.location.port);

    baseUrl = window.location.protocol + '//' + window.location.hostname + ':' + (mainPort) + '/';
    analysisUIUrl  = window.location.protocol + '//' + window.location.hostname + ':' + (mainPort + 1) + '/';
    resultsViewUrl = window.location.protocol + '//' + window.location.hostname + ':' + (mainPort + 2) + '/';

    openWindow = (instanceId) => {
        window.open(window.location.origin + '/?id=' + instanceId, '_blank');
    };
    closeWindow = () => {
        window.close();
    };
    navigate = (instanceId) => {
        window.location = window.location.origin + window.location.pathname + '?id=' + instanceId;
    };

    version = new Promise((resolve, reject) => {
        $.ajax('/version', { dataType: 'text'})
            .done(data => resolve(data.trim()))
            .fail(reject);
    });

    nameAndVersion = version.then(version => {
        return APP_NAME + ' ' + version;
    });

    currentZoom = () => 100;

    copyToClipboard = () => {
        // should do something
    };

    pasteFromClipboard = () => {
        // should do something
    };
}

module.exports = {
    version,
    nameAndVersion,
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
    os,
    openUrl,
    openRecorder,
};
