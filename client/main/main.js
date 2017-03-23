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

const Instance = require('./instance');
const Modules = require('./modules');
const Notify = require('./notification');

let instance = new Instance({ coms : coms });

let dataSetModel = instance.dataSetModel();
let analyses = instance.analyses();

let backstageModel = new BackstageModel({ instance: instance });
let modules = new Modules({ instance: instance });
let ribbonModel = new RibbonModel({ modules: modules });

ribbonModel.on('analysisSelected', function(info) {
    analyses.createAnalysis(info.name, info.ns);
});

coms.on('broadcast', function(broadcast) {
    if (broadcast.payloadType === 'SettingsResponse') {
        let settings = coms.Messages.SettingsResponse.decode(broadcast.payload);
        backstageModel.set('settings', settings);
        modules.setup(settings.modules);
    }
});

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
        }
    ]);
}

$(document).ready(() => {

    if (navigator.platform === "Win32")
        $('body').addClass("windows");
    else if (navigator.platform == "MacIntel")
        $('body').addClass("mac");
    else
        $('body').addClass("other");

    if (host.isElectron)
        $('body').addClass('electron');

    $(window).on('keydown', function(event) {
        if (event.key === 'F10' || event.keyCode === 121)
            host.toggleDevTools();
        else if (event.key === 'F9' || event.keyCode === 120)
            instance.restartEngines();
    });

    if (host.isElectron && navigator.platform === "Win32") {

        $('#close-button').on('click', event => host.closeWindow());
        $('#min-button').on('click', event => host.minimizeWindow());
        $('#max-button').on('click', event => host.maximizeWindow());
    }

    document.oncontextmenu = function() { return false; };
    document.ondragover = (event) => {
        if (event.dataTransfer.files.length > 0) {
            event.dataTransfer.dropEffect = 'copy';
            event.preventDefault();
        }
    };
    document.body.ondrop = (event) => {
        for (let file of event.dataTransfer.files)
            instance.open(file.path);
        event.preventDefault();
    };

    let ribbon = new Ribbon({ el : '.silky-ribbon', model : ribbonModel });
    let backstage = new Backstage({ el : "#backstage", model : backstageModel });

    ribbonModel.on('change:selectedIndex', function(event) {
        if (event.changed.selectedIndex === 0)
            backstage.activate();
    });

    ribbonModel.on('toggleResultsMode', () => instance.toggleResultsMode());

    let halfWindowWidth = 585 + SplitPanelSection.sepWidth;
    let optionsFixedWidth = 585;
    let splitPanel  = new SplitPanel({el : "#main-view"});

    splitPanel.addPanel("main-table", { minWidth: 90, initialWidth: halfWindowWidth < (optionsFixedWidth + SplitPanelSection.sepWidth) ? (optionsFixedWidth + SplitPanelSection.sepWidth) : halfWindowWidth, level: 1});
    splitPanel.addPanel("main-options", { minWidth: optionsFixedWidth, maxWidth: optionsFixedWidth, preferredWidth: optionsFixedWidth, visible: false, strongEdge: "right", stretchyEdge: "left", level: 1 });
    splitPanel.addPanel("results", { minWidth: 150, initialWidth: halfWindowWidth, level: 0 });
    splitPanel.addPanel("help", { minWidth: 30, preferredWidth: 200, visible: false, strongEdge: "right", level: 1 });

    instance.on("change:selectedAnalysis", function(event) {
        let analysis = event.changed.selectedAnalysis;
        if (analysis !== null) {
            analysis.ready.then(function() {
                splitPanel.setVisibility("main-options", true);
                optionspanel.setAnalysis(analysis);
            });
        }
        else {
            optionspanel.hideOptions();
        }
    });

    let $fileName = $('.header-file-name');
    instance.on('change:title', function(event) {
        let title = event.changed.title;
        $fileName.text(title);
        document.title = title;
    });

    let section = splitPanel.getSection("main-options");
    splitPanel.getSection("results").$panel.find(".hideOptions").click(function() {
        splitPanel.setVisibility("main-options", false);
    });

    let helpSection = splitPanel.getSection("help");
    splitPanel.getSection("results").$panel.find(".hideHelp").click(function() {
        splitPanel.setVisibility("help", helpSection.getVisibility() === false);
    });

    splitPanel.render();

    let mainTable   = new TableView({el : "#main-table", model : dataSetModel });

    backstageModel.on('change:activated', function(event) {
        mainTable.setActive( ! event.changed.activated);
        if (event.changed.activated === false)
            ribbonModel.set('selectedIndex', 1);
    });

    let resultsView = new ResultsView({ el : "#results", iframeUrl : host.resultsViewUrl, model : instance });
    let optionspanel = new OptionsPanel({ el : "#main-options", iframeUrl : host.analysisUIUrl, model : instance });
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
                message: 'Do you want to save the changes made to "' + instance.attributes.title + '"?',
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

        return instance.connect(instanceId);

    }).then(instanceId => {

        let toOpen = '';  // '' denotes blank data set
        if (window.location.search.indexOf('?open=') !== -1)
            toOpen = window.location.search.split('?open=')[1];

        let newUrl = window.location.origin + window.location.pathname + '?id=' + instanceId;
        history.replaceState({}, '', newUrl);

        if ( ! instance.get('hasDataSet'))
            return instance.open(toOpen);

    }).catch(() => { // if the initial open fails

        if ( ! instance.get('hasDataSet'))
            return instance.open('');

    }).then(() => {

        let settings = new coms.Messages.SettingsRequest();
        let request = new coms.Messages.ComsMessage();
        request.payload = settings.toArrayBuffer();
        request.payloadType = 'SettingsRequest';
        request.instanceId = instance.instanceId();

        return coms.send(request);

    }).then(response => {

        let settings = coms.Messages.SettingsResponse.decode(response.payload);
        backstageModel.set('settings', settings);
        modules.setup(settings.modules);
    });
});
