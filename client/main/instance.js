//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const path = require('path');

const host = require('./host');
const Notify = require('./notification');

const Analyses = require('./analyses');
const DataSetViewModel = require('./dataset').DataSetViewModel;
const OptionsPB = require('./optionspb');

const Instance = Backbone.Model.extend({

    initialize() {

        this.transId = 0;
        this.command = '';
        this.seqNo = 0;

        this._dataSetModel = new DataSetViewModel({ coms: this.attributes.coms });
        this._dataSetModel.on('columnsChanged', this._columnsChanged, this);

        this._analyses = new Analyses();
        this._analyses.set('dataSetModel', this._dataSetModel);
        this._analyses.on('analysisCreated', this._analysisCreated, this);
        this._analyses.on('analysisOptionsChanged', this._runAnalysis, this);

        this._instanceId = null;

        this._onBC = (bc => this._onReceive(bc));
        this.attributes.coms.on('broadcast', this._onBC);

    },
    destroy() {
        this._dataSetModel.off('columnsChanged', this._columnsChanged, this);
        this._analyses.off('analysisCreated', this._analysisCreated, this);
        this._analyses.off('analysisOptionsChanged', this._runAnalysis, this);
        this.attributes.coms.off('broadcast', this._onBC);
    },
    defaults : {
        coms : null,
        selectedAnalysis : null,
        hasDataSet : false,
        path : null,
        title : '',
        resultsMode : 'rich',
        blank : false,
    },
    instanceId() {
        return this._instanceId;
    },
    dataSetModel() {

        return this._dataSetModel;
    },
    analyses() {

        return this._analyses;
    },
    connect(instanceId) {

        let coms = this.attributes.coms;

        return coms.connect().then(() => {

            return this._beginInstance(instanceId);

        }).then(instanceId => {

            this._instanceId = instanceId;

        }).then(() => {

            return this._retrieveInfo();

        }).then(() => {

            return this._instanceId;

        });

    },
    open(filePath) {

        let promise;
        let coms = this.attributes.coms;

        if (this.attributes.hasDataSet) {

            let instance = new Instance({ coms : coms });
            promise = instance.connect().then(() => {
                return instance.open(filePath);
            }).then(() => {
                if (this.attributes.blank && this._dataSetModel.attributes.edited === false) {
                    host.navigate(instance.instanceId());
                }
                else {
                    host.openWindow(instance.instanceId());
                    instance.destroy();
                }
            }).catch(error => {
                this._notify(error);
                instance.destroy();
            });
        }
        else {

            let open = new coms.Messages.OpenRequest(filePath);
            let request = new coms.Messages.ComsMessage();
            request.payload = open.toArrayBuffer();
            request.payloadType = 'OpenRequest';
            request.instanceId = this._instanceId;

            let onresolve = (response) => {
                let ext = path.extname(filePath);
                this.set('path', filePath);
                this.set('title', path.basename(filePath, ext));
                this._retrieveInfo();
            };

            let onprogress = (progress) => {
                console.log(progress);
            };

            let onreject = (error) => {
                this._notify(error);
            };

            promise = coms.send(request);
            promise.then(onresolve, onreject, onprogress);
        }

        return promise;
    },
    export(filePath, overwrite) {
        return this.save(filePath, overwrite, true);
    },
    save(filePath, overwrite, exp0rt) {

        if (overwrite === undefined)
            overwrite = false;
        if (exp0rt === undefined)
            exp0rt = false;

        let coms = this.attributes.coms;

        let save = new coms.Messages.SaveRequest(filePath, overwrite, exp0rt);
        let request = new coms.Messages.ComsMessage();
        request.payload = save.toArrayBuffer();
        request.payloadType = "SaveRequest";
        request.instanceId = this._instanceId;

        return new Promise((resolve, reject) => {
            coms.send(request).then((response) => {
                let info = coms.Messages.SaveProgress.decode(response.payload);
                if (info.success) {
                    if (exp0rt) {
                        resolve();
                        this._notify({ message: "Exported", cause: "Exported to '" + path.basename(filePath) + "'" });
                    }
                    else {
                        let ext = path.extname(filePath);
                        this.set('path', filePath);
                        this.set('title', path.basename(filePath, ext));
                        resolve();
                        this._notify({ message: "File Saved", cause: "Your data and results have been saved to '" + path.basename(filePath) + "'" });
                        this._dataSetModel.set('edited', false);
                    }
                }
                else {
                    if (overwrite === false && info.fileExists) {
                        let response = window.confirm("The file '" + path.basename(filePath) + "' already exists. Do you want to overwrite this file?", 'Confirm overwite');
                        if (response)
                            this.save(filePath, true, exp0rt).then(() => resolve(), (reason) => reject(reason) );
                        else
                            reject("File overwrite cancelled.");
                    }
                    else {
                        reject("File save failed.");
                    }
                }

            }).catch(error => {
                reject("File save failed.");
                this._notify(error);
            });
        });
    },
    browse(filePath) {

        let coms = this.attributes.coms;

        let fs = new coms.Messages.FSRequest();
        fs.path = filePath;

        let message = new coms.Messages.ComsMessage();
        message.payload = fs.toArrayBuffer();
        message.payloadType = "FSRequest";
        message.instanceId = this.instanceId();

        return coms.send(message)
            .then(response => coms.Messages.FSResponse.decode(response.payload));
    },
    toggleResultsMode() {

        let mode = this.attributes.resultsMode;
        if (mode === 'text')
            mode = 'rich';
        else
            mode = 'text';
        this.set('resultsMode', mode);
    },
    restartEngines() {

        let coms = this.attributes.coms;

        let analysisRequest = new coms.Messages.AnalysisRequest();
        analysisRequest.restartEngines = true;

        let request = new coms.Messages.ComsMessage();
        request.payload = analysisRequest.toArrayBuffer();
        request.payloadType = 'AnalysisRequest';
        request.instanceId = this._instanceId;

        return coms.sendP(request);
    },
    retrieveAvailableModules() {

        let coms = this.attributes.coms;

        let storeRequest = new coms.Messages.StoreRequest();

        let request = new coms.Messages.ComsMessage();
        request.payload = storeRequest.toArrayBuffer();
        request.payloadType = 'StoreRequest';
        request.instanceId = this._instanceId;

        return coms.send(request)
            .then(response => {
                return coms.Messages.StoreResponse.decode(response.payload);
            }, error => {
                throw error;
            }, progress => {
                return coms.Messages.Progress.decode(progress.payload);
            });
    },
    installModule(filePath) {

        let coms = this.attributes.coms;

        let moduleRequest = new coms.Messages.ModuleRequest();
        moduleRequest.command = coms.Messages.ModuleRequest.ModuleCommand.INSTALL;
        moduleRequest.path = filePath;

        let request = new coms.Messages.ComsMessage();
        request.payload = moduleRequest.toArrayBuffer();
        request.payloadType = 'ModuleRequest';
        request.instanceId = this._instanceId;

        return coms.send(request)
            .then(undefined, undefined, progress => {
                let pg = coms.Messages.Progress.decode(progress.payload);
                return [ pg.progress, pg.total ];
            });
    },
    uninstallModule(name) {

        let coms = this.attributes.coms;

        let moduleRequest = new coms.Messages.ModuleRequest();
        moduleRequest.command = coms.Messages.ModuleRequest.ModuleCommand.UNINSTALL;
        moduleRequest.name = name;

        let request = new coms.Messages.ComsMessage();
        request.payload = moduleRequest.toArrayBuffer();
        request.payloadType = 'ModuleRequest';
        request.instanceId = this._instanceId;

        return coms.send(request);
    },
    _notify(error) {
        let notification = new Notify({
            title: error.message,
            message: error.cause,
            duration: 3000,
        });
        this.trigger('notification', notification);
    },
    _beginInstance(instanceId) {

        let coms = this.attributes.coms;

        let instanceRequest = new coms.Messages.InstanceRequest();
        let request = new coms.Messages.ComsMessage();
        request.payload = instanceRequest.toArrayBuffer();
        request.payloadType = 'InstanceRequest';

        if (instanceId)
            request.instanceId = instanceId;

        return coms.send(request).then(response => {
            return response.instanceId;
        });
    },
    _retrieveInfo() {

        let coms = this.attributes.coms;

        let info = new coms.Messages.InfoRequest();
        let request = new coms.Messages.ComsMessage();
        request.payload = info.toArrayBuffer();
        request.payloadType = 'InfoRequest';
        request.instanceId = this._instanceId;

        return coms.send(request).then(response => {

            let info = coms.Messages.InfoResponse.decode(response.payload);

            this._dataSetModel.set('instanceId', this._instanceId);

            if (info.hasDataSet) {
                this._dataSetModel.setup(info);
                this.set('hasDataSet', true);
                this.set('title', info.title);
                this.set('path',  info.path);
                this.set('blank', info.blank);
            }

            for (let analysis of info.analyses) {
                let options = OptionsPB.fromPB(analysis.options, coms.Messages);
                this._analyses.addAnalysis(
                    analysis.name,
                    analysis.ns,
                    analysis.analysisId,
                    options,
                    analysis.results,
                    analysis.incAsText,
                    analysis.syntax);
            }

            return response;
        });
    },
    _analysisCreated(analysis) {

        if (analysis.results === null) {
            this.set('selectedAnalysis', analysis);
            this._runAnalysis(analysis);
        }
    },
    _runAnalysis(analysis, changed) {

        this._dataSetModel.set('edited', true);

        let coms = this.attributes.coms;
        let ppi = parseInt(72 * (window.devicePixelRatio || 1));

        let analysisRequest = new coms.Messages.AnalysisRequest();
        analysisRequest.analysisId = analysis.id;
        analysisRequest.name = analysis.name;
        analysisRequest.ns = analysis.ns;
        analysisRequest.revision = analysis.revision;

        if (changed)
            analysisRequest.changed = changed;

        if (analysis.isReady)
            analysisRequest.setOptions(OptionsPB.toPB(analysis.options, ppi, coms.Messages));
        else
            analysisRequest.setOptions(OptionsPB.toPB({ }, ppi, coms.Messages));

        if (analysis.deleted)
            analysisRequest.perform = 6; // delete

        let request = new coms.Messages.ComsMessage();
        request.payload = analysisRequest.toArrayBuffer();
        request.payloadType = 'AnalysisRequest';
        request.instanceId = this._instanceId;

        return coms.sendP(request);
    },
    _onReceive(message) {

        let coms = this.attributes.coms;

        if (message.payloadType === 'AnalysisResponse') {
            let response = coms.Messages.AnalysisResponse.decode(message.payload);
            let ok = false;

            let id = response.analysisId;
            let analysis = this._analyses.get(id);

            if (analysis.isReady === false && _.has(response, "options")) {
                analysis.setup(OptionsPB.fromPB(response.options, coms.Messages));
                ok = true;
            }

            if (analysis.isReady && _.has(response, "results") && response.results !== null) {
                analysis.setResults(response.results, response.incAsText, response.syntax);
                ok = true;
            }

            if (ok === false) {
                console.log("Unexpected analysis results received");
                console.log(response);
            }
        }
    },
    _columnsChanged(event) {

        this._dataSetModel.set('edited', true);

        for (let analysis of this._analyses) {
            let using = analysis.getUsing();

            let changeFound = false;
            let columnRenames = [];
            for (let changes of event.changes) {
                let column = this._dataSetModel.getColumnById(changes.id);
                let name = column.name;
                if (changes.nameChanged)
                    name = changes.oldName;
                if (using.includes(name)) {
                    if (changes.nameChanged)
                        columnRenames.push({ oldName: changes.oldName, newName: column.name });
                    changeFound = true;
                }
            }
            if (changeFound) {
                if (columnRenames.length > 0) {
                    analysis.renameColumns(columnRenames);
                    let selectedAnalysis = this.get('selectedAnalysis');
                    if (selectedAnalysis !== null && selectedAnalysis.id === analysis.id)
                        this.trigger("change:selectedAnalysis", { changed: { selectedAnalysis: analysis } });
                }
                this._runAnalysis(analysis, event.changed);
            }
        }
    },
    _stringifyMeasureType(measureType) {
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
