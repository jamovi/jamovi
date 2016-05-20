'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var SilkyView = require('./view');

var AnalysisResources = function(analysis, context) {

    this.context = context;
    this.analysis = analysis;
    this.name = analysis.name;
    this.options = null;
    this.def = null;
    this.$frame = $('<iframe id="sandboxed-options" class="silky-options-control" style="overflow: hidden; box-sizing: border-box;" src="./analysisui.html"></iframe>');

    var self = this;

    this.sendMsg = function(id, data) {
        var msg = { cmd: id, data: data };
        this.$frame[0].contentWindow.postMessage(msg, '*');
    };

    this.addMsgListener = function(cmd, callback) {
        var self = this;
        window.addEventListener("message",
            function (e) {
                var frame = self.$frame[0];
                if (e.source === frame.contentWindow) {
                    var msg = e.data;
                    if (msg.cmd !== cmd)
                        return;

                    callback.call(self, msg.data);
                }
        }, false);
    };

    this.updateData = function(options, context) {
        this.context = context;
        this.options = options;

        this.sendMsg("analysis.context", this.context);
        this.sendMsg("options.changed", this.options);
    };

    var notifyDocumentReady;
    var notifyAborted;

    this.ready = Promise.all([
        new Promise(function(resolve, reject) {
            var url = 's/analyses/' + analysis.ns + '/' + analysis.name;
            return $.get(url, function(script) {
                self.def = script;
                resolve(script);
            });
        }),
        new Promise(function(resolve, reject) {
            notifyDocumentReady = resolve;
            notifyAborted = reject;
        })
    ]).then(function() {
        self.sendMsg("analysis.context", self.context);
        self.sendMsg("options.def", self.def);
    });

    this.abort = function() {
        notifyAborted("Aborted");
    };

    this.addMsgListener("document.ready", notifyDocumentReady);
};

var OptionsPanel = SilkyView.extend({

    initialize: function() {

        this._analysesResources = {};

        this.addMsgListener("options.changed", this.optionsChanged);
        this.addMsgListener("options.close", this.hideOptions);

        this.addMsgListener("document.ready", this.frameReady);
        this.addMsgListener("document.mouse", this.frameMouseEvent);

        this._currentResources = null;

        var self = this;
        $(window).resize(function() { self.resizeHandler(); });
        this.$el.on('resized', function() { self.resizeHandler(); });

        this.render();
    },

    setAnalysis: function(analysis) {

        var resources = this._analysesResources[analysis.name];
        if (_.isUndefined(resources)) {
            resources = new AnalysisResources(analysis, { columns: this.dataSetModel.get('columns') });
            this._analysesResources[analysis.name] = resources;
        }
        else if (resources !== this._currentResources) {
            this._currentResources.abort();
            this._currentResources.$frame.detach();
            this._currentResources = null;
        }

        var context = { columns: this.dataSetModel.get('columns') };
        resources.ready.then(function() {
            resources.updateData(analysis.options, context);
        });

        resources.analysis = analysis;
        if (this._currentResources === null) {
            this._currentResources = resources;
            this.$el.append(resources.$frame);
        }
    },

    setDataSetModel: function(dataSetModel) {
        this.dataSetModel = dataSetModel;
    },

    render: function() {

        this.$el.empty();
    },

    updateContentHeight: function() {
        if (this._currentResources === null)
            return;

        var $frame = this._currentResources.$frame;
        var pos = $frame.position();

        var properties = this.$el.css(["height", "padding-top", "padding-bottom", "border-top", "border-bottom"]);
        var height = parseFloat(properties.height) - parseFloat(properties["padding-top"]) - parseFloat(properties["padding-bottom"]) - parseFloat(properties["border-top"]) - parseFloat(properties["border-bottom"]);

        var value = height - pos.top;

        $frame.css("height", value);
    },

    addMsgListener: function(cmd, callback) {
        var self = this;
        window.addEventListener("message",
            function (e) {
                var frame = document.getElementById('sandboxed-options');
                if (e.source === frame.contentWindow) {
                    var msg = e.data;
                    if (msg.cmd !== cmd)
                        return;

                    callback.call(self, msg.data);
                }
        }, false);
    },

    hideOptions: function(data) {
        this.$el.trigger("splitpanel-hide");
    },

    optionsChanged: function(data) {
        this._currentResources.analysis.setOptions(data);
    },

    frameReady: function(data) {
        this.updateContentHeight();
    },

    resizeHandler: function() {

        this.updateContentHeight();
    },

    frameMouseEvent: function(data) {
        var event = $.Event( data.eventName, data);

        var pos = $('iframe.silky-options-control').offset();

        event.pageX += pos.left;
        event.pageY += pos.top;

        $(document).trigger(event);
    }
});

module.exports = OptionsPanel;
