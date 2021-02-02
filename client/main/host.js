//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const events = require('events');
const dialogs = require('dialogs');
const $ = require('jquery');

const { CancelledError } = require('./errors');

const APP_NAME = 'jamovi';

let baseUrl;
let analysisUIUrl;
let resultsViewUrl;

let isElectron;
let version;
let nameAndVersion;
let dialogProvider;

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
let showOpenDialog = doNothing;
let openUrl = doNothing;
let openRecorder = doNothing;
let triggerDownload = doNothing;
let setDialogProvider = (provider) => { dialogProvider = provider; };

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

if (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1) {

    isElectron = true;

    const electron = window.require('electron');
    const remote = electron.remote;
    const webFrame = electron.webFrame;
    const browserWindow = remote.getCurrentWindow();
    const webContents = browserWindow.webContents;
    const dialog = remote.dialog;
    const Menu = remote.Menu;
    const clipboard = electron.clipboard;
    const nativeImage = electron.nativeImage;
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
        window.location = `${ window.location.origin }/${ instanceId }/`;
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

    };

    currentZoom = function() {
        return parseInt(100 * webFrame.getZoomFactor());
    };

    showMessageBox = function(options) {
        return (dialog.showMessageBoxSync || dialog.showMessageBox)(browserWindow, options);
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
        if ('image' in data)
            data.image = nativeImage.createFromDataURL(data.image);
        clipboard.write(data);
        return Promise.resolve();
    };

    pasteFromClipboard = function() {
        let text = clipboard.readText();
        let html = clipboard.readHTML();
        if (html === text)
            html = '';
        return { text: text, html: html };
    };

    showSaveDialog = async (options) => {
        let selection = await dialogProvider.showDialog('export', options);
        // On linux we don't get an extension, so here we add the default one
        // https://github.com/electron/electron/issues/21935
        let hasExtension = /\.[^\/\\]+$/.test(selection.filePath);
        if (hasExtension === false && options.filters) {
            let defaultExt = options.filters[0].extensions[0];
            selection.filePath = `${ selection.filePath }.${ defaultExt }`;
        }
        return selection;
    };


}
else {

    isElectron = false;

    let mainPort = window.location.port;
    if (mainPort) {
        mainPort = parseInt(mainPort);
        baseUrl = `${ window.location.protocol }//${ window.location.hostname }:${ mainPort }/`;
        analysisUIUrl  = `${ window.location.protocol }//${ window.location.hostname }:${ mainPort + 1 }/`;
        resultsViewUrl = `${ window.location.protocol }//${ window.location.hostname }:${ mainPort + 2 }/`;
    }
    else {
        baseUrl = `${ window.location.protocol }//${ window.location.hostname }/`;
        analysisUIUrl  = `${ window.location.protocol }//a.${ window.location.hostname }/`;
        resultsViewUrl = `${ window.location.protocol }//r.${ window.location.hostname }/`;
    }

    openWindow = (instanceId) => {
        window.open(`${ window.location.origin }/${ instanceId }/`, '_blank');
    };

    closeWindow = () => {
        window.close();
        if ( ! window.closed)
            window.location = baseUrl;
    };

    navigate = (instanceId) => {
        window.location = `${ window.location.origin }/${ instanceId }/`;
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

    require('./utils/clipboardprompt');
    let clipboardPromptBox;
    let clipboardPrompt;

    copyToClipboard = async (data) => {

        /*if (navigator.clipboard && navigator.clipboard.write) {

            let transfer = new DataTransfer();

            return Promise.resolve().then(() => {
                if (data.html)
                    transfer.items.add('text/html', data.html);
                if (data.text)
                    transfer.items.add('text/plain', data.text);
                if (data.image)
                    return fetch(data.image)
                        .then(res => res.blob())
                        .then(blob => transfer.items.add(blob));
            }).then(() => {
                return navigator.clipboard.write(transfer);
            });
        }
        else*/ {
            if ( ! clipboardPromptBox) {
                clipboardPromptBox = document.createElement('jmv-infobox');
                document.body.appendChild(clipboardPromptBox);
            }

            if ( ! clipboardPrompt)
                clipboardPrompt = document.createElement('jmv-clipboardprompt');

            clipboardPromptBox.setup(clipboardPrompt);

            try {
                await clipboardPrompt.copy(data);
                clipboardPromptBox.hide();
            }
            catch (e) {
                clipboardPromptBox.hide();
                throw e;
            }
        }
    };

    pasteFromClipboard = () => {
        // should do something
    };

    showOpenDialog = async(_, options) => {
        if (options === undefined)
            options = _;

        if ( ! showOpenDialog.browser) {
            showOpenDialog.browser = document.createElement('input');
            showOpenDialog.browser.setAttribute('type', 'file');
            showOpenDialog.browser.style.display = 'none';
            document.body.appendChild(showOpenDialog.browser);
        }
        if (showOpenDialog.cancelPrevious)
            showOpenDialog.cancelPrevious(new CancelledError());

        let ua = window.navigator.userAgent;
        let iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
        let exts;

        if (options.filters) {
            exts = options.filters;
            exts = exts.map(format => format.extensions);
            exts = exts.reduce((a, v) => a.concat(v), []);
            exts = exts.map((ext) => '.' + ext);

            // iOS safari and iOS chrome don't support the extension format
            // https://caniuse.com/input-file-accept
            if ( ! iOS)
                showOpenDialog.browser.setAttribute('accept', exts.join(','));

        } else {
            showOpenDialog.browser.removeAttribute('accept');
        }

        let files = await new Promise((resolve, reject) => {
            showOpenDialog.browser.click();
            showOpenDialog.cancelPrevious = reject;
            showOpenDialog.browser.addEventListener('change', function(event) {
                delete showOpenDialog.cancelPrevious;
                resolve(this.files);
            }, { once: true }, false);
        });

        // the calling function doesn't handle exceptions, and requires a bit
        // of work to handle them correctly, so i've disabled the following
        // check for the time being. a check is also performed by the server,
        // so it will get picked up there.

        // if (exts) {
        //     for (let file of files) {
        //         let ok = false;
        //         for (let ext of exts) {
        //             if (file.name.endsWith(ext)) {
        //                 ok = true;
        //                 break;
        //             }
        //         }
        //         if ( ! ok)
        //             throw new Error('Unrecognised file format')
        //     }
        // }

        return files;
    };

    triggerDownload = async(url) => {
        if ( ! triggerDownload.iframe) {
            triggerDownload.iframe = document.createElement('iframe');
            triggerDownload.iframe.style.display = 'none';
            document.body.appendChild(triggerDownload.iframe);
        }
        triggerDownload.iframe.src = url;
    };

    showSaveDialog = async (options) => {
        return await dialogProvider.showDialog('export', options);
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
    showOpenDialog,
    os,
    openUrl,
    openRecorder,
    triggerDownload,
    setDialogProvider
};
