'use strict';

var $ = require('jquery');

var Coms = require('./coms');
var coms = new Coms();

if (window.location.protocol === 'file:') {

    window.inElectron = true;

    var remote = window.require('electron').remote;
    var mainPort = remote.getGlobal('mainPort');
    var analysisUIPort = remote.getGlobal('analysisUIPort');
    var resultsViewPort = remote.getGlobal('resultsViewPort');

    if (typeof(mainPort) !== 'undefined')
        coms.setBaseUrl('localhost:' + mainPort);
}
else {

    coms.setBaseUrl('');
}


var TableView   = require('./tableview');
var ResultsView = require('./results');
var SplitPanel  = require('./splitpanel');
var ProgressBar = require('./progressbar');
var Backstage   = require('./backstage').View;
var Ribbon      = require('./ribbon').View;
var RibbonModel = require('./ribbon').Model;
var SplitPanelSection = require('./splitpanelsection');
var OptionsPanel = require('./optionspanel');

var Instance = require('./instance');

var instance = new Instance({ coms : coms });

var dataSetModel = instance.dataSetModel();

var analyses = instance.analyses();
analyses.set('dataSetModel', dataSetModel);

var ribbonModel = new RibbonModel();

ribbonModel.on('analysisSelected', function(info) {
    analyses.createAnalysis(info.name, info.ns);
});

$(document).ready(function() {

    var ribbon = new Ribbon({ el : '.silky-ribbon', model : ribbonModel });
    var backstage = new Backstage({ el : "#backstage", model : instance.backstageModel() });

    ribbonModel.on('change:selectedIndex', function(event) {
        if (event.changed.selectedIndex === 0)
            backstage.activate();
    });

    instance.backstageModel().on('change:activated', function(event) {
        if (event.changed.activated === false)
            ribbonModel.set('selectedIndex', 1);
    });

    var halfWindowWidth = $(document).width() * 0.5;
    var optionsFixedWidth = 585;
    var splitPanel  = new SplitPanel({el : "#main-view"});

    splitPanel.addPanel("main-table", { minWidth: 90, initialWidth: halfWindowWidth < (optionsFixedWidth + SplitPanelSection.sepWidth) ? (optionsFixedWidth + SplitPanelSection.sepWidth) : halfWindowWidth, level: 1});
    splitPanel.addPanel("main-options", { minWidth: optionsFixedWidth, maxWidth: optionsFixedWidth, preferedWidth: optionsFixedWidth, visible: false, strongEdge: "right", stretchyEdge: "left", level: 1 });
    splitPanel.addPanel("results", { minWidth: 150, initialWidth: halfWindowWidth, level: 0 });
    splitPanel.addPanel("help", { minWidth: 30, preferedWidth: 200, visible: false, strongEdge: "right", level: 1 });

    analyses.on("analysisCreated", function(analysis) {
        analysis.ready.then(function() {
            optionspanel.setAnalysis(analysis);
            splitPanel.setVisibility("main-options", true);
        });
    });

    var section = splitPanel.getSection("main-options");
    splitPanel.getSection("results").$panel.find(".hideOptions").click(function() {
        splitPanel.setVisibility("main-options", false);
    });

    var helpSection = splitPanel.getSection("help");
    splitPanel.getSection("results").$panel.find(".hideHelp").click(function() {
        splitPanel.setVisibility("help", helpSection.getVisibility() === false);
    });

    splitPanel.render();

    var mainTable   = new TableView({el : "#main-table", model : dataSetModel });
    var progressBar = new ProgressBar({el : "#progress-bar", model : instance.progressModel() });
    var optionspanel = new OptionsPanel({ el : "#main-options" });
    optionspanel.setDataSetModel(dataSetModel);
    
    var resultsUrl = 'http://localhost:' + resultsViewPort + '/';
    var resultsView = new ResultsView({ el : "#results", iframeUrl : resultsUrl, model : instance.analyses() });

    coms.ready.then(start);
});

function start() {
    instance.connect();
}
