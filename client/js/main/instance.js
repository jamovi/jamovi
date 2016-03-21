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
            'open',
            '_retrieveCells',
            '_requestCells');

        this.transId = 0;
        this.command = '';
        this.seqNo = 0;

        this._dataSetModel = new DataSetViewModel({ coms: this.attributes.coms });
        this._dataSetModel.on('change:viewport', this._retrieveCells, this);

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
    _openDataSetRequest : function(params) {

        var self = this;

        this.open(params.path).then(function() {
            self._backstageModel.notifyDataSetLoaded();
        });
    },
    connect : function() {

        var self = this;
        var coms = this.attributes.coms;

        coms.connect().then(function() {
        
            // request settings

            var params = new coms.Messages.SettingsReqParams();
            var request = new coms.Messages.Request();
            request.settings = params;
            
            return coms.send(request);

        }).then(function(response) {
        
            self._backstageModel.set('settings', response.settings);
            return self._retrieveInfo();
            
        }).catch(function(err) {

            console.log('error ' + err);
        });

    },
    open : function(path) {

        var self = this;
        var coms = this.attributes.coms;

        var params  = new coms.Messages.OpenReqParams(path);
        var request = new coms.Messages.Request();
        request.open = params;
        
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
    
        var params  = new coms.Messages.InfoReqParams();
        var request = new coms.Messages.Request();
        request.info = params;

        return coms.send(request).then(function(response) {
        
            var params = response.info;
        
            if (params.hasDataSet) {

                var columnInfo = _.map(params.schema.fields, function(field) {
                    return { name : field.name, width: field.width, measureType : self._stringifyMeasureType(field.measureType) };
                }, self);
            
                self._dataSetModel.setNew({
                    rowCount : params.rowCount,
                    columnCount : params.columnCount,
                    columns : columnInfo
                });
            }
            
            return response;
        });
    },
    _analysisCreated : function(analysis) {

        var self = this;
        var coms = this.attributes.coms;

        var params = new coms.Messages.AnalysisReqParams();
        params.name = analysis.name;
        params.ns = analysis.ns;

        var request = new coms.Messages.Request();
        request.analysis = params;

        return coms.send(request).then(function(response) {

            var analysisId = response.analysis.analysisId;
            var options = JSON.parse(response.analysis.options);
            
            analysis.setup(analysisId, options);
        });
    },
    _retrieveCells : function() {
        this._viewport = this._dataSetModel.get('viewport');
        this._requestCells();
    },
    _requestCells : function() {

        var self = this;
        var coms = this.attributes.coms;

        var params = new coms.Messages.CellsReqParams();
        params.rowStart    = this._viewport.top;
        params.columnStart = this._viewport.left;
        params.rowEnd      = this._viewport.bottom;
        params.columnEnd   = this._viewport.right;

        var request = new coms.Messages.Request();
        request.cells = params;

        return coms.send(request).then(function(response) {

            var params = response.cells;
            var columns = params.columns;

            var rowStart    = params.reqParams.get('rowStart');
            var columnStart = params.reqParams.get('columnStart');
            var rowEnd      = params.reqParams.get('rowEnd');
            var columnEnd   = params.reqParams.get('columnEnd');

            var viewport = { left : columnStart, top : rowStart, right : columnEnd, bottom : rowEnd };

            var columnCount = columnEnd - columnStart + 1;
            var rowCount    = rowEnd    - rowStart + 1;

            var cells = new Array(columnCount);

            for (var colNo = 0; colNo < columnCount; colNo++) {

                var column = columns[colNo];
                var values = column.get(column.cells).values;

                cells[colNo] = values;
            }

            self._dataSetModel.setCells(viewport, cells);
        
            return response;
            
        }).catch(function(err) {
        
            console.log(err);
        });
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
