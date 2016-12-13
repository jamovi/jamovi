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

let emitter = new events.EventEmitter();

let on = (name, args) => emitter.on(name, args);
let _notify = (name, args) => emitter.emit(name, args);

if (window.require) {

    isElectron = true;

    const electron = window.require('electron');
    const remote = electron.remote;
    const webFrame = electron.webFrame;

    baseUrl = 'http://localhost:' + remote.getGlobal('mainPort') + '/';
    analysisUIUrl  = 'http://localhost:' + remote.getGlobal('analysisUIPort') + '/';
    resultsViewUrl = 'http://localhost:' + remote.getGlobal('resultsViewPort') + '/';

    const ipc = electron.ipcRenderer;

    minimizeWindow = function() {
        ipc.send('request', { type: 'minimize' });
    };

    maximizeWindow = function() {
        ipc.send('request', { type: 'maximize' });
    };

    closeWindow = function() {
        ipc.send('request', { type: 'close' });
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

const Host = {
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
};

module.exports = Host;
