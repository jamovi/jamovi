'use strict';

const $ = require('jquery');

const host = require('./host');

let Coms = require('./coms');
let coms = new Coms();

const TableView   = require('./tableview');
const ResultsView = require('./results');
const SplitPanel  = require('./splitpanel');
const Backstage   = require('./backstage').View;
const BackstageModel = require('./backstage').Model;
const Ribbon      = require('./ribbon').View;
const RibbonModel = require('./ribbon').Model;
const Notifications = require('./notifications');
const SplitPanelSection = require('./splitpanelsection');
const OptionsPanel = require('./optionspanel');
const VariableEditor = require('./variableeditor');
const ActionHub = require('./actionhub');

const Instance = require('./instance');
const Modules = require('./modules');
const Notify = require('./notification');
const JError = require('./errors').JError;

require('./infobox');

const keyboardJS = require('keyboardjs');

keyboardJS.Keyboard.prototype.pause = function(key) {
    if (this._pausedCounts === undefined)
        this._pausedCounts = { };

    this._pausedCounts[key] = true;

    let count = false;
    for (let name in this._pausedCounts) {
        count = this._pausedCounts[name];
        if (count)
            break;
    }

    if (count === true && this._paused === false) {
        if (this._paused) { return; }
        if (this._locale) { this.releaseAllKeys(); }
        this._paused = true;
    }
};

keyboardJS.Keyboard.prototype.resume = function(key) {
    if (this._pausedCounts === undefined)
        this._pausedCounts = { };

    this._pausedCounts[key] = false;

    let count = false;
    for (let name in this._pausedCounts) {
        count = this._pausedCounts[name];
        if (count)
            break;
    }

    if (count === false && this._paused === true) {
        this._paused = false;
    }
};

let instance = new Instance({ coms : coms });

let dataSetModel = instance.dataSetModel();
let analyses = instance.analyses();

let backstageModel = new BackstageModel({ instance: instance });
let modules = new Modules({ instance: instance });
let ribbonModel = new RibbonModel({ modules: modules, settings: instance.settings() });

let infoBox = document.createElement('jmv-infobox');
infoBox.style.display = 'none';

coms.on('failure', (event) => {
    if (host.isElectron) {
        infoBox.setup({
            title: 'Connection lost',
            message: 'An unexpected error has occured, and jamovi must now close.',
            status: 'terminated',
        });
    }
    else {
        infoBox.setup({
            title: 'Connection lost',
            message: 'Your connection has been lost. Please refresh the page to continue.',
            status: 'disconnected',
        });
    }
    infoBox.style.display = null;
});

coms.on('broadcast', (message) => {

    if (message.instanceId === '' &&
        message.payloadType === '' &&
        message.status === coms.Messages.Status.ERROR) {

        let error = message.error;
        infoBox.setup({
            title: 'Server message',
            message: `${ error.message }\n\n${ error.cause }`,
            status: 'terminated',
        });
        infoBox.style.display = null;
    }
});

if (window.navigator.platform === 'MacIntel') {
    host.constructMenu([
        {
            label: 'jamovi',
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'quit' },
            ]
        },
        {
            label: 'File',
            submenu: [
                { role: 'close' },
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ]
        },
    ]);
}

// prevent back navigation
history.pushState(null, null, document.URL);
window.addEventListener('popstate', function () {
    history.pushState(null, null, document.URL);
});


$(document).ready(async() => {

    if (navigator.platform === 'Win32')
        $('body').addClass('windows');
    else if (navigator.platform == 'MacIntel')
        $('body').addClass('mac');
    else
        $('body').addClass('other');

    if (host.isElectron)
        $('body').addClass('electron');

    $(window).on('keydown', function(event) {
        if (event.key === 'F10' || event.keyCode === 121) {
            host.toggleDevTools();
        }
        else if (event.key === 'F9' || event.keyCode === 120) {
            instance.restartEngines();
        }
        else if (event.ctrlKey || event.metaKey) {
            if (event.key === 's')
                ActionHub.get('save').do();
        }
        else if (event.key === 'Escape') {
            optionspanel.hideOptions();
        }
    });

    if (host.isElectron && navigator.platform === 'Win32') {

        $('#close-button').on('click', event => host.closeWindow());
        $('#min-button').on('click', event => host.minimizeWindow());
        $('#max-button').on('click', event => host.maximizeWindow());
    }

    document.oncontextmenu = function() { return false; };

    // note: in linux, as of electron 1.7.9, the drop event is never fired,
    // so we handle the navigate event in the electron app
    document.ondragover = (event) => {
        event.dataTransfer.dropEffect = 'copy';
        event.preventDefault();
    };
    document.ondrop = (event) => {
        for (let file of event.dataTransfer.files)
            instance.open(file.path);
        event.preventDefault();
    };

    let ribbon = new Ribbon({ el : '.silky-ribbon', model : ribbonModel });
    let backstage = new Backstage({ el : '#backstage', model : backstageModel });

    ribbon.on('analysisSelected', function(analysis) {
        instance.createAnalysis(analysis.name, analysis.ns, analysis.title);
    });

    ribbon.on('tabSelected', function(tabName) {
        if (tabName === 'file')
            backstage.activate();
        else if (tabName === 'data')
            optionspanel.hideOptions();
        else if (tabName === 'analyses')
            dataSetModel.set('editingVar', null);
        else if (tabName === 'annotation') {
            instance.set('editState', true);
            if (analyses.count() === 0)
                instance.createHeader();
        }

        if (tabName !== 'annotation')
            instance.set('editState', false);
    });

    let halfWindowWidth = 585 + SplitPanelSection.sepWidth;
    let optionsFixedWidth = 585;
    let splitPanel  = new SplitPanel({el : '#main-view'});

    splitPanel.addPanel('main-table', { minWidth: 90, initialWidth: halfWindowWidth < (optionsFixedWidth + SplitPanelSection.sepWidth) ? (optionsFixedWidth + SplitPanelSection.sepWidth) : halfWindowWidth, level: 1});
    splitPanel.addPanel('main-options', { minWidth: optionsFixedWidth, maxWidth: optionsFixedWidth, preferredWidth: optionsFixedWidth, visible: false, strongEdge: 'right', stretchyEdge: 'left', level: 1 });
    splitPanel.addPanel('results', { minWidth: 150, initialWidth: halfWindowWidth, level: 0 });
    splitPanel.addPanel('help', { minWidth: 30, preferredWidth: 200, visible: false, strongEdge: 'right', level: 1 });

    instance.on('change:selectedAnalysis', function(event) {
        if ('selectedAnalysis' in event.changed) {
            let analysis = event.changed.selectedAnalysis;
            if (analysis !== null && typeof(analysis) !== 'string') {
                analysis.ready.then(function() {
                    if (analysis.hasUserOptions()) {
                        splitPanel.setVisibility('main-options', true);
                        optionspanel.setAnalysis(analysis);
                        if (ribbonModel.get('selectedTab') === 'data')
                            ribbonModel.set('selectedTab', 'analyses');
                    }
                    else
                        optionspanel.hideOptions(false);
                });
            }
            else {
                optionspanel.hideOptions();
            }
        }
    });

    instance.on('change:arbitraryCodePresent', (event) => {
        if ( ! instance.attributes.arbitraryCodePresent)
            return;
        let notif = ribbon.notify({
            text:  `One or more analyses in this data set have been disabled
                    because they allow the execution of arbitrary code. You
                    should only enable them if you trust this data set's
                    source.`,
            options: [
                { name: 'more-info', text: 'More info ...', dismiss: false },
                { name: 'dismiss',   text: "Don't enable" },
                { name: 'enable-code', text: 'Enable' } ]
        });
        // these splitPanel.resized(); should go somewhere else
        splitPanel.resized();
        notif.on('click', (event) => {
            if (event.name === 'enable-code')
                instance.trustArbitraryCode();
            else if (event.name === 'more-info')
                host.openUrl('https://www.jamovi.org/about-arbitrary-code.html');
        });
        notif.on('dismissed', (event) => {
            splitPanel.resized();
        });
    });

    instance.on('moduleInstalled', (event) => {
        optionspanel.reloadAnalyses(event.name);
    });

    let $fileName = $('.header-file-name');
    instance.on('change:title', function(event) {
        if ('title' in event.changed) {
            let title = event.changed.title;
            $fileName.text(title);
            document.title = title;
        }
    });

    let section = splitPanel.getSection('main-options');
    splitPanel.getSection('results').$panel.find('.hideOptions').click(function() {
        splitPanel.setVisibility('main-options', false);
    });

    let helpSection = splitPanel.getSection('help');
    splitPanel.getSection('results').$panel.find('.hideHelp').click(function() {
        splitPanel.setVisibility('help', helpSection.getVisibility() === false);
    });

    splitPanel.render();

    let mainTable   = new TableView({el : '#main-table', model : dataSetModel });

    backstageModel.on('change:activated', function(event) {
        if ('activated' in event.changed)
            mainTable.setActive( ! event.changed.activated);
    });

    let resultsView = new ResultsView({ el : '#results', iframeUrl : host.resultsViewUrl, model : instance });

    resultsView.$el.on('annotationFocus', (event) => {
        if (this._annotationReturnTab === undefined)
            this._annotationReturnTab = null;

        if (this._annotationReturnTab === null) {
            let tab = ribbonModel.get('selectedTab');
            if (tab !== 'annotation')
                this._annotationReturnTab = tab;
        }
        ribbonModel.set('selectedTab', 'annotation');
    });

    resultsView.$el.on('annotationLostFocus', (event) => {
        if (this._annotationReturnTab !== null) {
            ribbonModel.set('selectedTab', this._annotationReturnTab);
            this._annotationReturnTab = null;
        }
    });

    resultsView.$el.on('activeFormatChanged', (event, data) => {
        let annotationsTab = ribbonModel.getTab('annotation');
        annotationsTab.clearValues();

        let alignmentSet = false;

        let formats = data.formats;

        if (data.type === 'heading') {
            ActionHub.get('textBold').set('enabled', false);
            ActionHub.get('textUnderline').set('enabled', false);
            ActionHub.get('textItalic').set('enabled', false);
            ActionHub.get('textStrike').set('enabled', false);
            ActionHub.get('textSubScript').set('enabled', false);
            ActionHub.get('textSuperScript').set('enabled', false);
            ActionHub.get('textCodeBlock').set('enabled', false);
            ActionHub.get('textH2').set('enabled', false);
            ActionHub.get('textListOrdered').set('enabled', false);
            ActionHub.get('textListBullet').set('enabled', false);
            ActionHub.get('textAlignCenter').set('enabled', false);
            ActionHub.get('textAlignJustify').set('enabled', false);
            ActionHub.get('textAlignRight').set('enabled', false);
            ActionHub.get('textAlignLeft').set('enabled', false);
            ActionHub.get('textLink').set('enabled', false);
            ActionHub.get('textFormula').set('enabled', false);
            ActionHub.get('textIndentLeft').set('enabled', false);
            ActionHub.get('textIndentRight').set('enabled', false);
            ActionHub.get('textColor').set('enabled', false);
            ActionHub.get('textBackColor').set('enabled', false);

            return;
        }
        else {
            ActionHub.get('textBold').set('enabled', true);
            ActionHub.get('textUnderline').set('enabled', true);
            ActionHub.get('textItalic').set('enabled', true);
            ActionHub.get('textStrike').set('enabled', true);
            ActionHub.get('textSubScript').set('enabled', true);
            ActionHub.get('textSuperScript').set('enabled', true);
            ActionHub.get('textCodeBlock').set('enabled', true);
            ActionHub.get('textH2').set('enabled', true);
            ActionHub.get('textListOrdered').set('enabled', true);
            ActionHub.get('textListBullet').set('enabled', true);
            ActionHub.get('textAlignCenter').set('enabled', true);
            ActionHub.get('textAlignJustify').set('enabled', true);
            ActionHub.get('textAlignRight').set('enabled', true);
            ActionHub.get('textAlignLeft').set('enabled', true);
            ActionHub.get('textLink').set('enabled', true);
            ActionHub.get('textFormula').set('enabled', true);
            ActionHub.get('textIndentLeft').set('enabled', true);
            ActionHub.get('textIndentRight').set('enabled', true);
            ActionHub.get('textColor').set('enabled', true);
            ActionHub.get('textBackColor').set('enabled', true);
        }

        let button = null;
        for (let name in formats) {
            switch (name) {
                case 'bold':
                    button = annotationsTab.getItem('textBold');
                    button.setValue(formats[name]);
                    break;
                case 'underline':
                    button = annotationsTab.getItem('textUnderline');
                    button.setValue(formats[name]);
                    break;
                case 'italic':
                    button = annotationsTab.getItem('textItalic');
                    button.setValue(formats[name]);
                    break;
                case 'strike':
                    button = annotationsTab.getItem('textStrike');
                    button.setValue(formats[name]);
                    break;
                case 'script':
                    if (formats[name] === 'sub') {
                        button = annotationsTab.getItem('textSubScript');
                        button.setValue(true);
                    }
                    else if (formats[name] === 'super') {
                        button = annotationsTab.getItem('textSuperScript');
                        button.setValue(true);
                    }
                    break;
                case 'code-block':
                    button = annotationsTab.getItem('textCodeBlock');
                    button.setValue(formats[name]);
                    break;
                case 'header':
                    if (formats[name] === 2) {
                        button = annotationsTab.getItem('textH2');
                        button.setValue(true);
                    }
                    break;
                case 'list':
                    if (formats[name] === 'ordered') {
                        button = annotationsTab.getItem('textListOrdered');
                        button.setValue(true);
                    }
                    else if (formats[name] === 'bullet') {
                        button = annotationsTab.getItem('textListBullet');
                        button.setValue(true);
                    }
                    break;
                case 'align':
                    alignmentSet = true;
                    if (formats[name] === 'center') {
                        button = annotationsTab.getItem('textAlignCenter');
                        button.setValue(true);
                    }
                    else if (formats[name] === 'right') {
                        button = annotationsTab.getItem('textAlignRight');
                        button.setValue(true);
                    }
                    else if (formats[name] === 'justify') {
                        button = annotationsTab.getItem('textAlignJustify');
                        button.setValue(true);
                    }
                    break;
            }

        }

        if (alignmentSet === false) {
            button = annotationsTab.getItem('textAlignLeft');
            button.setValue(true);
        }
    });

    let optionspanel = new OptionsPanel({ el : '#main-options', iframeUrl : host.analysisUIUrl, model : instance });
    optionspanel.setDataSetModel(dataSetModel);
    optionspanel.$el.on('splitpanel-hide', () =>  window.focus() );

    let editor = new VariableEditor({ el : '#variable-editor', model : dataSetModel });
    editor.$el[0].addEventListener('transitionend', () => { splitPanel.resized(); }, false);
    editor.on('visibility-changing', value => {
        if (value === false) {
            let height = parseFloat(splitPanel.$el.css('height'));
            splitPanel.resized({ height: height + 200 });
        }
    });


    let notifications = new Notifications($('#notifications'));
    instance.on( 'notification', note => notifications.notify(note));
    mainTable.on('notification', note => notifications.notify(note));
    ribbon.on('notification', note => notifications.notify(note));
    editor.on('notification', note => notifications.notify(note));
    backstageModel.on('notification', note => notifications.notify(note));

    dataSetModel.on('change:edited', event => {
        host.setEdited(dataSetModel.attributes.edited);
    });

    host.on('close', event => {
        if (dataSetModel.attributes.edited) {
            let response = host.showMessageBox({
                type: 'question',
                buttons: [ 'Save', 'Cancel', "Don't Save" ],
                defaultId: 1,
                message: "Save changes to '" + instance.attributes.title + "'?",
            });
            if (response === 1) {  // Cancel
                event.preventDefault();
            }
            else if (response === 0) {  // Save
                event.preventDefault();
                backstageModel.externalRequestSave()
                    .then(() => host.closeWindow(true));
            }
        }
    });

    document.body.appendChild(infoBox);

    let toOpen = '';  // '' denotes blank data set

    let progNotif = new Notify({
        title: 'Opening',
        duration: 0
    });

    try {

        await coms.ready;

        let instanceId;
        let match = /\/([a-z0-9-]+)\/$/.exec(window.location.pathname);
        if (match)
            instanceId = match[1];

        if (window.location.search.indexOf('?open=') !== -1) {
            toOpen = `${ window.location.search }${ window.location.hash }`.split('?open=')[1];
            if (toOpen.startsWith('http://') || toOpen.startsWith('https://'))
                ; // do nothing
            else
                toOpen = decodeURI(toOpen);
        }

        const notify = (progress) => {
            progNotif.set({
                title: progress.title,
                progress: progress.progress,
            });
            notifications.notify(progNotif);
        };

        let status;

        try {
            let stream = instance.open(toOpen, { existing: !!instanceId });
            if (toOpen !== '') {
                // only display progress if opening a file
                for await (let progress of stream)
                    notify(progress);
            }
            status = await stream;
        }
        catch (e) {
            if (host.isElectron && toOpen !== '') {
                // if opening fails, open a blank data set
                status = await instance.open('', { existing: !!instanceId });
                notifications.notify(new Notify({
                    title: 'Unable to open',
                    message: e.cause || e.message,
                    type: 'error',
                    duration: 3000,
                }));
            }
            else {
                throw e;
            }
        }

        if ('url' in status)
            history.replaceState({}, '', `${host.baseUrl}${status.url}`);

        if (status.message || status.title || status['message-src'])
            infoBox.setup(status);

        instanceId = /\/([a-z0-9-]+)\/$/.exec(window.location.pathname)[1];
        await instance.connect(instanceId);

        progNotif.dismiss();
    }
    catch (e) {

        progNotif.dismiss();

        if (e instanceof JError) {
            infoBox.setup({
                title: e.message,
                message: e.cause,
                status: e.status,
                'message-src': e.messageSrc,
            });
        }
        else {
            if (e.message)
                console.log(e.message);
            else
                console.log(e);

            infoBox.setup({
                title: 'Connection failed',
                message: 'Unable to connect to the server',
                status: 'disconnected',
            });
        }

        infoBox.style.display = null;
        await new Promise((resolve, reject) => { /* never */ });
    }

    if (instance.get('blank') && instance.analyses().count() === 0)
        resultsView.showWelcome();

});
