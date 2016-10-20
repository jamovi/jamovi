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
const Options = require('./options');

const ProgressModel = Backbone.Model.extend({
    defaults : {
        task     : '',
        progress : 0,
        complete : true
    }
});

const Instance = Backbone.Model.extend({

    initialize() {

        this.transId = 0;
        this.command = '';
        this.seqNo = 0;

        this._dataSetModel = new DataSetViewModel({ coms: this.attributes.coms });
        this._dataSetModel.on('columnsChanged', event => this._columnsChanged(event));

        this._progressModel = new ProgressModel();

        this._analyses = new Analyses();
        this._analyses.on('analysisCreated', this._analysisCreated, this);
        this._analyses.on('analysisOptionsChanged', this._runAnalysis, this);

        this._instanceId = null;

        this.attributes.coms.onBroadcast(bc => this._onReceive(bc));

    },
    defaults : {
        coms : null,
        selectedAnalysis : null,
        hasDataSet : false,
        filePath : null,
        fileName : 'Untitled',
        resultsMode : 'rich'
    },
    instanceId() {
        return this._instanceId;
    },
    progressModel() {

        return this._progressModel;
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
                host.openWindow(instance.instanceId());
            }).catch(error => {
                this._notify(error);
            });
        }
        else {

            let open = new coms.Messages.OpenRequest(filePath);
            let request = new coms.Messages.ComsMessage();
            request.payload = open.toArrayBuffer();
            request.payloadType = "OpenRequest";
            request.instanceId = this._instanceId;

            let onresolve = (response) => {
                let ext = path.extname(filePath);
                this.set('filePath', filePath);
                this.set('fileName', path.basename(filePath, ext));
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
    save(filePath) {

        let coms = this.attributes.coms;

        let save = new coms.Messages.SaveRequest(filePath);
        let request = new coms.Messages.ComsMessage();
        request.payload = save.toArrayBuffer();
        request.payloadType = "SaveRequest";
        request.instanceId = this._instanceId;

        let prom = coms.send(request);

        prom.then(() => {
            let ext = path.extname(filePath);
            this.set('filePath', filePath);
            this.set('fileName', path.basename(filePath, ext));
        });

        return prom;
    },
    browse(path) {

        let coms = this.attributes.coms;

        let fs = new coms.Messages.FSRequest();
        fs.path = path;

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
        request.payloadType = "InstanceRequest";

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

                let ext = path.extname(info.filePath);
                this.set('filePath', info.filePath);
                this.set('fileName', path.basename(info.filePath, ext));
            }

            for (let analysis of info.analyses) {
                let options = Options.fromPB(analysis.options, coms.Messages);
                this._analyses.addAnalysis(analysis.name, analysis.ns, analysis.analysisId, options, analysis.results);
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

        let coms = this.attributes.coms;

        let analysisRequest = new coms.Messages.AnalysisRequest();
        analysisRequest.analysisId = analysis.id;
        analysisRequest.name = analysis.name;
        analysisRequest.ns = analysis.ns;
        analysisRequest.ppi = parseInt(72 * (window.devicePixelRatio || 1));

        if (changed)
            analysisRequest.changed = changed;

        if (analysis.isReady)
            analysisRequest.setOptions(Options.toPB(analysis.options, coms.Messages));

        let request = new coms.Messages.ComsMessage();
        request.payload = analysisRequest.toArrayBuffer();
        request.payloadType = "AnalysisRequest";
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
                analysis.setup(Options.fromPB(response.options, coms.Messages));
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
        for (let analysis of this._analyses) {
            let using = analysis.getUsing();

            for (let name of event.changed) {
                if (using.includes(name))
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
