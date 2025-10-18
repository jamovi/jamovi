//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import { Future } from './utils/common';

import events from 'events';

const etron = window.electronAPI || {};

const APP_NAME = 'jamovi';

function resolveUrl(root) {
    let v = `${ window.location.protocol }//${ root }`;
    if (new URL(v).port === '' && window.location.port !== '')
        v += `:${ window.location.port }`;
    v += '/';
    return v;
}

export const baseUrl = resolveUrl(window.config.client.roots[0]);
export const analysisUIUrl = resolveUrl(window.config.client.roots[1]);
export const resultsViewUrl = resolveUrl(window.config.client.roots[2]);


export interface IExtensionGroup {
    description: string,
    extensions: string[]
}

export interface IShowDialogOptions {
    title: string,
    defaultPath: string,
    filters: IExtensionGroup[]
}

export interface IDialogProviderResult {
    cancelled: boolean,
    file?: string
}

export interface IDialogProvider {
    showDialog: (type: string, options: IShowDialogOptions) => Promise<IDialogProviderResult>;
}


let dialogProvider;

const emitter = new events.EventEmitter();

const on = etron.on || ((name, args) => emitter.on(name, args));
let _notify = (name: string, args: WindowOpenFailEvent) => emitter.emit(name, args);

export const os = (function() {
    if (['iPad Simulator',
            'iPhone Simulator',
            'iPod Simulator',
            'iPad',
            'iPhone',
            'iPod',
            ].includes(navigator.platform)
            // iPad on iOS 13 detection
            || (navigator.userAgent.includes('Mac') && 'ontouchend' in document))
        return 'ios';
    else if (navigator.platform === 'Win32')
        return 'win64';
    else if (navigator.platform === 'MacIntel')
        return 'macos';
    else if (navigator.platform.startsWith('Linux'))
        return 'linux';
    else
        return 'other';
})();

export const openWindow = etron.openWindow || function(instanceId) {
    let url = `${ window.location.origin }/${ instanceId }/`;
    let opened = window.open(url, '_blank');
    // can fail under safari
    if (opened === null)
        _notify('window-open-failed', { url });
};

export type WindowOpenFailEvent = {url: string, future?: Future<unknown>}

export async function open(url, target, windowFeatures) {
    let opened = window.open(url, target, windowFeatures);
    // can fail under safari
    if (opened === null) {
        const future = new Future();
        _notify('window-open-failed', { url, future });
        return future;
    }
    else {
        return opened;
    }
}

export const closeWindow = etron.closeWindow || function() {
    window.close();
    if ( ! window.closed)
        window.location = baseUrl;
};

export const navigate = etron.navigate || function(instanceId) {
    window.location = `${ window.location.origin }/${ instanceId }/`;
};

export const version = etron.version || new Promise((resolve, reject) => {
    fetch('/version').then(response => {
        if (!response.ok)
            throw new Error(`HTTP error! status: ${response.status}`);
        return response.text();
    }).then(data => resolve(data.trim())).catch(reject);


    /*$.ajax('/version', { dataType: 'text'})
        .done(data => resolve(data.trim()))
        .fail(reject);*/
});

export const nameAndVersion = etron.nameAndVersion || version.then(version => {
    return APP_NAME + ' ' + version;
});

export const currentZoom = etron.currentZoom || function() {
    return 100;
}

export const zoom    = etron.zoom || function() {};
export const zoomIn  = etron.zoomIn  || function() {};
export const zoomOut = etron.zoomOut || function() {};

import './utils/clipboardprompt';
let clipboardPromptBox;
let clipboardPrompt;

export const copyToClipboard = etron.copyToClipboard || (async function(data) {

    let hasFocus = document.activeElement;
    if ( ! clipboardPromptBox) {
        clipboardPromptBox = document.createElement('jmv-infobox');
        document.body.appendChild(clipboardPromptBox);
    }

    if ( ! clipboardPrompt)
        clipboardPrompt = document.createElement('jmv-clipboardprompt');

    clipboardPromptBox.setup(clipboardPrompt);

    try {
        await clipboardPrompt.copy(data);
    }
    finally {
        clipboardPromptBox.hide();
        if (hasFocus)
            hasFocus.focus();
    }
});

export const setLanguage = etron.setLanguage || (() => {});

export const pasteFromClipboard = etron.pasteFromClipboard || (function() {
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
});

export const showOpenDialog = etron.showOpenDialog || (async function(options) {

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
});

export const showSaveDialogExternal = etron.showSaveDialogExternal || (() => {});

export async function triggerDownload(url) {
    if ( ! triggerDownload.iframe) {
        triggerDownload.iframe = document.createElement('iframe');
        triggerDownload.iframe.style.display = 'none';
        document.body.appendChild(triggerDownload.iframe);
    }
    triggerDownload.iframe.src = url;
}

export const setDialogProvider = etron.setDialogProvider || (function (provider: IDialogProvider) {
    dialogProvider = provider;
});

export const showSaveDialog = etron.showSaveDialog || (async function(options: IShowDialogOptions) {
    return await dialogProvider.showDialog('export', options);
});

export const openUrl = etron.openUrl || ((url) => {
    window.open(url, '_blank');
});

export const showMessageBox = etron.showMessageBox; // || (async () => { });

export const setEdited = etron.setEdited || (() => {});
export const constructMenu = etron.constructMenu || (() => {});
export const toggleDevTools = etron.toggleDevTools || (() => {});

export const isElectron = etron.isElectron || false;

export const maximizeWindow = etron.maximizeWindow || (() => { });
export const minimizeWindow = etron.minimizeWindow || (() => { });

export default {
    isElectron,
    version,
    nameAndVersion,
    baseUrl,
    analysisUIUrl,
    resultsViewUrl,
    closeWindow,
    openWindow,
    open,
    maximizeWindow,
    minimizeWindow,
    currentZoom,
    zoom,
    zoomIn,
    zoomOut,
    on,
    setEdited,
    navigate,
    constructMenu,
    copyToClipboard,
    pasteFromClipboard,
    showOpenDialog,
    showSaveDialog,
    showSaveDialogExternal,
    setLanguage,
    showMessageBox,
    os,
    openUrl,
    triggerDownload,
    setDialogProvider,
    toggleDevTools,
};
