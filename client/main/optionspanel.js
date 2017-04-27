'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Framesg = require('framesg').default;
const Backbone = require('backbone');
Backbone.$ = $;

const SilkyView = require('./view');


const AnalysisResources = function(analysis, $target, iframeUrl, instanceId) {

    _.extend(this, Backbone.Events);

    //this.context = context;
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
            this.analysis.setOptions(data);
        },

        hideOptions: data => {
            this.$frame.addClass('silky-hidden-options-control');
            this.trigger("hideOptions");
        },

        requestData: data => {
            if (data.requestType === "columns") {
                let columns = this.dataSetModel.get('columns');
                let columnData = [];
                for (let i = 0; i < columns.length; i++)
                    columnData[i] = { name: columns[i].name, id: columns[i].id, measureType: columns[i].measureType };
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

    this.setDataModel = function(dataSetModel) {
        this.dataSetModel = dataSetModel;
    };

    this.updateData = function(options) {
        this.options = options;

        this.frameComms.send("initialiseOptions", { options: this.options });
    };

    this.notifyDataChanged = function(dataType, dataInfo) {
        this.frameComms.send("dataChanged", { dataType: dataType, dataInfo: dataInfo });
    };

    let notifyAborted;
    this.notifyDocumentReady = null;

    this.ready = Promise.all([
        new Promise((resolve, reject) => {
            let url = 'analyses/' + analysis.ns + '/' + analysis.name;
            return $.get(url, (script) => {
                this.def = script;
                resolve(script);
            });
        }),
        new Promise((resolve, reject) => {
            this.notifyDocumentReady= resolve;
            notifyAborted = reject;
        })
    ]).then(() => {
        return this.frameComms.send("setOptionsDefinition", this.def);
    });

    this.abort = function() {
        notifyAborted("Aborted");
    };
};

let OptionsPanel = SilkyView.extend({

    initialize: function(args) {

        if (_.has(args, 'iframeUrl'))
            this.iframeUrl = args.iframeUrl;

        this._analysesResources = {};

        this._currentResources = null;

        $(window).resize(() => { this.resizeHandler(); });
        this.$el.on('resized', () => { this.resizeHandler(); });

        this.render();
    },

    setAnalysis: function(analysis) {

        let analysesKey = analysis.ns + "-" + analysis.name;
        let resources = this._analysesResources[analysesKey];
        let createdNew = false;

        if (_.isUndefined(resources)) {
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

        //let context = { columns: this.dataSetModel.get('columns') };
        resources.ready.then(function() {
            resources.updateData(analysis.options.getValues());
        });

        resources.analysis = analysis;
        if (this._currentResources === null) {
            this._currentResources = resources;
            this.addMsgListeners(this._currentResources);
            this.updateContentHeight();
            //if (createdNew)
            //    this.$el.append(resources.$frame);
        }
        if (this._currentResources !== null)
            this._currentResources.$frame.removeClass('silky-hidden-options-control');
    },

    notifyOfDataChange: function(resource, dataType, dataInfo) {
        resource.ready.then(() => {
            resource.notifyDataChanged(dataType, dataInfo);
        });
    },

    setDataSetModel: function(dataSetModel) {
        this.dataSetModel = dataSetModel;

        this.dataSetModel.on('columnsChanged', event => {
            for (let changes of event.changes) {
                if (changes.measureTypeChanged || changes.nameChanged || changes.levelsChanged) {
                    for (let analysesKey in this._analysesResources)
                        this.notifyOfDataChange(this._analysesResources[analysesKey], 'columns', { measureTypeChanged: changes.measureTypeChanged, nameChanged: changes.nameChanged , levelsChanged: changes.levelsChanged });
                }
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
            this.$el.trigger("splitpanel-hide");
        });

        resource.on("frameReady", () => {
            this.updateContentHeight();
        });
    },

    removeMsgListeners: function(resource) {
        resource.off("hideOptions");
        resource.off("frameReady");
    },

    hideOptions: function(data) {
        this.model.set('selectedAnalysis', null);
        if (this._currentResources !== null)
            this._currentResources.$frame.addClass('silky-hidden-options-control');
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
