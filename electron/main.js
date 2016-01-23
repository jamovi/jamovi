'use strict';
const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const path = require('path')

if (process.argv.length >= 3)
    global.port = process.argv[2]

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

app.on('ready', function() {

    // Create the browser window.
    mainWindow = new BrowserWindow({ width: 800, height: 1200 });

    // and load the index.html of the app.
    mainWindow.loadURL('file://' + path.join(__dirname, '..', 'client/index.html'));

    // Open the DevTools.
    mainWindow.webContents.openDevTools();

    // Emitted when the window is closed.
    mainWindow.on('closed', function() {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    })
})

app.on('window-all-closed', function() {
    app.quit()
})
