
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
    this.missingModule = false;
    this.arbitaryCode = false;
    this.enabled = false;

    this._parent = null;
    this._defn = null;

    this.reload();
};

Analysis.prototype.reload = function() {

    let url = host.baseUrl + 'analyses/' + this.ns + '/' + this.name + '/a.yaml';

    this.isReady = false;
    this.ready = Promise.all([
        Promise.resolve($.get(url, null, null, 'text')).then(response => {
            this._defn = yaml.safeLoad(response);
            this.options = new Options(this._defn.options);
            if (this.results === null) {
                this.results = {
                    name: '',
                    type: 'group',
                    title: this._defn.title,
                    visible: 2,
                    group: { elements: [ ] },
                    status: 'running',
                    error: null,
                };
                this._parent._notifyResultsChanged(this);
            }
        }),
        new Promise((resolve, reject) => {
            this._notifySetup = resolve;
            this._notifyFail  = reject;
        })
    ]).then(() => {
        this.arbitraryCode = this._defn.arbitraryCode === true;
        this.isReady = true;
        this.options.setValues(this.values);
    }, (error) => {
        this.isReady = true;
        this.missingModule = true;
        this.options = new Options();
    });
};

Analysis.prototype.setup = function(values) {
    this.values = values;
    this._notifySetup(this);
};

Analysis.prototype.setResults = function(results, options, incAsText, syntax) {
    this.results = results;
    this.incAsText = incAsText;
    this.syntax = syntax;
    if (this.options)
        this.options.setValues(options);
    if (this.deleted === false && this._parent !== null)
        this._parent._notifyResultsChanged(this);
};

Analysis.prototype.setOptions = function(values) {
    if (this.options.setValues(values)) {
        this.enabled = true;
        this.revision++;
        if (this.deleted === false && this._parent !== null)
            this._parent._notifyOptionsChanged(this);
    }
};

Analysis.prototype.renameColumns = function(columnRenames) {
    for (let i = 0; i < columnRenames.length; i++)
        this.options.renameColumn(columnRenames[i].oldName, columnRenames[i].newName);
    this.revision++;
    if (this.deleted === false && this._parent !== null)
        this._parent._notifyOptionsChanged(this);
};

Analysis.prototype.renameLevels = function(levelRenames) {
    for (let i = 0; i < levelRenames.length; i++)
        this.options.renameLevel(levelRenames[i].variable, levelRenames[i].oldLabel, levelRenames[i].newLabel);
    this.revision++;
    if (this.deleted === false && this._parent !== null)
        this._parent._notifyOptionsChanged(this);
};

Analysis.prototype.clearColumnUse = function(columnNames) {
    for (let i = 0; i < columnNames.length; i++)
        this.options.clearColumnUse(columnNames[i]);
    this.revision++;
    if (this.deleted === false && this._parent !== null)
        this._parent._notifyOptionsChanged(this);
};

Analysis.prototype.getUsing = function() {
    return this.options.getUsedColumns();
};

const Analyses = Backbone.Model.extend({

    initialize() {
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
    hasActiveAnalyses() {
        for (let i = 0; i < this._analyses.length; i++) {
            if (this._analyses[i].deleted === false)
                return true;
        }
        return false;
    },
    create(name, ns, index) {
        let analysis = new Analysis(this._nextId++, name, ns);
        analysis.enabled = true;
        analysis._parent = this;
        if (index !== undefined)
            this._analyses.splice(index, 0, analysis);
        else
            this._analyses.push(analysis);
        return analysis;
    },
    addAnalysis(name, ns, id, values, results, incAsText, syntax) {
        let analysis = new Analysis(id, name, ns);
        analysis._parent = this;
        this._analyses.push(analysis);
        analysis.setup(values);
        analysis.setResults(results, values, incAsText, syntax);

        if (this._nextId <= id)
            this._nextId = id + 1;

        this.trigger('analysisCreated', analysis);
        return analysis;
    },
    deleteAnalysis(id) {
        let analysis = this.get(id);
        analysis.deleted = true;
        this._notifyOptionsChanged(analysis);
        this._notifyResultsChanged(analysis);
    },
    get(id) {
        for (let i = 0; i < this._analyses.length; i++) {
            let analysis = this._analyses[i];
            if (analysis.id === id)
                return analysis;
        }
        return null;
    },
    indexOf(id) {
        for (let i = 0; i < this._analyses.length; i++) {
            let analysis = this._analyses[i];
            if (analysis.id === id)
                return i;
        }
        return -1;
    },
    _notifyResultsChanged(analysis) {
        this.trigger('analysisResultsChanged', analysis);
    },
    _notifyOptionsChanged(analysis) {
        this.trigger('analysisOptionsChanged', analysis);
    },
});

module.exports = Analyses;
