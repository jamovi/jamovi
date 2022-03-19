//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

// when running in electron, you'll see that module.exports is assigned from
// window.host (down the bottom of this file)

const events = require('events');
const $ = require('jquery');


const APP_NAME = 'jamovi';

let baseUrl;
let analysisUIUrl;
let resultsViewUrl;

let hostname = window.location.hostname;

if (/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(hostname)) {
    let port = parseInt(window.location.port || '80');
    baseUrl = `${ window.location.protocol }//${ hostname }:${ port }/`;
    analysisUIUrl  = `${ window.location.protocol }//${ hostname }:${ port + 1 }/`;
    resultsViewUrl = `${ window.location.protocol }//${ hostname }:${ port + 2 }/`;
}
else {
    let port = (window.location.port ? ':' + window.location.port : '');
    baseUrl = `${ window.location.protocol }//${ hostname }${ port }/`;
    analysisUIUrl  = `${ window.location.protocol }//a.${ hostname }${ port }/`;
    resultsViewUrl = `${ window.location.protocol }//r.${ hostname }${ port }/`;
}


let dialogProvider;

let emitter = new events.EventEmitter();

let on = (name, args) => emitter.on(name, args);
let _notify = (name, args) => emitter.emit(name, args);

let os;
if (['iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod',
        ].includes(navigator.platform)
        // iPad on iOS 13 detection
        || (navigator.userAgent.includes('Mac') && 'ontouchend' in document))
    os = 'ios';
else if (navigator.platform === 'Win32')
    os = 'win64';
else if (navigator.platform === 'MacIntel')
    os = 'macos';
else if (navigator.platform.startsWith('Linux'))
    os = 'linux';
else
    os = 'other';

function openWindow(instanceId) {
    window.open(`${ window.location.origin }/${ instanceId }/`, '_blank');
}

function closeWindow() {
    window.close();
    if ( ! window.closed)
        window.location = baseUrl;
}

function navigate(instanceId) {
    window.location = `${ window.location.origin }/${ instanceId }/`;
}

const version = new Promise((resolve, reject) => {
    $.ajax('/version', { dataType: 'text'})
        .done(data => resolve(data.trim()))
        .fail(reject);
});

const nameAndVersion = version.then(version => {
    return APP_NAME + ' ' + version;
});

function currentZoom() {
    return 100;
}

require('./utils/clipboardprompt');
let clipboardPromptBox;
let clipboardPrompt;

async function copyToClipboard(data) {

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
}

function pasteFromClipboard() {
    // should do something?
}

async function showOpenDialog(options) {

    if ( ! showOpenDialog.browser) {
        showOpenDialog.browser = document.createElement('input');
        showOpenDialog.browser.setAttribute('type', 'file');
        showOpenDialog.browser.style.display = 'none';
        document.body.appendChild(showOpenDialog.browser);
    }
    if (showOpenDialog.cancelPrevious)
        showOpenDialog.cancelPrevious();

    let exts;
    // iOS safari and iOS chrome don't support the extension format
    // https://caniuse.com/input-file-accept
    if (options.filters && os !== 'ios') {
        exts = options.filters;
        exts = exts.map(format => format.extensions);
        exts = exts.reduce((a, v) => a.concat(v), []);
        exts = exts.map((ext) => '.' + ext);
        showOpenDialog.browser.setAttribute('accept', exts.join(','));
    }
    else {
        showOpenDialog.browser.removeAttribute('accept');
    }

    let result = await new Promise((resolve, reject) => {
        showOpenDialog.browser.click();
        showOpenDialog.cancelPrevious = () => resolve({ cancelled: true });
        showOpenDialog.browser.addEventListener('change', function(event) {
            delete showOpenDialog.cancelPrevious;
            resolve({ cancelled: false, files: this.files });
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

    return result;
}

async function triggerDownload(url) {
    if ( ! triggerDownload.iframe) {
        triggerDownload.iframe = document.createElement('iframe');
        triggerDownload.iframe.style.display = 'none';
        document.body.appendChild(triggerDownload.iframe);
    }
    triggerDownload.iframe.src = url;
}

function setDialogProvider(provider) {
    dialogProvider = provider;
}

async function showSaveDialog(options) {
    return await dialogProvider.showDialog('export', options);
}

function setEdited() {
    // do nothing, is implemented for electron
}

function openUrl() {

}

function constructMenu() {

}

module.exports = window.host || {
    isElectron: false,
    version,
    nameAndVersion,
    baseUrl,
    analysisUIUrl,
    resultsViewUrl,
    closeWindow,
    openWindow,
    currentZoom,
    on,
    setEdited,
    navigate,
    constructMenu,
    copyToClipboard,
    pasteFromClipboard,
    showSaveDialog,
    showOpenDialog,
    os,
    openUrl,
    triggerDownload,
    setDialogProvider
};
