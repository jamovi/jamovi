'use strict';

const $ = require('jquery');

const host = require('./host');

let Coms = require('./coms');
let coms = new Coms();

const Selection = require('./selection');
const ViewController = require('./viewcontroller');
const TableView   = require('./tableview');
const VariablesView   = require('./variablesview');
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
const I18n = require('../common/i18n');

const Instance = require('./instance');
const Notify = require('./notification');
const JError = require('./errors').JError;

window._ = I18n._;
window.n_ = I18n._n;


(async function() {

let url = `../i18n/`;
let code = await (async() => {
    let response = await fetch(url);
    if (response.ok) {
        try {
            let codes = await response.json();
            let code = I18n.findBestMatchingLocale([I18n.locale], codes);
            if (code === 'c')
                code = 'en';
            return code;
        }
        catch (e) {
            return 'en';
        }
    }
    else
        return 'en';
})();

let response = await fetch(`${url}${code}.json`);
if (response.ok) {
    try {
        let def = await response.json();
        I18n.initialise(code, def);
    }
    catch (e) {
        console.log(`Issue loading json for language '${ code }'.`);
    }
}


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
let ribbonModel = new RibbonModel({ modules: instance.modules(), settings: instance.settings() });

// this is passing over a context boundary, so can't pass complex objects
host.setDialogProvider({ showDialog: (op, options) => backstageModel.showDialog(op, options) });

let infoBox = document.createElement('jmv-infobox');
infoBox.style.display = 'none';

coms.on('failure', (event) => {
    if (host.isElectron) {
        infoBox.setup({
            title: _('Connection lost'),
            message: _('An unexpected error has occured, and jamovi must now close.'),
            status: 'terminated',
        });
    }
    else {
        infoBox.setup({
            title: _('Connection lost'),
            message: _('Your connection has been lost. Please refresh the page to continue.'),
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
            label: _('File'),
            submenu: [
                { role: 'close' },
            ]
        },
        {
            label: _('Edit'),
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
    window.$body = $('body');
    if (navigator.platform === 'Win32')
        window.$body.addClass('windows');
    else if (navigator.platform == 'MacIntel')
        window.$body.addClass('mac');
    else
        window.$body.addClass('other');

    if (host.isElectron)
        window.$body.addClass('electron');

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

    let mainTableMode = 'spreadsheet';

    let setMainTableMode = function(mode) {
        window.$body.attr('data-table-mode', mode);
        mainTableMode = mode;
        viewController.focusView(mode);
    };

    ribbon.on('tabSelected', function(tabName) {
        if (tabName === 'file')
            backstage.activate();
        else if (tabName === 'data') {
            setMainTableMode('spreadsheet');
            if (splitPanel.mode === 'results')
                splitPanel.setMode('data', true);
            optionspanel.hideOptions();
        }
        else if (tabName === 'variables') {
            setMainTableMode('variables');
            if (splitPanel.mode === 'results')
                splitPanel.setMode('data', true);
            optionspanel.hideOptions();
        }
        else if (tabName === 'analyses') {
            dataSetModel.set('editingVar', null);
            if (splitPanel.mode === 'data')
                splitPanel.setMode('results', true);
        }
        else if (tabName === 'annotation') {
            resultsView.hideWelcome();
            if (splitPanel.mode === 'data')
                splitPanel.setMode('results', true);
        }

        instance.set('editState', tabName === 'annotation');
    });

    let halfWindowWidth = 585 + SplitPanelSection.sepWidth;
    let optionsFixedWidth = 585;
    let splitPanel  = new SplitPanel({el : '#main-view'});

    splitPanel.$el.on('mode-changed', () => {
        window.$body.attr('data-splitpanel-mode', splitPanel.mode);
        switch (splitPanel.mode) {
            case 'results':
                let tab = ribbonModel.get('selectedTab');
                if (tab !== 'annotation')
                    ribbonModel.set('selectedTab', 'analyses');
                break;
            case 'data':
                if (mainTableMode === 'spreadsheet')
                    ribbonModel.set('selectedTab', 'data');
                else
                    ribbonModel.set('selectedTab', 'variables');
                break;
        }
    });

    ribbon.on('toggle-screen-state', () => {
        if (forcedFullScreen)
            return;

        let tab = ribbonModel.get('selectedTab');
        if (splitPanel.mode === 'mixed') {
            switch (tab) {
                case 'variables':
                case 'data':
                    splitPanel.setMode('data');
                    break;
                case 'analyses':
                case 'annotation':
                    splitPanel.setMode('results');
                    break;

            }
        }
        else
            splitPanel.setMode('mixed');
    });

    splitPanel.addPanel('main-table', { adjustable: true, fixed: false, anchor: 'left' });
    splitPanel.addPanel('main-options', { adjustable: false, fixed: true, anchor: 'right', visible: false });
    splitPanel.addPanel('results', { adjustable: true, fixed: true, anchor: 'right' });

    instance.on('change:selectedAnalysis', function(event) {
        if ('selectedAnalysis' in event.changed) {
            let analysis = event.changed.selectedAnalysis;
            if (analysis !== null && typeof(analysis) !== 'string') {
                dataSetModel.set('editingVar', null);
                if (analysis.hasUserOptions()) {
                    splitPanel.setVisibility('main-options', true);
                    optionspanel.setAnalysis(analysis);
                    if (ribbonModel.get('selectedTab') === 'data' || ribbonModel.get('selectedTab') === 'variables')
                        ribbonModel.set('selectedTab', 'analyses');
                }
                else
                    optionspanel.hideOptions(false);
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
            text:  _(`One or more analyses in this data set have been disabled
                    because they allow the execution of arbitrary code. You
                    should only enable them if you trust this data set's
                    source.`),
            options: [
                { name: 'more-info', text: _('More info ...'), dismiss: false },
                { name: 'dismiss',   text: _("Don't enable") },
                { name: 'enable-code', text: _('Enable') } ]
        });

        notif.on('click', (event) => {
            if (event.name === 'enable-code')
                instance.trustArbitraryCode();
            else if (event.name === 'more-info')
                host.openUrl('https://www.jamovi.org/about-arbitrary-code.html');
        });
    });

    instance.on('moduleInstalled', (event) => {
        optionspanel.reloadAnalyses(event.name);
    });

    let currentSplitMode = null;
    let forcedFullScreen = false;
    window.onresize = function(event) {
        splitPanel.onWindowResize();

        if (window.innerWidth < 850 && currentSplitMode === null) {
            forcedFullScreen = true;
            currentSplitMode = splitPanel.mode;
            if (splitPanel.mode === 'mixed') {
                let tab = ribbonModel.get('selectedTab');
                switch (tab) {
                    case 'variables':
                    case 'data':
                        splitPanel.setMode('data');
                        break;
                    case 'analyses':
                    case 'annotation':
                        splitPanel.setMode('results');
                        break;
                }
            }
        }
        else if (window.innerWidth > 880) {
             if (currentSplitMode !== null && splitPanel.mode !== currentSplitMode) {
                splitPanel.setMode(currentSplitMode);
            }

            currentSplitMode = null;
            forcedFullScreen = false;
        }
    };

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

    splitPanel.render();

    let $mainTable = $('#main-table');
    let $spreadsheet = $('<div id="spreadsheet"></div>');
    let $variablesList = $('<div id="variablelist"></div>');
    $mainTable.append($spreadsheet);
    $mainTable.append($variablesList);

    let selection = new Selection(dataSetModel);
    let viewController = new ViewController(dataSetModel, selection);
    let mainTable   = new TableView({el : '#spreadsheet', model : dataSetModel, controller: viewController });
    let variablesTable   = new VariablesView({el : '#variablelist', model : dataSetModel, controller: viewController });
    viewController.focusView('spreadsheet');

    backstageModel.on('change:activated', function(event) {
        if ('activated' in event.changed)
            mainTable.setActive( ! event.changed.activated);
    });

    splitPanel.on('form-changed', () => {
        mainTable.$el.trigger('resized');
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

    resultsView.$el.on('analysisLostFocus', (event) => {
        $(window).focus();
        optionspanel.hideOptions();
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

    let editor = new VariableEditor({ el : '#variable-editor', model : dataSetModel, controller: viewController });

    let notifications = new Notifications($('#notifications'));
    instance.on( 'notification', note => notifications.notify(note));
    viewController.on('notification', note => notifications.notify(note));
    mainTable.on('notification', note => notifications.notify(note));
    ribbon.on('notification', note => notifications.notify(note));
    editor.on('notification', note => notifications.notify(note));
    backstageModel.on('notification', note => notifications.notify(note));

    dataSetModel.on('change:edited', event => {
        host.setEdited(dataSetModel.attributes.edited);
    });

    dataSetModel.on('change:editingVar', event => {
        optionspanel.hideOptions();
        if (dataSetModel.get('editingVar') === null) {
            setTimeout(() => {
                splitPanel.onTransitioning();
            }, 200);
        }
    });

    host.on('close', (event) => {
        if (dataSetModel.attributes.edited) {
            let response = host.showMessageBox({
                type: 'question',
                buttons: [ _('Save'), _('Cancel'), _("Don't Save") ],
                defaultId: 1,
                message: _("Save changes to '{title}'?", {title: instance.attributes.title}),
            });
            if (response === 1) {  // Cancel
                return false;
            }
            else if (response === 0) {  // Save
                backstageModel.externalRequestSave()
                    .then(() => host.closeWindow(true));
                return false;
            }
        }
    });

    document.body.appendChild(infoBox);

    let toOpen = '';  // '' denotes blank data set

    let progNotif = new Notify({
        title: _('Opening'),
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
            if (progress.p !== undefined) {
                progNotif.set({
                    title: progress.title,
                    progress: [ progress.p, progress.n ],
                });
                notifications.notify(progNotif);
            }

            if (progress.status !== undefined) {
                infoBox.setup(progress);
            }
        };

        let status;

        try {
            let stream = instance.open(toOpen, { existing: !!instanceId });
            for await (let progress of stream)
                notify(progress);
            status = await stream;
        }
        catch (e) {
            if (host.isElectron && toOpen !== '') {
                // if opening fails, open a blank data set
                status = await instance.open('', { existing: !!instanceId });
                notifications.notify(new Notify({
                    title: _('Unable to open'),
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
        else
            infoBox.hide();

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
            console.log(e);

            infoBox.setup({
                title: _('Connection failed'),
                message: _('Unable to connect to the server'),
                status: 'disconnected',
            });
        }

        infoBox.style.display = null;
        await new Promise((resolve, reject) => { /* never */ });
    }

    // if it's just the results heading ...
    if (instance.analyses().count() === 1) {
        for (let analysis of instance.analyses()) {
            // ... and it's not edited
            if (analysis.getHeading() || analysis.options.getAnnotation('topText'))
                break;
            // ... then show the welcome screen
            resultsView.showWelcome();
        }
    }

});

})();
