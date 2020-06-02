
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
    this.references = [ ];
    this.index = -1;

    this.revision = 0;
    this.missingModule = false;
    this.arbitaryCode = false;
    this.enabled = false;

    this._parent = null;
    this._defn = null;

    this.reload();
};

Analysis.prototype.reload = function() {

    let url = `../analyses/${ this.ns }/${ this.name }/a.yaml`;

    this.isReady = false;
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

Analysis.prototype.setResults = function(res) {
    this.results = res.results;
    this.incAsText = res.incAsText;
    this.references = res.references;
    if (this.options)
        this.options.setValues(res.options);
    if (this._parent !== null)
        this._parent._notifyResultsChanged(this);
};

Analysis.prototype.setOptions = function(values) {
    if (this.options.setValues(values)) {
        this.enabled = true;
        this.revision++;
        if (this._parent !== null)
            this._parent._notifyOptionsChanged(this);
    }
};

Analysis.prototype.renameColumns = function(columnRenames) {
    for (let i = 0; i < columnRenames.length; i++)
        this.options.renameColumn(columnRenames[i].oldName, columnRenames[i].newName);
    this.revision++;
    if (this._parent !== null)
        this._parent._notifyOptionsChanged(this);
};

Analysis.prototype.renameLevels = function(levelRenames) {
    for (let i = 0; i < levelRenames.length; i++)
        this.options.renameLevel(levelRenames[i].variable, levelRenames[i].oldLabel, levelRenames[i].newLabel);
    this.revision++;
    if (this._parent !== null)
        this._parent._notifyOptionsChanged(this);
};

Analysis.prototype.clearColumnUse = function(columnNames) {
    for (let i = 0; i < columnNames.length; i++)
        this.options.clearColumnUse(columnNames[i]);
    this.revision++;
    if (this._parent !== null)
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
        return this._analyses.length > 0;
    },
    count() {
        return this._analyses.length;
    },
    create(options) {
        let name = options.name;
        let ns = options.ns;
        let id = options.id || this._nextId++;
        let index = options.index !== undefined ? options.index : this._analyses.length;

        if (options.id && options.id >= this._nextId)
            this._nextId = options.id + 1;

        let analysis = new Analysis(id, name, ns);
        analysis.index = index;
        analysis.enabled = (options.enabled === undefined ? true : options.enabled);

        this._analyses.splice(index, 0, analysis);
        if (index < this._analyses.length - 1) {
            for (let i = 0; i < this._analyses.length; i++)
                this._analyses[i].index = i;
        }

        if (options.options)
            analysis.setup(options.options);

        let results = options.results || {
            name: '',
            type: 'group',
            title: options.title || name,
            visible: 2,
            group: { elements: [
                {
                    name: '',
                    type: 'image',
                    title: '',
                    visible: 2,
                    image: {
                        path: '',
                        width: 500,
                        height: 100,
                    },
                    status: 2,
                    error: null,
                },
            ]},
            status: 2,
            error: null,
        };

        results.index = index + 1;  // indexed from 1

        analysis.setResults({
            options: options.options,
            incAsText: options.incAsText || '',
            references: options.references || [ ],
            results: results,
        });

        analysis._parent = this;
        this._notifyAnalysisCreated(analysis);

        return analysis;
    },
    deleteAnalysis(id) {
        let index = this.indexOf(id);
        let analysis = this._analyses[index];
        this._analyses.splice(index, 1);
        for (let i = 0; i < this._analyses.length; i++)
            this._analyses[i].index = i;
        this._notifyAnalysisDeleted(analysis);
    },
    deleteAll() {
        let analyses = this._analyses.slice().reverse();
        for (let analysis of analyses)
            this.deleteAnalysis(analysis.id);
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
    _notifyAnalysisCreated(analysis) {
        this.trigger('analysisCreated', analysis);
    },
    _notifyAnalysisDeleted(analysis) {
        this.trigger('analysisDeleted', analysis);
    },
});

module.exports = Analyses;
