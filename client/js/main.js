'use strict';

var $ = require('jquery')

var Host = require('./host')
window.host = new Host()

if (window.location.protocol === 'file:') {

    window.inElectron = true

    const remote = window.require('electron').remote
    var port = remote.getGlobal('port')

    if (typeof(port) !== 'undefined')
        window.host.set('localhost:' + port)
}
else {

    window.host.setBaseUrl('')
}


var TableView   = require('./tableview')
var SplitPanel  = require('./splitpanel')
var ProgressBar = require('./progressbar')
var Backstage   = require('./backstage').View
var Ribbon      = require('./ribbon').View
var RibbonModel = require('./ribbon').Model
var SplitPanelSection = require('./splitpanelsection')
var OptionsPanel = require('./optionspanel')

var Instance = require('./instance')

var instance = new Instance()
var dataSetModel = instance.dataSetModel()

var analyses = instance.analyses()
analyses.set('dataSetModel', dataSetModel)

var ribbonModel = new RibbonModel()

ribbonModel.on('analysisSelected', function(info) {
    analyses.createAnalysis(info.name, info.ns)
})

$(document).ready(function() {

    var ribbon = new Ribbon({ el : '.silky-ribbon', model : ribbonModel })
    var backstage = new Backstage({ el : "#backstage", model : instance.backstageModel() })

    ribbonModel.on('change:selectedIndex', function(event) {
        if (event.changed.selectedIndex === 0)
            backstage.activate()
    })

    instance.backstageModel().on('change:activated', function(event) {
        if (event.changed.activated === false)
            ribbonModel.set('selectedIndex', 1)
    })

    var halfWindowWidth = $(document).width() * 0.5;
    var optionsFixedWidth = 400;
    var splitPanel  = new SplitPanel({el : "#main-view"})

    splitPanel.addPanel("main-table", { minWidth: 150, initialWidth: halfWindowWidth < (optionsFixedWidth + SplitPanelSection.sepWidth) ? (optionsFixedWidth + SplitPanelSection.sepWidth) : halfWindowWidth, level: 1});
    splitPanel.addPanel("main-options", { minWidth: optionsFixedWidth, maxWidth: optionsFixedWidth, preferedWidth: optionsFixedWidth, visible: false, strongEdge: "right", stretchyEdge: "left", level: 1 });
    splitPanel.addPanel("results", { minWidth: 150, initialWidth: halfWindowWidth, level: 0 });
    splitPanel.addPanel("help", { minWidth: 30, preferedWidth: 200, visible: false, strongEdge: "right", level: 1 });

    analyses.on("analysisCreated", function(analysis) {
        analysis.ready.then(function() {

            optionspanel.setContent(new analysis.View( { className: "silky-options-content", model: analysis.model } ));
            splitPanel.setVisibility("main-options", true);
        });
    });

    var section = splitPanel.getSection("main-options");
    splitPanel.getSection("results").panel.find(".hideOptions").click(function() {
        splitPanel.setVisibility("main-options", false);
    });

    var helpSection = splitPanel.getSection("help");
    splitPanel.getSection("results").panel.find(".hideHelp").click(function() {
        splitPanel.setVisibility("help", helpSection.getVisibility() === false);
    });

    splitPanel.render();

    var mainTable   = new TableView({el : "#main-table", model : dataSetModel })
    var progressBar = new ProgressBar({el : "#progress-bar", model : instance.progressModel() })
    var optionspanel = new OptionsPanel({ el : "#main-options" })

    host.ready.then(start)
})

function start() {
	instance.set('host', window.host.host)
	instance.connect()
}
