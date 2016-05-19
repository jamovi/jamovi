'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var SilkyView = require('./view');

var AnalysisInfo = function(analysis, resources) {

    this.resources = resources;
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

    this.updateData = function(options, resources) {
        this.resources = resources;
        this.options = options;

        this.sendMsg("analysis.resources", this.resources);
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
        self.sendMsg("analysis.resources", self.resources);
        self.sendMsg("options.def", self.def);
    });

    this.abort = function() {
        notifyAborted("Aborted");
    };

    this.addMsgListener("document.ready", notifyDocumentReady);
};

var OptionsPanel = SilkyView.extend({

    initialize: function() {

        this._analysisFrameData = {};

        this.addMsgListener("options.changed", this.optionsChanged);
        this.addMsgListener("options.close", this.hideOptions);

        this.addMsgListener("document.ready", this.frameReady);
        this.addMsgListener("document.mouse", this.frameMouseEvent);

        this._currentFrameData = null;

        var self = this;
        $(window).resize(function() { self.resizeHandler(); });
        this.$el.on('resized', function() { self.resizeHandler(); });

        this.render();
    },

    setAnalysis: function(analysis) {

        var info = this._analysisFrameData[analysis.name];
        if (_.isUndefined(info)) {
            info = new AnalysisInfo(analysis, { columns: this.dataSetModel.get('columns') });
            this._analysisFrameData[analysis.name] = info;
        }
        else if (this._currentFrameData !== null && info.name !== this._currentFrameData.name) {
            this._currentFrameData.abort();
            this._currentFrameData.$frame.detach();
            this._currentFrameData = null;
        }

        var resources = { columns: this.dataSetModel.get('columns') };
        info.ready.then(function() {
            info.updateData(analysis.options, resources);
        });

        if (this._currentFrameData === null) {
            this._currentFrameData = info;
            this.$el.append(info.$frame);
        }
    },

    setDataSetModel: function(dataSetModel) {
        this.dataSetModel = dataSetModel;
    },

    render: function() {

        this.$el.empty();
    },

    updateContentHeight: function() {
        if (this._currentFrameData === null)
            return;

        var $frame = this._currentFrameData.$frame;
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
        this._currentFrameData.analysis.setOptions(data);
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
