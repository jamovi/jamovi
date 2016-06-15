
'use strict';

const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const path = require('path');
const ipc = electron.ipcMain;
const _ = require('underscore');

var instanceId = '';

if (process.argv.length >= 3)
    instanceId = process.argv[2]

if (process.argv.length >= 4)
    global.mainPort = process.argv[3];
if (process.argv.length >= 5)
    global.analysisUIPort = process.argv[4];
if (process.argv.length >= 6)
    global.resultsViewPort = process.argv[5];

let windows = [ ];

var rootPath = path.join(__dirname, '..', 'client') + '/';

// windows path adjustments
if (rootPath.startsWith('/') === false)
    rootPath = '/' + rootPath;
rootPath = rootPath.replace(/\\/g, '/');

var rootUrl = 'file://' + rootPath;
var serverPath = rootPath + 's/';
var serverUrl = rootUrl + 's/';

app.on('window-all-closed', function() {
    app.quit();
});

app.on('ready', function() {

    createWindow(instanceId);

    // handle requests sent from the browser instances
    ipc.on('request', function(event, arg) {

        // locate the sender
        var wind = null;
        for (var i = 0; i < windows.length; i++) {
            wind = windows[i];
            if (wind.webContents === event.sender)
                break;
        }

        var eventType = arg.type;
        var eventData = arg.data;

        switch (eventType) {
            case 'openDevTools':
                wind.webContents.toggleDevTools();
                break;
            case 'openWindow':
                createWindow(eventData);
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
        }
    });
});

var createWindow = function(instanceId) {

    var wind = new BrowserWindow({ width: 1280, height: 800, frame: process.platform !== 'win32' });
    windows.push(wind);

    var url = rootUrl + 'index.html';
    if (instanceId)
        url += '?id=' + instanceId;

    wind.loadURL(url);

    var requests = wind.webContents.session.webRequest;
    requests.onBeforeRequest(function(details, callback) {
        // redirect requests to the local tornado server when appropriate
        var url = details.url;
        if (url.startsWith(serverUrl)) {
            var relative = url.slice(serverUrl.length);
            var newUrl = 'http://localhost:' + global.mainPort + '/' + relative;
            callback({ redirectURL : newUrl });  // redirect
        }
        else {
            callback({});  // don't redirect
        }
    });

    wind.on('closed', function() {
        windows = _.without(windows, wind);
    });
};
