'use strict';

const $ = require('jquery');
const Framesg = require('framesg').default;
const Backbone = require('backbone');
Backbone.$ = $;
const host = require('./host');
const I18n = require('../common/i18n');

const SilkyView = require('./view');


const AnalysisResources = function(analysis, $target, iframeUrl, instanceId) {

    Object.assign(this, Backbone.Events);

    this.analysis = analysis;
    this.name = analysis.name;
    this.options = null;
    this.def = null;

    this.key = analysis.ns + '-' + analysis.name;

    let element = '<iframe id="' + this.key + '" \
            name="' + this.key + '" \
            sandbox="allow-scripts allow-same-origin" \
            src="' + iframeUrl + instanceId + '/" \
            class="silky-options-control silky-hidden-options-control" \
            style="overflow: hidden; box-sizing: border-box;" \
            ></iframe>';

    this.$frame = $(element);
    $target.append(this.$frame);

    this.frameCommsApi = {
        frameDocumentReady: data => {
            this.notifyDocumentReady();
            this.trigger("frameReady");
        },

        onFrameMouseEvent: data => {
            let event = $.Event( data.eventName, data);

            let pos = $('iframe.silky-options-control').offset();

            event.pageX += pos.left;
            event.pageY += pos.top;

            $(document).trigger(event);
        },

        onOptionsChanged: data => {
            this.analysis.setOptions(data.values);

            for (let name in data.properties) {
                let pData = data.properties[name];
                for (let i = 0; i < pData.length; i++) {
                    this.analysis.options.setProperty(name, pData[i].name, pData[i].key, pData[i].value);
                }
            }
        },

        hideOptions: data => {
            this.$frame.addClass('silky-hidden-options-control');
            this.trigger("hideOptions");
        },

        requestAction: data => {
            if (data.requestType === "createColumn") {
                let column = this.dataSetModel.getFirstEmptyColumn();
                return this.dataSetModel.changeColumn(column.id, data.requestData ).then(() => { return column.name; });
            }
        },

        requestData: data => {
            if (data.requestType === "columns") {
                let columns = this.dataSetModel.get('columns');
                let columnData = [];
                for (let i = 0; i < columns.length; i++) {
                    if (columns[i].columnType === 'none')
                        continue;
                    columnData.push({ name: columns[i].name, id: columns[i].id, measureType: columns[i].measureType, dataType: columns[i].dataType, columnType:  columns[i].columnType, outputAnalysisId: columns[i].outputAnalysisId });
                }
                data.columns = columnData;
            }
            else if (data.requestType === "column") {
                let found = false;
                let columns = this.dataSetModel.get('columns');
                for (let i = 0; i < columns.length; i++) {
                    if ((data.requestData.columnId !== undefined && columns[i].id === data.requestData.columnId) ||
                        (data.requestData.columnName !== undefined && columns[i].name === data.requestData.columnName)) {
                        found = true;
                        for (let p = 0; p < data.requestData.properties.length; p++) {
                            let propertyName = data.requestData.properties[p];
                            data[propertyName] = columns[i][propertyName];
                        }
                        break;
                    }
                }
                data.columnFound = found;
            }
            else
                data.error = "Request type unknown";
            return data;
        }
    };

    this.frameComms = new Framesg(this.$frame[0].contentWindow, this.key, this.frameCommsApi);

    this.setAnalysisTitle = function(title) {
        if ( ! this.analysis.missingModule)
            this.frameComms.send("setTitle", title);
    };

    this.destroy = function() {
        this.$frame.remove();
        //this.frameComms.disconnect(); //This function doesn't yet exist which is a problem and a slight memory leak, i have submitted an issue to the project.
        //Temp work around, kind of.
        this.frameComms.receiveNamespace = "deleted"; //this will result in the internal message function exiting without executing any potentially problematic commands. However, the event handler is still attached and this is a problem.
    };

    this.setDataModel = function(dataSetModel, instance) {
        this.dataSetModel = dataSetModel;
        this.instance = instance;
    };

    this.updateData = function(options) {
        this.options = options;
        if ( ! this.analysis.missingModule)
            this.frameComms.send("initialiseOptions", { id: this.analysis.id, options: this.options });
    };

    this.notifyDataChanged = function(dataType, dataInfo) {
        this.frameComms.send("dataChanged", { dataType: dataType, dataInfo: dataInfo });
    };

    let notifyAborted;
    this.notifyDocumentReady = null;

    this.ready = Promise.all([
        analysis.ready.then(() => {
            return new Promise((resolve, reject) => {
                if (analysis.missingModule) {
                    this.def = { error: 'Missing module: ' + analysis.ns };
                    resolve(this.def);
                }
                else if (analysis.uijs) {
                    this.def = analysis.uijs;
                    this.i18nDef = analysis.i18n;
                    resolve(analysis.uijs);
                }
                else {
                    // shouldn't get here
                    let url = '../analyses/' + analysis.ns + '/' + analysis.name.toLowerCase();
                    return $.get(url, null, (script) => {
                        this.def = script;
                        resolve(script);
                    }, 'text');
                }
            });
        }),
        new Promise((resolve, reject) => {
            this.notifyDocumentReady = resolve;
            notifyAborted = reject;
        }),
        host.version.then(version => {
            this.jamoviVersion = version;
        })
    ]).then(() => {
        return this.frameComms.send("setOptionsDefinition", this.def, this.i18nDef, I18n.localeData, this.jamoviVersion, analysis.id);
    });

    this.abort = function() {
        notifyAborted("Aborted");
    };
};

let OptionsPanel = SilkyView.extend({

    initialize: function(args) {

        if ('iframeUrl' in args)
            this.iframeUrl = args.iframeUrl;

        this._analysesResources = {};

        this._currentResources = null;

        $(window).resize(() => { this.resizeHandler(); });
        this.$el.on('resized', () => { this.resizeHandler(); });

        args.model.analyses().on('analysisHeadingChanged', this._analysisNameChanged, this);

        this.render();
    },

    _analysisNameChanged: function(analysis) {
        let analysesKey = analysis.ns + "-" + analysis.name;
        let resources = this._analysesResources[analysesKey];
        if (resources)
            resources.setAnalysisTitle(analysis.getHeading());
    },

    reloadAnalyses: function(moduleName) {
        let analysis = null;
        if (this._currentResources !== null && this._currentResources.analysis.ns === moduleName) {
            analysis = this._currentResources.analysis;
            this.removeMsgListeners(this._currentResources);
            this._currentResources.abort();
            this._currentResources.$frame.addClass('silky-hidden-options-control');
            this._currentResources = null;
        }

        for (let analysesKey in this._analysesResources) {
            if (this._analysesResources[analysesKey].analysis.ns === moduleName) {
                this._analysesResources[analysesKey].destroy();
                delete this._analysesResources[analysesKey];
            }
        }

        if (analysis !== null) {
            this.setAnalysis(analysis);
        }
    },

    setAnalysis: function(analysis) {

        let analysesKey = analysis.ns + "-" + analysis.name;
        let resources = this._analysesResources[analysesKey];
        let createdNew = false;

        if (resources === undefined) {
            resources = new AnalysisResources(analysis, this.$el, this.iframeUrl, this.model.instanceId());
            resources.setDataModel(this.dataSetModel);
            this._analysesResources[analysesKey] = resources;
            createdNew = true;
        }

        if (this._currentResources !== null && resources !== this._currentResources) {
            this.removeMsgListeners(this._currentResources);
            this._currentResources.abort();
            this._currentResources.$frame.addClass('silky-hidden-options-control');
            this._currentResources.$frame.css("height", 0);
            this._currentResources = null;
        }

        resources.ready.then(() => {
            analysis.ready.then(() => {
                resources.updateData(analysis.options.getValues());
            });
        });

        resources.analysis = analysis;
        if (this._currentResources === null) {
            this._currentResources = resources;
            this.addMsgListeners(this._currentResources);
            this.updateContentHeight();
        }
        if (this._currentResources !== null) {
            this._currentResources.$frame.css("height", '');
            this._currentResources.$frame.removeClass('silky-hidden-options-control');
        }
    },

    notifyOfDataChange: function(resource, dataType, dataInfo) {
        resource.ready.then(() => {
            resource.notifyDataChanged(dataType, dataInfo);
        });
    },

    setDataSetModel: function(dataSetModel) {
        this.dataSetModel = dataSetModel;

        this.dataSetModel.on('dataSetLoaded', event => {
            let data = { measureTypeChanged: true, dataTypeChanged: true, nameChanged: true, levelsChanged: true, countChanged: true };
            for (let analysesKey in this._analysesResources)
                this.notifyOfDataChange(this._analysesResources[analysesKey], 'columns', data);
        });

        this.dataSetModel.on('columnsChanged', event => {

            let data = { measureTypeChanged: false, dataTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: true };
            for (let changes of event.changes) {
                if (changes.measureTypeChanged)
                    data.measureTypeChanged = true;
                if (changes.dataTypeChanged)
                    data.dataTypeChanged = true;
                if (changes.nameChanged)
                    data.nameChanged = true;
                if (changes.levelsChanged)
                    data.levelsChanged = true;
                if (changes.deleted || changes.created)
                    data.countChanged = true;
            }

                if (data.measureTypeChanged || data.dataTypeChanged || data.nameChanged || data.levelsChanged || data.countChanged) {
                    for (let analysesKey in this._analysesResources)
                        this.notifyOfDataChange(this._analysesResources[analysesKey], 'columns', data);
                }

        });
    },

    render: function() {

        this.$el.empty();
    },

    updateContentHeight: function() {
        if (this._currentResources === null)
            return;

        let $frame = this._currentResources.$frame;
        let pos = $frame.position();

        let properties = this.$el.css(["height", "padding-top", "padding-bottom", "border-top", "border-bottom"]);
        let height = parseFloat(properties.height) - parseFloat(properties["padding-top"]) - parseFloat(properties["padding-bottom"]) - parseFloat(properties["border-top"]) - parseFloat(properties["border-bottom"]);

        let value = height - pos.top;

        $frame.css("height", value);
    },

    addMsgListeners: function(resource) {
        resource.on("hideOptions", () => {
            this.model.set('selectedAnalysis', null);
        });

        resource.on("frameReady", () => {
            this.updateContentHeight();
        });
    },

    removeMsgListeners: function(resource) {
        resource.off("hideOptions");
        resource.off("frameReady");
    },

    hideOptions: function(clearSelected) {

        console.log('point 1');

        if (clearSelected === undefined)
            clearSelected = true;
        if (clearSelected) {
            let selectedAnalysis = this.model.attributes.selectedAnalysis;
            if (selectedAnalysis !== null && typeof(selectedAnalysis) !== 'string')
                this.model.set('selectedAnalysis', null);
        }

        console.log('point 2');

        this.$el.trigger("splitpanel-hide");
    },

    frameReady: function(data) {
        this.updateContentHeight();
    },

    resizeHandler: function() {
        this.updateContentHeight();
    }
});

module.exports = OptionsPanel;
