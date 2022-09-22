//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

// when running in electron, you'll see that module.exports is assigned from
// window.host (down the bottom of this file)

const events = require('events');
const $ = require('jquery');


const APP_NAME = 'jamovi';

// temp workaround because i set the cache on config.js too long
// will remove once the new config.js has propagated
if ( ! window.config.client) {
    window.config.client = {
        roots: ['cloud.jamovi.org', 'a.cloud.jamovi.org', 'r.cloud.jamovi.org']
    };
}

let baseUrl = `${ window.location.protocol }//${ window.config.client.roots[0] }`;
let analysisUIUrl = `${ window.location.protocol }//${ window.config.client.roots[1] }`;
let resultsViewUrl = `${ window.location.protocol }//${ window.config.client.roots[2] }`;

// add ports if necessary
if (new URL(baseUrl).port === '' && window.location.port !== '')
    baseUrl += `:${ window.location.port }`;
if (new URL(analysisUIUrl).port === '' && window.location.port !== '')
    analysisUIUrl += `:${ window.location.port }`;
if (new URL(resultsViewUrl).port === '' && window.location.port !== '')
    resultsViewUrl += `:${ window.location.port }`;

// add trailing slashes
baseUrl += '/';
analysisUIUrl += '/';
resultsViewUrl += '/';


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
    let url = `${ window.location.origin }/${ instanceId }/`;
    let opened = window.open(url, '_blank');
    // can fail under safari
    if (opened === null)
        _notify('window-open-failed', { url });
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

function pasteFromClipboard() {
    let readFnc = navigator.clipboard.read;
    if (navigator.clipboard.read) {
        return navigator.clipboard.read().then(async (clipboardContents) => {
            let content  = {text:'', html:''};
            for (const item of clipboardContents) {

                if (item.types.includes('text/html')) {
                    const blob = await item.getType('text/html');
                    content.html =  await blob.text();
                }
                if (item.types.includes('text/plain')) {
                    const blob = await item.getType('text/plain');
                    content.text =  await blob.text();
                }

            }
            return content;
        });
    }
    else if (navigator.clipboard.readText) {
        return navigator.clipboard.readText().then(async (text) => {
            return {text: text, html:''};
        });
    }
    else
        return null;
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
