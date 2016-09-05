'use strict';

const $ = require('jquery');

const host = require('./host');

let Coms = require('./coms');
let coms = new Coms();
coms.setBaseUrl(host.baseUrl);

const TableView   = require('./tableview');
const ResultsView = require('./results');
const SplitPanel  = require('./splitpanel');
const ProgressBar = require('./progressbar');
const Backstage   = require('./backstage').View;
const BackstageModel = require('./backstage').Model;
const Ribbon      = require('./ribbon').View;
const RibbonModel = require('./ribbon').Model;
const Notifications = require('./notifications');
const SplitPanelSection = require('./splitpanelsection');
const OptionsPanel = require('./optionspanel');
const VariableEditor = require('./variableeditor');

const Instance = require('./instance');
const Notify = require('./notification');

let instance = new Instance({ coms : coms });
let backstageModel = new BackstageModel({ instance: instance });

let dataSetModel = instance.dataSetModel();

let analyses = instance.analyses();
analyses.set('dataSetModel', dataSetModel);

let ribbonModel = new RibbonModel();

ribbonModel.on('analysisSelected', function(info) {
    analyses.createAnalysis(info.name, info.ns);
});

backstageModel.on('change:activated', function(event) {
    if (event.changed.activated === false)
        ribbonModel.set('selectedIndex', 1);
});

instance.on('change:hasDataSet', function() {
    ribbonModel.set('dataAvailable', true);
});

coms.onBroadcast(function(broadcast) {
    if (broadcast.payloadType === 'SettingsResponse') {
        let settings = coms.Messages.SettingsResponse.decode(broadcast.payload);
        backstageModel.set('settings', settings);
    }
});

$(document).ready(function() {

    if (navigator.platform === "Win32")
        $('body').addClass("windows");
    else if (navigator.platform == "MacIntel")
        $('body').addClass("mac");
    else
        $('body').addClass("other");

    if (host.isElectron)
        $('body').addClass('electron');

    $(window).on('keydown', function(event) {
        if (event.key === "F10" || event.keyCode === 121)
            host.toggleDevTools();
    });

    if (host.isElectron && navigator.platform === "Win32") {

        $('#close-button').on('click', event => host.closeWindow());
        $('#min-button').on('click', event => host.minimizeWindow());
        $('#max-button').on('click', event => host.maximizeWindow());
    }

    document.oncontextmenu = function() { return false; };

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
        else
            optionspanel.hideOptions();
    });

    let $fileName = $('.header-file-name');
    instance.on('change:fileName', function(event) {
        $fileName.text(event.changed.fileName);
        document.title = event.changed.fileName;
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
    let progressBar = new ProgressBar({el : "#progress-bar", model : instance.progressModel() });

    let optionsUrl = 'http://localhost:' + host.analysisUIPort + '/';
    let optionspanel = new OptionsPanel({ el : "#main-options", iframeUrl : optionsUrl, model : instance });
    optionspanel.setDataSetModel(dataSetModel);

    let resultsUrl = 'http://localhost:' + host.resultsViewPort + '/';
    let resultsView = new ResultsView({ el : "#results", iframeUrl : resultsUrl, model : instance });

    let editor = new VariableEditor({ el : '#variable-editor', model : dataSetModel });

    let notifications = new Notifications($('#notifications'));
    instance.on( 'notification', note => notifications.notify(note));
    mainTable.on('notification', note => notifications.notify(note));

    Promise.resolve(function() {

        return $.post('http://localhost:' + host.mainPort + '/login');

    }).then(function() {

        return coms.ready;

    }).then(function() {

        let instanceId;
        if (window.location.search.indexOf('?id=') !== -1)
            instanceId = window.location.search.split('?id=')[1];

        return instance.connect(instanceId);

    }).then(function(instanceId) {

        let newUrl = window.location.origin + window.location.pathname + '?id=' + instanceId;
        history.replaceState({}, '', newUrl);

        return instanceId;

    }).then(function(instanceId) {

        let settings = new coms.Messages.SettingsRequest();
        let request = new coms.Messages.ComsMessage();
        request.payload = settings.toArrayBuffer();
        request.payloadType = "SettingsRequest";
        request.instanceId = instanceId;

        return coms.send(request);

    }).then(function(response) {

        let settings = coms.Messages.SettingsResponse.decode(response.payload);
        backstageModel.set('settings', settings);
    });
});
