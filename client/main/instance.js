'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const path = require('path');

const Analyses = require('./analyses');
const DataSetViewModel = require('./dataset').DataSetViewModel;

const ProgressModel = Backbone.Model.extend({
    defaults : {
        task     : '',
        progress : 0,
        complete : true
    }
});

var Instance = Backbone.Model.extend({

    initialize: function() {

        _.bindAll(this,
            'connect',
            'open');

        this.transId = 0;
        this.command = '';
        this.seqNo = 0;

        this._dataSetModel = new DataSetViewModel({ coms: this.attributes.coms });

        this._progressModel = new ProgressModel();

        this._analyses = new Analyses();
        this._analyses.on('analysisCreated', this._analysisCreated, this);
        this._analyses.on('analysisOptionsChanged', this._analysisOptionsChanged, this);

        this._instanceId = null;

    },
    defaults : {
        coms : null,
        selectedAnalysis : null,
        hasDataSet : false,
        filePath : null,
        fileName : null,
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

        var self = this;
        var coms = this.attributes.coms;

        return coms.connect().then(function() {

            return self._beginInstance(instanceId);

        }).then(function(instanceId) {

            self._instanceId = instanceId;

        }).then(function() {

            return self._retrieveInfo();

        }).then(function() {

            return self._instanceId;

        }).catch(function(err) {

            console.log('error ' + err);
        });

    },
    open : function(filePath) {

        var self = this;
        var coms = this.attributes.coms;

        var open = new coms.Messages.OpenRequest(filePath);
        var request = new coms.Messages.ComsMessage();
        request.payload = open.toArrayBuffer();
        request.payloadType = "OpenRequest";
        request.instanceId = this._instanceId;

        var onresolve = function(response) {
            let ext = path.extname(filePath);
            self.set('filePath', filePath);
            self.set('fileName', path.basename(filePath, ext));
            self._retrieveInfo();
        };

        var onprogress = function(progress) {
            console.log(progress);
        };

        return coms.send(request).then(onresolve, null, onprogress);
    },
    save : function(filePath) {
        var self = this;
        var coms = this.attributes.coms;

        var save = new coms.Messages.SaveRequest(filePath);
        var request = new coms.Messages.ComsMessage();
        request.payload = save.toArrayBuffer();
        request.payloadType = "SaveRequest";
        request.instanceId = this._instanceId;

        var onSuccess = function() {
            let ext = path.extname(filePath);
            self.set('filePath', filePath);
            self.set('fileName', path.basename(filePath, ext));
        };

        return coms.send(request).then(onSuccess);
    },
    _beginInstance : function(instanceId) {

        var coms = this.attributes.coms;

        var instanceRequest = new coms.Messages.InstanceRequest();
        var request = new coms.Messages.ComsMessage();
        request.payload = instanceRequest.toArrayBuffer();
        request.payloadType = "InstanceRequest";

        if (instanceId)
            request.instanceId = instanceId;

        return coms.send(request).then(function(response) {
            return response.instanceId;
        });
    },
    _retrieveInfo : function() {

        var self = this;
        var coms = this.attributes.coms;

        var info = new coms.Messages.InfoRequest();
        var request = new coms.Messages.ComsMessage();
        request.payload = info.toArrayBuffer();
        request.payloadType = "InfoRequest";
        request.instanceId = this._instanceId;

        return coms.send(request).then(function(response) {

            var info = coms.Messages.InfoResponse.decode(response.payload);

            if (info.hasDataSet) {

                var columnInfo = _.map(info.schema.fields, function(field) {
                    return { name : field.name, width: field.width, measureType : self._stringifyMeasureType(field.measureType) };
                }, self);

                self._dataSetModel.set('instanceId', self._instanceId);
                self._dataSetModel.setNew({
                    rowCount : info.rowCount,
                    columnCount : info.columnCount,
                    columns : columnInfo
                });

                self.set('hasDataSet', true);

                let ext = path.extname(info.filePath);
                self.set('filePath', info.filePath);
                self.set('fileName', path.basename(info.filePath, ext));
            }

            return response;
        });
    },
    _analysisCreated : function(analysis) {

        this.set("selectedAnalysis", analysis);
        this._analysisOptionsChanged(analysis);
    },
    _analysisOptionsChanged : function(analysis) {

        var self = this;
        var coms = this.attributes.coms;

        var analysisRequest = new coms.Messages.AnalysisRequest();
        analysisRequest.name = analysis.name;
        analysisRequest.ns = analysis.ns;
        analysisRequest.ppi = 72 * (window.devicePixelRatio || 1);

        if (analysis.isSetup) {
            analysisRequest.analysisId = analysis.id;
            analysisRequest.options = JSON.stringify(analysis.options);
        }

        var request = new coms.Messages.ComsMessage();
        request.payload = analysisRequest.toArrayBuffer();
        request.payloadType = "AnalysisRequest";
        request.instanceId = this._instanceId;

        var onreceive = function(message) {

            var response = coms.Messages.AnalysisResponse.decode(message.payload);
            var ok = false;

            if (analysis.isSetup === false
                && _.has(response, "analysisId")
                && _.has(response, "options")) {

                var id = response.analysisId;
                var options = JSON.parse(response.options);

                analysis.setup(id, options);

                ok = true;
            }

            if (analysis.isSetup && _.has(response, "results") && response.results !== null) {
                analysis.setResults(response.results);
                ok = true;
            }

            if (ok === false) {
                console.log("Unexpected analysis results received");
                console.log(response);
            }
        };

        return coms.send(request).then(onreceive, null, onreceive);
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
