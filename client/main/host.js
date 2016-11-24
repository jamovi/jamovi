//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

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

    let zoomLevel = 0;

    zoomIn = function() {
        if (zoomLevel < 6)
            zoom(zoomLevel + 1);
    };

    zoomOut = function() {
        if (zoomLevel > -4)
            zoom(zoomLevel - 1);
    };

    zoom = function(amount) {
        zoomLevel = amount;
        webFrame.setLayoutZoomLevelLimits(amount, amount);
        webFrame.setZoomLevel(amount);
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
};

module.exports = Host;
