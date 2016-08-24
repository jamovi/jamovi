//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

let mainPort;
let analysisUIPort;
let resultsViewPort;

let baseUrl;
let isElectron;

let openWindow;
let toggleDevTools;
let minimizeWindow;
let maximizeWindow;
let closeWindow;

if (window.location.protocol === 'file:') {

    isElectron = true;

    const electron = window.require('electron');

    const remote = electron.remote;
    mainPort = remote.getGlobal('mainPort');
    analysisUIPort = remote.getGlobal('analysisUIPort');
    resultsViewPort = remote.getGlobal('resultsViewPort');

    if (typeof(mainPort) !== 'undefined')
        baseUrl = 'localhost:' + mainPort;

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

}

const Host = {
    baseUrl,
    mainPort,
    analysisUIPort,
    resultsViewPort,
    isElectron,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    openWindow,
    toggleDevTools,
};

module.exports = Host;
