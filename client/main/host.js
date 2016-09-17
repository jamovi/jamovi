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

if (window.require) {

    isElectron = true;

    const electron = window.require('electron');
    const remote = electron.remote;

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
};

module.exports = Host;
