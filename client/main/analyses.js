
'use strict';

const $ = require('jquery');
const _ = require('underscore');
const Backbone = require('backbone');
Backbone.$ = $;

const yaml = require('js-yaml');

const host = require('./host');

const Analysis = function(id, name, ns) {

    this.id = id;
    this.name = name;
    this.ns = ns;
    this.options = null;
    this.results = null;
    this.isReady = false;
    this.incAsText = false;

    this._parent = null;
    this._defn = null;

    let url = host.baseUrl + 'analyses/' + ns + '/' + name + '/a.yaml';

    this.ready = Promise.all([
        Promise.resolve($.get(url, null, null, 'text')).then(response => {
            this._defn = yaml.safeLoad(response);
        }),
        new Promise((resolve, reject) => {
            this._notifySetup = resolve;
            this._notifyFail  = reject;
        })
    ]).then(() => {
        this.isReady = true;
    });
};

Analysis.prototype.setup = function(options) {
    this.options = options;
    this._notifySetup(this);
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

Analysis.prototype.getUsing = function() {

    let using = [ ];

    for (let option of this._defn.options) {
        let value = this.options[option.name];
        if ( ! value)
            continue;

        if (option.type === 'Variable' )
            using = _.union(using, [ value ]);
        else if (option.type === 'Variables')
            using = _.union(using, value);
    }

    return using;
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
    createAnalysis : function(name, ns) {
        let analysis = new Analysis(this._nextId++, name, ns);
        analysis._parent = this;
        this._analyses.push(analysis);
        this.trigger('analysisCreated', analysis);
    },
    addAnalysis : function(name, ns, id, options, results) {
        let analysis = new Analysis(id, name, ns);
        analysis._parent = this;
        this._analyses.push(analysis);
        analysis.setup(options);
        analysis.setResults(results);

        if (this._nextId <= id)
            this._nextId = id + 1;

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
    },
});

module.exports = Analyses;
