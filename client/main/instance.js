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
        this._settings.on('change:palette', event => this._paletteChanged());

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
        arbitraryCodePresent: false
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
    import(filePath) {
        return Promise.resolve();
    },
    open(filePath) {

        let promise;
        let coms = this.attributes.coms;

        let progress = new Notify({
            title: 'Opening',
            duration: 0
        });

        if (this.attributes.hasDataSet) {

            let instance = new Instance({ coms : coms });

            promise = instance.connect().then(() => {
                return instance.open(filePath);
            }).then(() => {
                progress.dismiss();
                if (this.attributes.blank && this._dataSetModel.attributes.edited === false) {
                    host.navigate(instance.instanceId());
                }
                else {
                    host.openWindow(instance.instanceId());
                    instance.destroy();
                }
            }, (error) => {
                progress.dismiss();
                this._notify(error);
                instance.destroy();
            }, (prog) => {
                progress.set('progress', prog);
                this.trigger('notification', progress);
            });
        }
        else {

            let open = new coms.Messages.OpenRequest(filePath);
            let request = new coms.Messages.ComsMessage();
            request.payload = open.toArrayBuffer();
            request.payloadType = 'OpenRequest';
            request.instanceId = this._instanceId;

            let onresolve = (response) => {

                progress.dismiss();

                let info = coms.Messages.OpenProgress.decode(response.payload);
                let filePath = info.path;
                let ext = path.extname(filePath);

                this.set('path', filePath);
                this.set('title', path.basename(filePath, ext));
                this._retrieveInfo();
            };

            let onreject = (error) => {
                progress.dismiss();
                this._notify(error);
            };

            let onprogress = (prog) => {
                progress.set('progress', prog);
                this.trigger('notification', progress);
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
            else if (filePath.endsWith('.html') || filePath.endsWith('.htm')) {
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

            let progress = new Notify({
                title: 'Saving',
                duration: 0
            });

            return coms.send(request).then(
                (response) => {
                    progress.dismiss();
                    return response;
                },
                (err) => {
                    progress.dismiss();
                    throw err.cause;
                },
                (prog) => {
                    progress.set('progress', prog);
                    this.trigger('notification', progress);
                    return prog;
                }
            );

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

        let promise = coms.send(message);
        promise = promise.then((response) => {
            return coms.Messages.FSResponse.decode(response.payload);
        });
        return promise;
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

        return coms.send(request);
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
    trustArbitraryCode() {
        for (let analysis of this.analyses()) {
            if ( ! analysis.enabled) {
                analysis.enabled = true;
                this._runAnalysis(analysis, []);
            }
        }
    },
    _themeChanged() {
        for (let analysis of this.analyses())
            this._runAnalysis(analysis, 'theme');
    },
    _paletteChanged() {
        for (let analysis of this.analyses())
            this._runAnalysis(analysis, 'palette');
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

            let allReady = [ ];

            for (let analysisPB of info.analyses) {
                let options = OptionsPB.fromPB(analysisPB.options, coms.Messages);
                let analysis = this._analyses.addAnalysis(
                    analysisPB.name,
                    analysisPB.ns,
                    analysisPB.analysisId,
                    options,
                    analysisPB.results,
                    analysisPB.incAsText,
                    analysisPB.syntax);
                allReady.push(analysis.ready);
            }

            Promise.all(allReady).then(() => {
                for (let analysis of this._analyses) {
                    if (analysis.arbitraryCode)
                        this.set('arbitraryCodePresent', true);
                    else
                        analysis.enabled = true;
                }
            });

            return response;
        });
    },
    createAnalysis(name, ns) {

        this._dataSetModel.set('edited', true);

        let analysis = this._analyses.create(name, ns);
        this.set('selectedAnalysis', analysis);

        let request = this._constructAnalysisRequest(analysis, { });
        request.perform = 0; // INIT

        this._sendAnalysisRequest(request);

        return analysis;
    },
    duplicateAnalysis(dupliceeId) {

        let duplicee = this._analyses.get(dupliceeId);
        let index = this._analyses.indexOf(duplicee.id) + 1;
        let analysis = this._analyses.create(duplicee.name, duplicee.ns, index);
        let results = duplicee.results;
        let options = duplicee.options.getValues();

        results = Object.assign({}, results);
        results.index = index + 1;

        analysis.setup(options);
        analysis.setResults(results, options, duplicee.incAsText, duplicee.syntax);

        let request = this._constructAnalysisRequest(analysis, { duplicate: duplicee.id });
        request.perform = 7; // DUPLICATE
        request.index = index + 1;
        this._sendAnalysisRequest(request);

        return analysis;
    },
    _optionsExtras() {
        let ppi = parseInt(72 * (window.devicePixelRatio || 1));
        let theme = this._settings.getSetting('theme', 'default');
        let palette = this._settings.getSetting('palette', 'jmv');

        return { '.ppi': ppi, theme: theme, palette: palette };
    },
    _constructAnalysisRequest(analysis, options) {

        let coms = this.attributes.coms;

        let request = new coms.Messages.AnalysisRequest();
        request.analysisId = analysis.id;
        request.name = analysis.name;
        request.ns = analysis.ns;
        request.revision = analysis.revision;
        request.enabled = analysis.enabled;

        if (options === undefined) {
            if (analysis.isReady)
                options = analysis.options;
            else
                options = { };
        }
        let extras = this._optionsExtras();

        request.setOptions(OptionsPB.toPB(options, extras, coms.Messages));
        return request;
    },
    _sendAnalysisRequest(request) {

        let coms = this.attributes.coms;

        let message = new coms.Messages.ComsMessage();
        message.payload = request.toArrayBuffer();
        message.payloadType = 'AnalysisRequest';
        message.instanceId = this._instanceId;

        coms.sendP(message);
    },
    _runAnalysis(analysis, changed) {

        let coms = this.attributes.coms;
        this._dataSetModel.set('edited', true);

        let request = this._constructAnalysisRequest(analysis);
        request.perform = 0; // INIT

        if (changed)
            request.changed = changed;

        if (analysis.deleted)
            request.perform = 6; // DELETE

        this._sendAnalysisRequest(request);
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
