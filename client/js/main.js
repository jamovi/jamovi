'use strict';

var $ = require('jquery');

var Host = require('./host');
window.host = new Host();

if (window.location.protocol === 'file:') {

    window.inElectron = true;

    var remote = window.require('electron').remote;
    var port = remote.getGlobal('port');

    if (typeof(port) !== 'undefined')
        window.host.set('localhost:' + port);
}
else {

    window.host.setBaseUrl('');
}


var TableView   = require('./tableview');
var SplitPanel  = require('./splitpanel');
var ProgressBar = require('./progressbar');
var Backstage   = require('./backstage').View;
var Ribbon      = require('./ribbon').View;
var RibbonModel = require('./ribbon').Model;

var Instance = require('./instance');

var instance = new Instance();
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

    var splitPanel  = new SplitPanel({el : "#main-view"});
    var mainTable   = new TableView({el : "#main-table", model : dataSetModel });
    var progressBar = new ProgressBar({el : "#progress-bar", model : instance.progressModel() });

    window.host.ready.then(start);
});

function start() {
    instance.set('host', window.host.host);
    instance.connect();
}
