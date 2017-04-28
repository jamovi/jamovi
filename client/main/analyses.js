
'use strict';

const $ = require('jquery');
const _ = require('underscore');
const Backbone = require('backbone');
Backbone.$ = $;

const yaml = require('js-yaml');

const host = require('./host');
const Options = require('./options');

const Analysis = function(id, name, ns) {

    this.id = id;
    this.name = name;
    this.ns = ns;
    this.values = null;
    this.results = null;
    this.options = null;
    this.isReady = false;
    this.incAsText = false;
    this.revision = 0;
    this.deleted = false;

    this._parent = null;
    this._defn = null;

    let url = host.baseUrl + 'analyses/' + ns + '/' + name + '/a.yaml';

    this.ready = Promise.all([
        Promise.resolve($.get(url, null, null, 'text')).then(response => {
            this._defn = yaml.safeLoad(response);
            this.options = new Options(this._defn.options);
        }),
        new Promise((resolve, reject) => {
            this._notifySetup = resolve;
            this._notifyFail  = reject;
        })
    ]).then(() => {
        this.isReady = true;
        this.options.setValues(this.values);
    });
};

Analysis.prototype.setup = function(values) {
    this.values = values;
    this._notifySetup(this);
};

Analysis.prototype.setResults = function(results, incAsText, syntax) {
    this.results = results;
    this.incAsText = incAsText;
    this.syntax = syntax;
    if (this.deleted === false && this._parent !== null)
        this._parent._notifyResultsChanged(this);
};

Analysis.prototype.setOptions = function(values) {
    this.options.setValues(values);
    this.revision++;
    if (this.deleted === false && this._parent !== null)
        this._parent._notifyOptionsChanged(this);
};

Analysis.prototype.renameColumns = function(columnRenames) {
    for (let i = 0; i < columnRenames.length; i++)
        this.options.renameColumn(columnRenames[i].oldName, columnRenames[i].newName);
    this.revision++;
    if (this.deleted === false && this._parent !== null)
        this._parent._notifyOptionsChanged(this);
};

Analysis.prototype.getUsing = function() {
    return this.options.getUsedColumns();
};

const Analyses = Backbone.Model.extend({

    initialize : function() {
        this._analyses = [ ];
        this._nextId = 1;

        this[Symbol.iterator] = () => {
            let index = 0;
            return {
                next: () => {
                    let ret = { };
                    if (index < this._analyses.length) {
                        ret.value = this._analyses[index];
                        ret.done = false;
                        index++;
                    }
                    else {
                        ret.done = true;
                    }
                    return ret;
               }
            };
        };
    },
    defaults : {
        dataSetModel : null
    },
    hasActiveAnalyses : function() {
        for (let i = 0; i < this._analyses.length; i++) {
            if (this._analyses[i].deleted === false)
                return true;
        }
        return false;
    },
    createAnalysis : function(name, ns) {
        let analysis = new Analysis(this._nextId++, name, ns);
        analysis._parent = this;
        this._analyses.push(analysis);
        this.trigger('analysisCreated', analysis);
    },
    addAnalysis : function(name, ns, id, values, results, incAsText, syntax) {
        let analysis = new Analysis(id, name, ns);
        analysis._parent = this;
        this._analyses.push(analysis);
        analysis.setup(values);
        analysis.setResults(results, incAsText, syntax);

        if (this._nextId <= id)
            this._nextId = id + 1;

        this.trigger('analysisCreated', analysis);
    },
    deleteAnalysis : function(id) {
        let analysis = this.get(id);
        analysis.deleted = true;
        this._notifyOptionsChanged(analysis);
        this._notifyResultsChanged(analysis);
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
    },
});

module.exports = Analyses;
