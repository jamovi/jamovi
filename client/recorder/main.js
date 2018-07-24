
'use strict';

const $ = require('jquery');

const remote = window.require('electron').remote;

const thisContents = remote.getCurrentWebContents();
const thisWindow = remote.getCurrentWindow();
const BrowserWindow = remote.BrowserWindow;

const app = remote.app;
const dialog = remote.dialog;
const fs = window.require('fs');
const path = require('path');

const capture = require('./capture');

// thisContents.openDevTools();
// thisWindow.setFocusable(true);

// thisWindow.setSize(320, 220);


let savePath = app.getPath('documents');
let saving = false;
let currentWindowId;
let currentWindow = null;

let $title;
let $windowWidth;
let $windowHeight;
let $browse;
let $path;
let $prompt;
let $record;

$(document).ready(() => {

    $title = $('#title');
    $path = $('#path');
    $browse = $('#browse');
    $record = $('#record');
    $prompt = $('#prompt');

    $windowWidth = $('#win-width');
    $windowHeight = $('#win-height');

    setPath(savePath);

    $browse.on('click', (event) => {
        let pth = dialog.showOpenDialog(
            thisWindow,
            {
                title: 'Media location',
                properties: [
                    'openDirectory',
                    'createDirectory',
                    'promptToCreate',
                ]
            });
        if (pth !== undefined)
            setPath(pth[0]);
    });

    $record.on('click', (event) => {
        if (currentWindow === null)
            return;

        if (saving)
            return;

        $record.text('...');
        $record.addClass('saving');
        saving = true;

        let screenshot;
        let saveFilePath;

        capture.takeScreenshot(currentWindow).then((ss) => {

            // the capture process requires determining the window
            // to capture from the title. so we change the title,
            // grab the window by this title, then change it back.
            // this seems to bring that window to the front on
            // linux, so here we bring the capture window back to
            // the front: *shrugs*.
            if (navigator.platform.startsWith('Linux'))
                thisWindow.focus();

            screenshot = ss;

            let prompt = $prompt.is(':checked');

            if (prompt) {
                return new Promise((resolve, reject) => {
                    let options = {
                        title: 'Save Screenshot',
                        defaultPath: savePath,
                        filters: [
                            { name: 'png', extensions: [ 'png' ] }
                        ],
                    };
                    dialog.showSaveDialog(thisWindow, options, (filePath) => {
                        if (filePath) {
                            saveFilePath = filePath;
                            resolve();
                        }
                        else {
                            reject('cancelled');
                        }
                    });
                });
            }
            else {
                let timeZoneOffset = new Date().getTimezoneOffset() * 60000;
                let name = new Date(new Date() - timeZoneOffset).toISOString();
                name = name.slice(0, 19);
                name = name.replace('T', ' ');
                name = name.replace(/\:/g, '.');
                name = name + '.png';
                saveFilePath = path.join(savePath, name);
            }

        }).then(() => {

            return new Promise((resolve, reject) => {
                fs.writeFile(saveFilePath, screenshot, (error) => {
                    if (error)
                        reject(error);
                    resolve();
                });
            });

        }).then(() => {

            return new Promise((resolve) => {
                $record.text('Saved');
                setTimeout(resolve, 300);
            });

        }).then(() => {

            saving = false;
            $record.removeClass('saving');

        }).catch((err) => {

            console.log(err);
            saving = false;
            $record.removeClass('saving');
        });
    });
});


function setPath(pth) {
    savePath = pth;
    let base;
    if (navigator.platform === 'Win32')
        base = pth.substring(pth.lastIndexOf('\\')+1);
    else
        base = path.basename(pth);
    $path.text(base);
}

function windowClosedHandler() {
    let winds = BrowserWindow.getAllWindows();
    winds = winds.filter((w) => w !== currentWindow && w !== thisWindow);

    if (winds.length > 0) {
        setCurrentWindow(winds[0]);
    }
    else {
        currentWindowId = -1;
        currentWindow = null;
        $title.text('None');
    }
}

function windowTitleChangedHandler(event, title) {
    $title.text(title);
}

function windowResizedHandler(event) {
    let size = event.sender.getSize();
    $windowWidth.text('' + size[0]);
    $windowHeight.text('' + size[1]);
}

function setCurrentWindow(wind) {
    if (currentWindow !== null) {
        currentWindow.removeListener('closed', windowClosedHandler);
        currentWindow.removeListener('page-title-updated', windowTitleChangedHandler);
        currentWindow.removeListener('resize', windowResizedHandler);
    }

    currentWindow = wind;
    currentWindowId = wind.id;

    windowTitleChangedHandler({ sender: currentWindow }, currentWindow.getTitle());
    windowResizedHandler({ sender: currentWindow });

    currentWindow.on('page-title-updated', windowTitleChangedHandler);
    currentWindow.on('resize', windowResizedHandler);
    currentWindow.once('closed', windowClosedHandler);
}

window.notifyCurrentWindowChanged = function(id) {
    if (id !== currentWindowId)
        setCurrentWindow(BrowserWindow.fromId(id));
};

/*$(window).on('keydown', event => {
    if (event.keyCode === 121)  // F10
        thisContents.toggleDevTools();
    else if (event.keyCode === 82 && (event.metaKey || event.ctrlKey)) // ctrl+r
        location.reload();
    else if (event.keyCode === 116)  // F5
        location.reload();
});*/
