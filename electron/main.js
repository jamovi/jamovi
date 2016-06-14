
'use strict';

const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const path = require('path');
const ipc = electron.ipcMain;

var instanceId = '';

if (process.argv.length >= 3)
    instanceId = process.argv[2]

if (process.argv.length >= 4)
    global.mainPort = process.argv[3];
if (process.argv.length >= 5)
    global.analysisUIPort = process.argv[4];
if (process.argv.length >= 6)
    global.resultsViewPort = process.argv[5];

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

app.on('ready', function() {

    mainWindow = new BrowserWindow({ width: 1280, height: 800, frame: process.platform !== 'win32' });

    ipc.on('request', function(event, arg) {
        switch (arg) {
        case 'openDevTools':
            mainWindow.webContents.toggleDevTools();
            break;
        case 'close':
            mainWindow.close();
            break;
        case 'minimize':
            mainWindow.minimize();
            break;
        case 'maximize':
            if (mainWindow.isMaximized())
                mainWindow.unmaximize();
            else
                mainWindow.maximize();
            break;
        }

    });

    var rootPath = path.join(__dirname, '..', 'client') + '/';

	// windows path adjustments
	if (rootPath.startsWith('/') === false)
		rootPath = '/' + rootPath;
	rootPath = rootPath.replace(/\\/g, '/');

    var rootUrl = 'file://' + rootPath;
    var serverPath = rootPath + 's/';
    var serverUrl = rootUrl + 's/';

    var url = rootUrl + 'index.html'
    if (instanceId)
        url += '?id=' + instanceId

    mainWindow.loadURL(url);

    var session = mainWindow.webContents.session;
    session.webRequest.onBeforeRequest(function(details, callback) {

        // redirect requests to the local tornado server when appropriate

        var url = details.url;

        if (url.startsWith(serverUrl)) {

            var relative = url.slice(serverUrl.length);
            var newUrl = 'http://localhost:' + global.mainPort + '/' + relative;

            callback({ redirectURL : newUrl });
        }
        else {

            callback({});
        }
    })

    // Emitted when the window is closed.
    mainWindow.on('closed', function() {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
})

app.on('window-all-closed', function() {
    app.quit();
})
