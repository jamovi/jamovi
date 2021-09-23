
'use strict';

const $ = require('jquery');
const Delta = require('quill-delta');
const Backbone = require('backbone');
Backbone.$ = $;

const host = require('./host');
const Options = require('./options');

const Analysis = function(id, name, ns, modules) {

    this.id = id;
    this.name = name;
    this.ns = ns;
    this.modules = modules;
    this.values = null;
    this.results = null;
    this.options = null;
    this.isReady = false;
    this.incAsText = false;
    this.references = [ ];
    this.index = -1;
    this.uijs = undefined;
    this.i18nTable = undefined;

    this.revision = 0;
    this.missingModule = false;
    this.arbitaryCode = false;
    this.enabled = false;

    this._parent = null;
    this._defn = null;
    this.dependsOn = null;
    this.dependents = [ ];

    this.reload();
};

Analysis.prototype.addDependent = function(analysis) {
    this.dependents.push(analysis);
    analysis.dependsOn = this;
    delete analysis.waitingFor;
};

Analysis.prototype.getCurrentI18nCode = async function() {
    return await this.modules.getCurrentI18nCode(this.ns);
};

Analysis.prototype.reload = async function() {

    if (this.ns === 'jmv' && this.name === 'empty') {
        this._notifySetup = function() {};
        this.isReady = true;
        this.ready = Promise.resolve();
        this.options = new Options();
        return;
    }

    this.isReady = false;
    this.ready = (async () => {

        let waitForDefn = (async () => {
            let defn = await this.modules.getDefn(this.ns, this.name);
            let i18nDefn = await this.modules.getI18nDefn(this.ns);
            this.i18n = i18nDefn;
            this.options = new Options(defn.options, this.translate.bind(this));
            this.uijs = defn.uijs;
            return defn;
        })();

        let waitForSetup = new Promise((resolve, reject) => {
            this._notifySetup = resolve;
            this._notifyFail  = reject;
        });

        try {
            await Promise.all([ waitForDefn, waitForSetup ]);
            let defn = await waitForDefn;
            this.arbitraryCode = (defn.arbitraryCode === true);
            this.missingModule = false;
            this.options.setValues(this.values);
            this.isReady = true;
        }
        catch (e) {
            this.missingModule = true;
            this.options = new Options();
            this.isReady = true;
        }

    })();
};

Analysis.prototype.translate = function(key) {
    if (this.i18n) {
        let value = this.i18n.locale_data.messages[key][0];
        if (value)
            return value;
    }
    return key;
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

Analysis.prototype.updateHeading = function(values) {
    let heading = this.options.getHeading();
    if (this._parent !== null)
        this._parent._notifyHeadingChanged(this);
};

Analysis.prototype.getHeading = function() {
    return this.options.getHeading();
};

Analysis.prototype.annotationChanged = function(sender, address) {
    if (this._parent !== null)
        this._parent._notifyAnnotationChanged(sender, this, address);
};

Analysis.prototype.hasUserOptions = function() {
    return this.name !== 'empty';
};

Analysis.prototype.setOptions = function(values) {
    if (this.options.setValues(values)) {
        this.enabled = true;
        this.revision++;
        if (this._parent !== null)
            this._parent._notifyOptionsChanged(this);
    }
};

Analysis.prototype.notifyColumnsRenamed = function(columnRenames) {
    for (let i = 0; i < columnRenames.length; i++)
        this.options.renameColumn(columnRenames[i].oldName, columnRenames[i].newName);
    this.revision++;
};

Analysis.prototype.notifyLevelsRenamed = function(levelRenames) {
    for (let i = 0; i < levelRenames.length; i++)
        this.options.renameLevel(levelRenames[i].variable, levelRenames[i].oldLabel, levelRenames[i].newLabel);
    this.revision++;
};

Analysis.prototype.clearColumnUse = function(columnNames) {
    for (let i = 0; i < columnNames.length; i++)
        this.options.clearColumnUse(columnNames[i]);
    this.revision++;
    if (this._parent !== null)
        this._parent._notifyOptionsChanged(this);
};

Analysis.prototype.getUsingColumns = function() {
    return this.options.getAssignedColumns();
};

Analysis.prototype.getUsingOutputs = function() {
    return this.options.getAssignedOutputs();
};

Analysis.prototype.isFirst = function() {
    return this.index === 0;
};

const Analyses = Backbone.Model.extend({

    initialize() {
        this._analyses = [ ];
        this._nextId = 2;  // client side created analyses always have even ids

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
        dataSetModel : null,
        modules: null,
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
        let id = options.id;
        if (id === undefined) {
            id = this._nextId;
            this._nextId = this._nextId + 2;
        }
        else {
            if (id >= this._nextId)
                if (id % 2 === 0)
                    this._nextId = id + 2;
                else
                    this._nextId = id + 1;
        }

        let modules = this.attributes.modules;
        let analysis = new Analysis(id, name, ns, modules);

        if (options.dependsOn && options.dependsOn > 0) {
            let patron = this.get(options.dependsOn/*, true*/);
            if (patron !== null)
                patron.addDependent(analysis);
            else
                analysis.waitingFor = options.dependsOn;
        }

        if (id !== 0) {
            for (let current of this._analyses) {
                if (current.waitingFor === id)
                    analysis.addDependent(current);
            }
        }

        analysis.enabled = (options.enabled === undefined ? true : options.enabled);

        let index = options.index !== undefined ? options.index : this._analyses.length;
        analysis.index = index;
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
            title: options.title || undefined,
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
    deleteDependentAnalyses(analysis) {
        for (let i = 0; i < this._analyses.length; i++) {
            let dependent = this._analyses[i];
            if (dependent.dependsOn === analysis) {
                let index = this.indexOf(dependent.id);

                if (dependent.name === 'empty') {
                    // before remove inbetween annotation move its contents to the previous annotation
                    let previous = this._analyses[index - 1];
                    let removingData = dependent.options.getOption('results//topText');
                    if (removingData) {
                        let removingDelta = new Delta(removingData.getValue());
                        let previousData = previous.options.getOption('results//topText');
                        let previousDelta = null;
                        if (previousData) {
                            previousDelta = new Delta(previousData.getValue());
                            previous.options.setValues({'results//topText': { ops: previousDelta.concat(removingDelta).ops } });
                        }
                        else
                            previous.options.setValues({'results//topText': { ops: removingDelta.ops } });
                    }

                    this._notifyOptionsChanged(previous);
                    this._notifyResultsChanged(previous);
                    ////////
                }

                this._analyses.splice(index, 1);
                for (let i = 0; i < this._analyses.length; i++)
                    this._analyses[i].index = i;
                this._notifyAnalysisDeleted(dependent);
            }
        }
    },
    deleteAnalysis(id) {
        let index = this.indexOf(id);
        let analysis = this._analyses[index];
        if (analysis.name === 'empty') {
            if (index === 0)
                analysis.options.setValues( { 'results//heading': _('Results'), 'results//topText': null });
            else
                analysis.options.setValues( { 'results//topText': null } );
            this._notifyOptionsChanged(analysis);
            this._notifyResultsChanged(analysis);
        }
        else {
            this._analyses.splice(index, 1);
            for (let i = 0; i < this._analyses.length; i++)
                this._analyses[i].index = i;
            this._notifyAnalysisDeleted(analysis);

            this.deleteDependentAnalyses(analysis);
        }
    },
    onDeleteAll() {
        let analyses = this._analyses.slice().reverse();
        this._analyses = [];
        for (let analysis of analyses)
            this._notifyAnalysisDeleted(analysis);
    },
    get(id) {
        if (id > 0) {
            for (let i = 0; i < this._analyses.length; i++) {
                let analysis = this._analyses[i];
                if (analysis.id === id)
                    return analysis;
            }
        }
        return null;
    },
    indexOf(id) {
        if (id > 0) {
            for (let i = 0; i < this._analyses.length; i++) {
                let analysis = this._analyses[i];
                if (analysis.id === id)
                    return i;
            }
        }
        return -1;
    },
    getAnalysisUsingOutput(outputName) {
        for (let i = 0; i < this._analyses.length; i++) {
            let analysis = this._analyses[i];
            let usingOutputs = analysis.getUsingOutputs();
            for (let j = 0; j < usingOutputs.length; j++) {
                if ( (usingOutputs[j] === outputName))
                    return analysis;
            }
        }
        return null;
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
    _notifyHeadingChanged(analysis) {
        this.trigger('analysisHeadingChanged', analysis);
    },
    _notifyAnnotationChanged(sender, analysis, address) {
        this.trigger('analysisAnnotationChanged', sender, analysis, address);
    }
});

module.exports = Analyses;
