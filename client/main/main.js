'use strict';

const $ = require('jquery');

const host = require('./host');

let Coms = require('./coms');
let coms = new Coms();
coms.setBaseUrl(host.baseUrl);

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

let instance = new Instance({ coms : coms });

let dataSetModel = instance.dataSetModel();
let analyses = instance.analyses();

let backstageModel = new BackstageModel({ instance: instance });
let modules = new Modules({ instance: instance });
let ribbonModel = new RibbonModel({ modules: modules, settings: instance.settings() });

coms.on('close', function() {
    window.alert('Connection lost\n\nThe processing engine has ended unexpectedly.\nThis jamovi window will now close down. Sorry for the inconvenience.\n\nIf you could report your experiences to the jamovi team, that would be appreciated.');
    host.closeWindow(true);
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
            label: 'Edit',
            submenu: [
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
            ]
        },
    ]);
}

// prevent back navigation
history.pushState(null, null, document.URL);
window.addEventListener('popstate', function () {
    history.pushState(null, null, document.URL);
});


$(document).ready(() => {

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
        if (event.dataTransfer.files.length > 0) {
            event.dataTransfer.dropEffect = 'copy';
            event.preventDefault();
        }
    };
    document.ondrop = (event) => {
        for (let file of event.dataTransfer.files)
            instance.open(file.path);
        event.preventDefault();
    };

    let ribbon = new Ribbon({ el : '.silky-ribbon', model : ribbonModel });
    let backstage = new Backstage({ el : '#backstage', model : backstageModel });

    ribbon.on('analysisSelected', function(analysis) {
        analyses.createAnalysis(analysis.name, analysis.ns);
    });

    ribbon.on('tabSelected', function(tabName) {
        if (tabName === 'file')
            backstage.activate();
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
            if (analysis !== null) {
                analysis.ready.then(function() {
                    splitPanel.setVisibility('main-options', true);
                    optionspanel.setAnalysis(analysis);
                });
            }
            else {
                optionspanel.hideOptions();
            }
        }
    });

    instance.on('moduleInstalled', (event) => {
        optionspanel.reloadAnalyses(event.name);
    });

    let $fileName = $('.header-file-name');
    instance.on('change:title', function(event) {
        if ('selectedAnalysis' in event.changed) {
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

    dataSetModel.on('change:edited', event => {
        host.setEdited(dataSetModel.attributes.edited);
    });

    host.on('close', event => {
        if (dataSetModel.attributes.edited) {
            let response = host.showMessageBox({
                type: 'question',
                buttons: [ 'Save', 'Cancel', "Don't Save" ],
                defaultId: 1,
                message: "Do you want to save the changes made to '" + instance.attributes.title + "'?",
            });
            if (response === 1) {  // Cancel
                event.preventDefault();
            }
            else if (response === 0) {  // Save
                event.preventDefault();
                backstageModel.externalRequestSave(true)
                    .then(() => host.closeWindow(true));
            }
        }
    });

    Promise.resolve(() => {

        return $.post(host.baseUrl + 'login');

    }).then(() => {

        return coms.ready;

    }).then(() => {

        let instanceId;
        if (window.location.search.indexOf('?id=') !== -1)
            instanceId = window.location.search.split('?id=')[1];
        else
            resultsView.showWelcome();

        return instance.connect(instanceId);

    }).then(instanceId => {

        let toOpen = '';  // '' denotes blank data set
        if (window.location.search.indexOf('?open=') !== -1) {
            toOpen = window.location.search.split('?open=')[1];
            toOpen = decodeURI(toOpen);
        }

        let newUrl = window.location.origin + window.location.pathname + '?id=' + instanceId;
        history.replaceState({}, '', newUrl);

        if ( ! instance.get('hasDataSet'))
            return instance.open(toOpen);

    }).catch(() => { // if the initial open fails

        if ( ! instance.get('hasDataSet'))
            return instance.open('');

    });
});
