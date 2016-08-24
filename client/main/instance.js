//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const path = require('path');

const Host = require('./host');
const Notify = require('./notification');

const Analyses = require('./analyses');
const DataSetViewModel = require('./dataset').DataSetViewModel;

const ProgressModel = Backbone.Model.extend({
    defaults : {
        task     : '',
        progress : 0,
        complete : true
    }
});

const Instance = Backbone.Model.extend({

    initialize: function() {

        this.transId = 0;
        this.command = '';
        this.seqNo = 0;

        this._dataSetModel = new DataSetViewModel({ coms: this.attributes.coms });

        this._progressModel = new ProgressModel();

        this._analyses = new Analyses();
        this._analyses.on('analysisCreated', this._analysisCreated, this);
        this._analyses.on('analysisOptionsChanged', this._analysisOptionsChanged, this);

        this._instanceId = null;

        this.attributes.coms.onBroadcast(bc => this._onReceive(bc));

    },
    defaults : {
        coms : null,
        selectedAnalysis : null,
        hasDataSet : false,
        filePath : null,
        fileName : null,
        resultsMode : 'rich'
    },
    instanceId : function() {
        return this._instanceId;
    },
    progressModel : function() {

        return this._progressModel;
    },
    dataSetModel : function() {

        return this._dataSetModel;
    },
    analyses : function() {

        return this._analyses;
    },
    connect : function(instanceId) {

        let coms = this.attributes.coms;

        return coms.connect().then(() => {

            return this._beginInstance(instanceId);

        }).then(instanceId => {

            this._instanceId = instanceId;

        }).then(() => {

            return this._retrieveInfo();

        }).then(() => {

            return this._instanceId;

        }).catch(err => {

            console.log('error ' + err);
        });

    },
    open : function(filePath) {

        let promise;
        let coms = this.attributes.coms;

        if (this.attributes.hasDataSet) {

            let instance = new Instance({ coms : coms });
            promise = instance.connect().then(function() {
                return instance.open(filePath);
            }).then(function() {
                Host.openWindow(instance.instanceId());
            });
        }
        else {

            let open = new coms.Messages.OpenRequest(filePath);
            let request = new coms.Messages.ComsMessage();
            request.payload = open.toArrayBuffer();
            request.payloadType = "OpenRequest";
            request.instanceId = this._instanceId;

            let onresolve = (response) => {
                let ext = path.extname(filePath);
                this.set('filePath', filePath);
                this.set('fileName', path.basename(filePath, ext));
                this._retrieveInfo();
            };

            let onprogress = (progress) => {
                console.log(progress);
            };

            let onreject = (error) => {
                let notification = new Notify({
                    title: error.message,
                    message: error.cause,
                });
                this._notify(notification);
            };

            promise = coms.send(request);
            promise.then(onresolve, onreject, onprogress);
        }

        return promise;
    },
    save : function(filePath) {

        let coms = this.attributes.coms;

        let save = new coms.Messages.SaveRequest(filePath);
        let request = new coms.Messages.ComsMessage();
        request.payload = save.toArrayBuffer();
        request.payloadType = "SaveRequest";
        request.instanceId = this._instanceId;

        let prom = coms.send(request);

        prom.then(() => {
            let ext = path.extname(filePath);
            this.set('filePath', filePath);
            this.set('fileName', path.basename(filePath, ext));
        });

        return prom;
    },
    browse : function(path) {

        let coms = this.attributes.coms;

        let fs = new coms.Messages.FSRequest();
        fs.path = path;

        let message = new coms.Messages.ComsMessage();
        message.payload = fs.toArrayBuffer();
        message.payloadType = "FSRequest";
        message.instanceId = this.instanceId();

        return coms.send(message)
            .then(response => coms.Messages.FSResponse.decode(response.payload));
    },
    toggleResultsMode : function() {

        let mode = this.attributes.resultsMode;
        if (mode === 'text')
            mode = 'rich';
        else
            mode = 'text';
        this.set('resultsMode', mode);
    },
    _notify : function(notification) {
        this.trigger('notification', notification);
    },
    _beginInstance : function(instanceId) {

        let coms = this.attributes.coms;

        let instanceRequest = new coms.Messages.InstanceRequest();
        let request = new coms.Messages.ComsMessage();
        request.payload = instanceRequest.toArrayBuffer();
        request.payloadType = "InstanceRequest";

        if (instanceId)
            request.instanceId = instanceId;

        return coms.send(request).then(function(response) {
            return response.instanceId;
        });
    },
    _retrieveInfo : function() {

        let coms = this.attributes.coms;

        let info = new coms.Messages.InfoRequest();
        let request = new coms.Messages.ComsMessage();
        request.payload = info.toArrayBuffer();
        request.payloadType = "InfoRequest";
        request.instanceId = this._instanceId;

        return coms.send(request).then(response => {

            let info = coms.Messages.InfoResponse.decode(response.payload);

            if (info.hasDataSet) {

                let columnInfo = Array(info.schema.fields.length);

                for (let i = 0; i < info.schema.fields.length; i++) {

                    let field = info.schema.fields[i];

                    let levels = new Array(field.levels.length);
                    for (let j = 0; j < field.levels.length; j++)
                        levels[j] = {
                            value: field.levels[j].value,
                            label: field.levels[j].label,
                        };

                    columnInfo[i] = {
                        name : field.name,
                        width: field.width,
                        measureType : this._stringifyMeasureType(field.measureType),
                        levels: levels,
                        dps: field.dps,
                    };
                }

                this._dataSetModel.set('instanceId', this._instanceId);
                this._dataSetModel.setNew({
                    rowCount : info.rowCount,
                    columnCount : info.columnCount,
                    columns : columnInfo
                });

                this.set('hasDataSet', true);

                let ext = path.extname(info.filePath);
                this.set('filePath', info.filePath);
                this.set('fileName', path.basename(info.filePath, ext));
            }

            return response;
        });
    },
    _analysisCreated : function(analysis) {

        this.set("selectedAnalysis", analysis);
        this._analysisOptionsChanged(analysis);
    },
    _analysisOptionsChanged : function(analysis) {

        let coms = this.attributes.coms;

        let analysisRequest = new coms.Messages.AnalysisRequest();
        analysisRequest.analysisId = analysis.id;
        analysisRequest.name = analysis.name;
        analysisRequest.ns = analysis.ns;
        analysisRequest.ppi = 72 * (window.devicePixelRatio || 1);

        if (analysis.isSetup)
            analysisRequest.options = JSON.stringify(analysis.options);

        let request = new coms.Messages.ComsMessage();
        request.payload = analysisRequest.toArrayBuffer();
        request.payloadType = "AnalysisRequest";
        request.instanceId = this._instanceId;

        return coms.sendP(request);
    },
    _onReceive : function(message) {

        let coms = this.attributes.coms;

        if (message.payloadType === 'AnalysisResponse') {
            let response = coms.Messages.AnalysisResponse.decode(message.payload);
            let ok = false;

            let id = response.analysisId;
            let analysis = this._analyses.get(id);

            if (analysis.isSetup === false && _.has(response, "options")) {

                let options = JSON.parse(response.options);
                analysis.setup(options);

                ok = true;
            }

            if (analysis.isSetup && _.has(response, "results") && response.results !== null) {
                analysis.setResults(response.results, response.incAsText, response.syntax);
                ok = true;
            }

            if (ok === false) {
                console.log("Unexpected analysis results received");
                console.log(response);
            }
        }

    },
    _stringifyMeasureType : function(measureType) {
        switch (measureType) {
            case 1:
                return 'nominaltext';
            case 2:
                return 'nominal';
            case 3:
                return 'ordinal';
            case 4:
                return 'continuous';
            default:
                return '';
        }
    }
});

module.exports = Instance;
