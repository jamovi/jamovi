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
const DataSetViewModel = require('./dataset');
const OptionsPB = require('./optionspb');

const Settings = require('./settings');

const Instance = Backbone.Model.extend({

    initialize() {

        this.transId = 0;
        this.command = '';
        this.seqNo = 0;

        this._settings = new Settings({ coms: this.attributes.coms });

        this._dataSetModel = new DataSetViewModel({ coms: this.attributes.coms });
        this._dataSetModel.on('columnsChanged', this._columnsChanged, this);

        this._analyses = new Analyses();
        this._analyses.set('dataSetModel', this._dataSetModel);
        this._analyses.on('analysisCreated', this._analysisCreated, this);
        this._analyses.on('analysisOptionsChanged', this._runAnalysis, this);

        this._settings.on('change:theme', event => this._themeChanged());

        this._instanceId = null;

        this._onBC = (bc => this._onReceive(bc));
        this.attributes.coms.on('broadcast', this._onBC);

    },
    destroy() {
        this._dataSetModel.off('columnsChanged', this._columnsChanged, this);
        this._analyses.off('analysisCreated', this._analysisCreated, this);
        this._analyses.off('analysisOptionsChanged', this._runAnalysis, this);
        this.attributes.coms.off('broadcast', this._onBC);
        this._settings.destroy();
    },
    defaults : {
        coms : null,
        selectedAnalysis : null,
        hasDataSet : false,
        path : null,
        title : '',
        blank : false,
        importPath : '',
        resultsSupplier: null,
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
    settings() {
        return this._settings;
    },
    connect(instanceId) {

        let coms = this.attributes.coms;

        return coms.connect().then(() => {

            return this._beginInstance(instanceId);

        }).then(() => {

            return this._settings.retrieve(this._instanceId);

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

                let info = coms.Messages.OpenProgress.decode(response.payload);
                let filePath = info.path;
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
    save(filePath, options, overwrite, recursed) {  // recursed argument is a hack

        if (options === undefined)
            options = { export: false, part: '' };
        if (options.name === undefined)
            options.name = 'Element';
        if (options.export === undefined)
            options.export = false;
        if (options.part === undefined)
            options.part = '';
        if (options.format === undefined)
            options.format = '';
        if (overwrite === undefined)
            overwrite = false;

        let coms = this.attributes.coms;

        return Promise.resolve().then(() => {

            return host.nameAndVersion;

        }).then(app => {

            // Generate content if necessary

            if (options.content) {
                return options.content;
            }
            else if (options.partType === 'image') {
                // images are handled specially below
                return undefined;
            }
            else if (filePath.endsWith('.omv')) {
                return this.attributes.resultsSupplier.getAsHTML({images:'relative', generator:app});
            }
            else if (filePath.endsWith('.html')) {
                return this.attributes.resultsSupplier.getAsHTML({images:'inline', generator:app}, options.part);
            }
            else if (filePath.endsWith('.pdf')) {
                return this.attributes.resultsSupplier.getAsHTML({images:'absolute', generator:app}, options.part)
                    .then(html => this._requestPDF(html));
            }
            else {
                return undefined;
            }

        }).then(content => {

            // Send the save request

            let save = new coms.Messages.SaveRequest(
                filePath,
                overwrite,
                options.export,
                options.part,
                options.format);

            if (content) {
                if (typeof content === 'string')
                    content = new TextEncoder('utf-8').encode(content);
                save.incContent = true;
                save.content = content;
                options.content = content;
            }

            let request = new coms.Messages.ComsMessage();
            request.payload = save.toArrayBuffer();
            request.payloadType = 'SaveRequest';
            request.instanceId = this._instanceId;

            return coms.send(request)
                .catch((err) => { throw err.cause; });

        }).then(response => {

            // Handle the response

            let info = coms.Messages.SaveProgress.decode(response.payload);
            if (info.success) {
                if (options.export) {
                    return { message: "Exported", cause: "Exported to '" + path.basename(filePath) + "'" };
                }
                else {
                    if (info.path)
                        filePath = info.path;
                    let ext = path.extname(filePath);
                    this.set('path', filePath);
                    this.set('title', path.basename(filePath, ext));
                    this._dataSetModel.set('edited', false);
                    return { message: "File Saved", cause: "Saved to '" + path.basename(filePath) + "'" };
                }
            }
            else {
                if (overwrite === false && info.fileExists) {
                    let response = window.confirm("The file '" + path.basename(filePath) + "' already exists. Overwrite this file?", 'Confirm overwite');
                    if (response)
                        return this.save(filePath, options, true, true);
                    else
                        return Promise.reject();  // cancelled
                }
                else {
                    Promise.reject("File save failed.");
                }
            }

        }).then(message => {  // this stuff should get moved to the caller (so we can call this recursively)
            if ( ! recursed && message) // hack!
                this._notify(message);
            return message;
        }).catch(error => {
            if ( ! recursed && error) // if not cancelled
                this._notify({ message: 'Save failed', cause: error, type: 'error' });
            throw error;
        });
    },
    browse(filePath) {

        let coms = this.attributes.coms;

        let fs = new coms.Messages.FSRequest();
        fs.path = filePath;

        let message = new coms.Messages.ComsMessage();
        message.payload = fs.toArrayBuffer();
        message.payloadType = 'FSRequest';
        message.instanceId = this.instanceId();

        return coms.send(message)
            .then(response => {
                return coms.Messages.FSResponse.decode(response.payload);
            });
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

        let moduleRequest = new coms.Messages.ModuleRR();
        moduleRequest.command = coms.Messages.ModuleRR.ModuleCommand.INSTALL;
        moduleRequest.path = filePath;

        let request = new coms.Messages.ComsMessage();
        request.payload = moduleRequest.toArrayBuffer();
        request.payloadType = 'ModuleRR';
        request.instanceId = this._instanceId;

        return coms.send(request)
            .then(undefined, undefined, progress => {
                let pg = coms.Messages.Progress.decode(progress.payload);
                return [ pg.progress, pg.total ];
            });
    },
    uninstallModule(name) {

        let coms = this.attributes.coms;

        let moduleRequest = new coms.Messages.ModuleRR();
        moduleRequest.command = coms.Messages.ModuleRR.ModuleCommand.UNINSTALL;
        moduleRequest.name = name;

        let request = new coms.Messages.ComsMessage();
        request.payload = moduleRequest.toArrayBuffer();
        request.payloadType = 'ModuleRR';
        request.instanceId = this._instanceId;

        return coms.send(request);
    },
    _themeChanged() {
        for (let analysis of this.analyses())
            this._runAnalysis(analysis, 'theme');
    },
    _notify(error) {
        let notification = new Notify({
            title: error.message,
            message: error.cause,
            duration: 3000,
            type: error.type ? error.type : 'info',
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
            this._instanceId = response.instanceId;
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
                this.set('importPath', info.importPath);
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

        let theme = this._settings.getSetting('theme', 'default');

        let analysisRequest = new coms.Messages.AnalysisRequest();
        analysisRequest.analysisId = analysis.id;
        analysisRequest.name = analysis.name;
        analysisRequest.ns = analysis.ns;
        analysisRequest.revision = analysis.revision;

        if (changed)
            analysisRequest.changed = changed;

        let options = { };
        if (analysis.isReady)
            options = analysis.options;

        analysisRequest.setOptions(OptionsPB.toPB(options, { '.ppi' : ppi, 'theme' : theme }, coms.Messages));

        if (analysis.deleted)
            analysisRequest.perform = 6; // DELETE

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

            let id = response.analysisId;
            let analysis = this._analyses.get(id);
            let options = OptionsPB.fromPB(response.options, coms.Messages);

            if (analysis.isReady === false)
                analysis.setup(options);

            if (response.results)
                analysis.setResults(response.results, options, response.incAsText, response.syntax);
        }
        else if (message.payloadType === 'ModuleRR') {
            let response = coms.Messages.ModuleRR.decode(message.payload);
            let moduleName = response.name;

            for (let analysis of this._analyses) {
                if (analysis.ns === moduleName)
                    analysis.reload();
            }

            this.trigger('moduleInstalled', { name: moduleName });
        }
        else if (message.payloadType === 'LogRR') {
            let log = coms.Messages.LogRR.decode(message.payload);
            console.log(log.content);
        }
    },
    _columnsChanged(event) {

        this._dataSetModel.set('edited', true);

        for (let analysis of this._analyses) {
            if (analysis.isReady === false)
                continue;
                
            let using = analysis.getUsing();

            let columnDataChanged = false;
            let columnDeleted = false;
            let columnRenamed = false;
            let levelsRenamed = false;
            let columnRenames = [];
            let levelRenames = [];
            let columnDeletes = [];

            for (let changes of event.changes) {

                if (changes.deleted) {
                    if (using.includes(changes.name)) {
                        columnDeleted = true;
                        columnDeletes.push(changes.name);
                    }
                }
                else {
                    let column = this._dataSetModel.getColumnById(changes.id);
                    if (using.includes(column.name))
                        columnDataChanged = true;
                    if (changes.nameChanged && using.includes(changes.oldName)) {
                        columnRenamed = true;
                        columnRenames.push({ oldName: changes.oldName, newName: column.name });
                    }
                    if (changes.levelsChanged) {
                        levelsRenamed = changes.levelNameChanges.length > 0;
                        for (let i = 0; i < changes.levelNameChanges.length; i++)
                            levelRenames.push({ variable: column.name, oldLabel: changes.levelNameChanges[i].oldLabel, newLabel: changes.levelNameChanges[i].newLabel });
                    }
                }
            }

            if (columnRenamed)
                analysis.renameColumns(columnRenames);

            if (levelsRenamed)
                analysis.renameLevels(levelRenames);


            if (columnDataChanged || columnRenamed || columnDeleted) {
                let selectedAnalysis = this.get('selectedAnalysis');
                if (selectedAnalysis !== null && selectedAnalysis.id === analysis.id)
                    this.trigger("change:selectedAnalysis", { changed: { selectedAnalysis: analysis } });
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
    },
    _requestPDF(html) {
        return new Promise((resolve, reject) => {

            let url = host.baseUrl + 'utils/to-pdf';
            let xhr = new XMLHttpRequest();  // jQuery doesn't support binary!
            xhr.open('POST', url);
            xhr.send(html);
            xhr.responseType = 'arraybuffer';
            xhr.onload = function(e) {
                if (this.status === 200)
                    resolve(this.response);
                if (this.status === 500)
                    reject(this.responseText);
                else
                    reject(this.statusText);
            };
            xhr.onerror = function(e) {
                reject(e);
            };
        });
    },
});

module.exports = Instance;
