'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var BackstageModel = require('./backstage').Model;
var Analyses = require('./analyses');
var DataSetViewModel = require('./dataset').DataSetViewModel;

var ProgressModel = Backbone.Model.extend({
    defaults : {
        task     : '',
        progress : 0,
        complete : true
    }
});

var ResultsModel = Backbone.Model.extend({

    createAnalysis : function(name) {

        console.log('analysis created: ' + name);
        this.trigger("analysisSelected", name);
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

        this._backstageModel = new BackstageModel();
        this._backstageModel.on('dataSetOpenRequested', this._openDataSetRequest, this);

        this._analyses = new Analyses();
        this._analyses.on('analysisCreated', this._analysisCreated, this);

        this._resultsModel = new ResultsModel();

    },
    defaults : {
        coms : null
    },
    progressModel : function() {

        return this._progressModel;
    },
    dataSetModel : function() {

        return this._dataSetModel;
    },
    backstageModel: function() {

        return this._backstageModel;
    },
    resultsModel : function() {

        return this._resultsModel;
    },
    analyses : function() {

        return this._analyses;
    },
    _openDataSetRequest : function(openRequest) {

        var self = this;

        this.open(openRequest.path).then(function() {
            self._backstageModel.notifyDataSetLoaded();
        });
    },
    connect : function() {

        var self = this;
        var coms = this.attributes.coms;

        coms.connect().then(function() {
        
            // request settings

            var settingsRequest = new coms.Messages.SettingsRequest();
            var request = new coms.Messages.ComsMessage();
            request.payload = settingsRequest.toArrayBuffer();
            request.payloadType = "SettingsRequest";
            
            return coms.send(request);

        }).then(function(response) {
        
            var settingsResponse = coms.Messages.SettingsResponse.decode(response.payload);
        
            self._backstageModel.set('settings', settingsResponse);
            return self._retrieveInfo();
            
        }).catch(function(err) {

            console.log('error ' + err);
        });

    },
    open : function(path) {

        var self = this;
        var coms = this.attributes.coms;

        var open = new coms.Messages.OpenRequest(path);
        var request = new coms.Messages.ComsMessage();
        request.payload = open.toArrayBuffer();
        request.payloadType = "OpenRequest";
        
        var onresolve = function(response) {
            self._retrieveInfo();
        };
        
        var onprogress = function(progress) {
            console.log(progress);
        };

        return coms.send(request).then(onresolve, null, onprogress);
    },
    _retrieveInfo : function() {
    
        var self = this;
        var coms = this.attributes.coms;
    
        var info = new coms.Messages.InfoRequest();
        var request = new coms.Messages.ComsMessage();
        request.payload = info.toArrayBuffer();
        request.payloadType = "InfoRequest";

        return coms.send(request).then(function(response) {
        
            var info = coms.Messages.InfoResponse.decode(response.payload);
        
            if (info.hasDataSet) {

                var columnInfo = _.map(info.schema.fields, function(field) {
                    return { name : field.name, width: field.width, measureType : self._stringifyMeasureType(field.measureType) };
                }, self);
            
                self._dataSetModel.setNew({
                    rowCount : info.rowCount,
                    columnCount : info.columnCount,
                    columns : columnInfo
                });
            }
            
            return response;
        });
    },
    _analysisCreated : function(analysis) {

        var self = this;
        var coms = this.attributes.coms;

        var analysisRequest = new coms.Messages.AnalysisRequest();
        analysisRequest.name = analysis.name;
        analysisRequest.ns = analysis.ns;

        var request = new coms.Messages.ComsMessage();
        request.payload = analysisRequest.toArrayBuffer();
        request.payloadType = "AnalysisRequest";

        var onreceive = function(message) {

            var response = coms.Messages.AnalysisResponse.decode(message.payload);
            
            var ok = false;

            if (analysis.isSetup === false
                && _.has(response, "id")
                && _.has(response, "options")) {
                
                var id = response.id;
                var options = JSON.parse(response.options);
        
                analysis.setup(id, options);
                
                ok = true;
            }
            
            if (analysis.isSetup && _.has(response, "results")) {
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
