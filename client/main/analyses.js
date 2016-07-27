
'use strict';

var $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');
Backbone.$ = $;

var Analysis = function(id, name, ns) {

    this.id = id;
    this.name = name;
    this.ns = ns;
    this.options = null;
    this.results = null;
    this.isSetup = false;
    this.incAsText = false;

    this._parent = null;

    var self = this;

    this.ready = new Promise(function(resolve, reject) {
        self._notifyReady = resolve;
        self._notifyFail  = reject;
    });
};

Analysis.prototype.setup = function(options) {
    this.options = options;
    this.isSetup = true;
    this._notifyReady(this);
};

Analysis.prototype.setResults = function(results, incAsText, syntax) {
    this.results = results;
    this.incAsText = incAsText;
    this.syntax = syntax;
    if (this._parent !== null)
        this._parent._notifyResultsChanged(this);
};

Analysis.prototype.setOptions = function(options) {
    this.options = _.extend(this.options, options);
    if (this._parent !== null)
        this._parent._notifyOptionsChanged(this);
};

var Analyses = Backbone.Model.extend({

    initialize : function() {
        this._analyses = [ ];
        this._nextId = 1;
    },
    defaults : {
        dataSetModel : null
    },
    createAnalysis : function(name, ns) {
        var analysis = new Analysis(this._nextId++, name, ns);
        analysis._parent = this;
        this._analyses.push(analysis);
        this.trigger('analysisCreated', analysis);
    },
    get : function(id) {
        for (let i = 0; i < this._analyses.length; i++) {
            let analysis = this._analyses[i];
            if (analysis.id === id)
                return analysis;
        }
        return null;
    },
    _notifyResultsChanged : function(analysis) {
        this.trigger('analysisResultsChanged', analysis);
    },
    _notifyOptionsChanged : function(analysis) {
        this.trigger('analysisOptionsChanged', analysis);
    }
});

module.exports = Analyses;
