
'use strict';

const $ = require('jquery');

const remote = window.require('electron').remote;

let webContents = remote.getCurrentWebContents();
let currentWindow = remote.getCurrentWindow();

currentWindow.setSize(400, 300);

let streams = { };

$(document).ready(() => {

});

$(window).on('keydown', event => {
    if (event.keyCode === 121)  // F10
        webContents.toggleDevTools();
    else if (event.keyCode === 82 && (event.metaKey || event.ctrlKey)) // ctrl+r
        location.reload();
    else if (event.keyCode === 116)  // F5
        location.reload();
});
