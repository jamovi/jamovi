
'use strict';

import Delta from 'quill-delta';

import Options from './options';
import { ContextableEventEmittier } from '../common/eventmap';
import DataSetViewModel from './dataset';
import { Modules } from './modules';

export class Analysis {
    id: number;
    name: string;
    ns: string;
    modules: Modules
    index: number = -1;
    enabled: boolean = false;
    arbitraryCode: boolean = false;
    missingModule: boolean = false;
    revision: number = 0;
    options: Options;
    results: any;
    ready: Promise<void>;
    isReady: boolean;
    i18n: any;
    uijs: string;


    constructor(id, name, ns, modules) {

        this.id = id;
        this.name = name;
        this.ns = ns;
        this.modules = modules;
        this.values = null;
        this.results = null;
        this.options = null;
        this.isReady = false;
        this.references = [ ];
        this.uijs = undefined;

        this._parent = null;
        this._defn = null;
        this.dependsOn = null;
        this.dependents = [ ];

        this.reload();
    }

    addDependent(analysis) {
        this.dependents.push(analysis);
        analysis.dependsOn = this;
        delete analysis.waitingFor;
    }

    async getCurrentI18nCode() {
        return await this.modules.getCurrentI18nCode(this.ns);
    }

    async reload() {

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
                this.options = new Options(defn.options);
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
                this.arbitraryCode = (defn.arbitraryCode || defn.arbitraryCode2);
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
    }

    translate(key) {
        if (this.i18n) {
            let value = this.i18n.locale_data.messages[key][0];
            if (value)
                return value;
        }
        return key;
    }

    setup(values) {
        this.values = values;
        this._notifySetup(this);
    }

    async setResults(res, internal) {
        if (internal === undefined)
            internal = false;

        this.results = res.results;
        this.references = res.references;
        this.arbitraryCode = res.arbitraryCode;
        this.enabled = (res.enabled === undefined ? true : res.enabled);
        if (this.options) {
            if (this.options.setValues(res.options)) {
                if (this._parent !== null) 
                    this._parent._notifyOptionsChanged(this, !internal);
            }
        }
        if (this._parent !== null)
            this._parent._notifyResultsChanged(this);
    }

    updateHeading() {
        if (this._parent !== null)
            this._parent._notifyHeadingChanged(this);
    }

    getHeading() {
        return this.options.getHeading();
    }

    annotationChanged(sender, address) {
        if (this._parent !== null)
            this._parent._notifyAnnotationChanged(sender, this, address);
    }

    hasUserOptions() {
        return this.name !== 'empty';
    }

    setOptions(values) {
        if (this.options.setValues(values)) {
            this.enabled = true;
            this.revision++;
            if (this._parent !== null)
                this._parent._notifyOptionsChanged(this);
        }
    }

    enable() {
        if (this.enabled)
            return;
        this.enabled = true;
        if (this._parent !== null)
            this._parent._notifyOptionsChanged(this);
    }

    notifyColumnsRenamed(columnRenames) {
        for (let i = 0; i < columnRenames.length; i++)
            this.options.renameColumn(columnRenames[i].oldName, columnRenames[i].newName);
        this.revision++;
    }

    notifyLevelsRenamed(levelRenames) {
        for (let i = 0; i < levelRenames.length; i++)
            this.options.renameLevel(levelRenames[i].variable, levelRenames[i].oldLabel, levelRenames[i].newLabel);
        this.revision++;
    }

    clearColumnUse(columnNames) {
        for (let i = 0; i < columnNames.length; i++)
            this.options.clearColumnUse(columnNames[i]);
        this.revision++;
        if (this._parent !== null)
            this._parent._notifyOptionsChanged(this);
    }

    getUsingColumns() {
        return this.options.getAssignedColumns();
    }

    getUsingOutputs() {
        return this.options.getAssignedOutputs();
    }

    isFirst() {
        return this.index === 0;
    }
}

interface CreateOpts {
    readonly name: string;
    readonly ns: string;
    readonly title?: string;
    readonly id?: number;
    readonly index?: number;
    readonly dependsOn?: number;
    readonly options?: typeof Options;
    readonly results?: any;
    readonly references?: any;
    readonly enabled?: boolean;
    readonly arbitraryCode?: boolean;
}

class Analyses extends ContextableEventEmittier {

    dataSetModel: DataSetViewModel;
    modules: Modules;
    _nextId: number = 2; // client side created analyses always have even ids
    _analyses: Analysis[] = [];


    constructor(model: DataSetViewModel, modules: Modules) {
        super();

        this.dataSetModel = model;
        this.modules = modules;

        this._analyses = [ ];

        this[Symbol.iterator] = () => {
            let index = 0;
            return {
                next: () => {
                    if (index < this._analyses.length) {
                        index++;
                        return { value: this._analyses[index-1], done: false };
                    }
                    else {
                        return { done: true };
                    }
               }
            };
        };
    }

    [Symbol.iterator](): Iterator<Analysis> {
        let index = 0;
        const data = this._analyses;

        return {
            next(): IteratorResult<Analysis> {
                if (index < data.length)
                    return { value: data[index++], done: false };
                else
                    return { value: undefined as any, done: true };
            }
        };
    }

    hasActiveAnalyses() {
        return this._analyses.length > 0;
    }

    count() {
        return this._analyses.length;
    }

    async create(options: CreateOpts): Promise<Analysis> {
        
        let name = options.name;
        let ns = options.ns;
        let id = options.id;
        if (id === undefined) {
            id = this._nextId;
            this._nextId = this._nextId + 2;
        }
        else {
            if (id >= this._nextId) {
                if (id % 2 === 0)
                    this._nextId = id + 2;
                else
                    this._nextId = id + 1;
            }
        }

        let modules = this.modules;
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

        await analysis.setResults({
            options: options.options,
            references: options.references || [ ],
            results: results,
            enabled: options.enabled,
            arbitraryCode: options.arbitraryCode,
        }, true);

        analysis._parent = this;
        this._notifyAnalysisCreated(analysis);

        return analysis;
    }

    deleteDependentAnalyses(analysis: Analysis) {
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
    }

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
    }

    onDeleteAll() {
        let analyses = this._analyses.slice().reverse();
        this._analyses = [];
        for (let analysis of analyses)
            this._notifyAnalysisDeleted(analysis);
    }

    get(id: number): Analysis | null {
        if (id > 0) {
            for (let i = 0; i < this._analyses.length; i++) {
                let analysis = this._analyses[i];
                if (analysis.id === id)
                    return analysis;
            }
        }
        return null;
    }

    indexOf(id: number) : number {
        if (id > 0) {
            for (let i = 0; i < this._analyses.length; i++) {
                let analysis = this._analyses[i];
                if (analysis.id === id)
                    return i;
            }
        }
        return -1;
    }

    getAnalysisUsingOutput(outputName: string): Analysis | null {
        for (let i = 0; i < this._analyses.length; i++) {
            let analysis = this._analyses[i];
            let usingOutputs = analysis.getUsingOutputs();
            for (let j = 0; j < usingOutputs.length; j++) {
                if ( (usingOutputs[j] === outputName))
                    return analysis;
            }
        }
        return null;
    }

    _notifyResultsChanged(analysis: Analysis): void {
        this.trigger('analysisResultsChanged', analysis);
    }

    _notifyOptionsChanged(analysis: Analysis, incoming: boolean) : void {  // incoming is true if the options have been changed as a result of the server. It will be falsey if the change to the options has occured because of the client.
        this.trigger('analysisOptionsChanged', analysis, incoming);
    }

    _notifyAnalysisCreated(analysis: Analysis): void {
        this.trigger('analysisCreated', analysis);
    }

    _notifyAnalysisDeleted(analysis: Analysis): void {
        this.trigger('analysisDeleted', analysis);
    }

    _notifyHeadingChanged(analysis: Analysis): void {
        this.trigger('analysisHeadingChanged', analysis);
    }

    _notifyAnnotationChanged(sender, analysis: Analysis, address): void {
        this.trigger('analysisAnnotationChanged', sender, analysis, address);
    }
}

export default Analyses;
