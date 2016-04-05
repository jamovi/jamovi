'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;
//var Promise = require('es6-promise').Promise;
var SilkyView = require('./view');

var AnalysisInfo = function(analysis, resources) {

    this.resources = resources;
    this.analysis = analysis;
    this.name = analysis.name;
    this.options = analysis.options;
    this.def = null;
    this.$frame = $('<iframe id="sandboxed-options" class="silky-options-control" style="overflow: hidden; box-sizing: border-box;" src="./js/options.html"></iframe>');
    this.inited = false;

    var url = 's/analyses/' + analysis.ns + '/' + analysis.name;
    var self = this;
    $.get( url, undefined, function(script) {
        self.def = script;
        if (this.inited)
            self.documentReady();
    }, "text").fail(function(err, settings, exception) {
        this._failed = err;
        if (self._failCallback)
            self._failCallback(err);
    });

    this.abort = function() {
        this._readyCallback = null;
        this._failCallback = null;
    };

    this.isReady = function(callback, failCallback) {
        if (this._isReady)
            callback.call(this);
        else if (this._failed && failCallback)
            failCallback.call(this, this._failed);

        this._readyCallback = callback;
        this._failCallback = failCallback;
    };

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

    this.documentReady = function(data) {
        if (this.def !== null) {
            this.sendMsg("analysis.resources", this.resources);
            this.sendMsg("options.def", this.def);

            this._isReady = true;
            if (this._readyCallback)
                this._readyCallback();
        }
        this.inited = true;
    };

    this.updateData = function(options, resources) {
        this.resources = resources;
        this.options = options;

        this.sendMsg("analysis.resources", this.resources);
        this.sendMsg("options.changed", this.options);
    };

    this.addMsgListener("document.ready", this.documentReady);
};

var OptionsPanel = SilkyView.extend({

    initialize: function() {

        this._analysisFrameData = {};

        this.addMsgListener("options.changed", this.optionsChanged);
        this.addMsgListener("options.close", this.hideOptions);

        this.addMsgListener("document.ready", this.frameReady);
        this.addMsgListener("document.mouse", this.frameMouseEvent);

        this._frameData = null;

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
        else if (this._frameData !== null && info.name !== this._frameData.name) {
            this._frameData.abort();
            this._frameData.$frame.detach();
            this._frameData = null;
        }

        var resources = { columns: this.dataSetModel.get('columns') };
        info.isReady(function() {
            info.updateData(analysis.options, resources);
        });

        if (this._frameData === null) {
            this._frameData = info;
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
        if (this._frameData === null)
            return;

        var $frame = this._frameData.$frame;
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
        console.log(data);
        _.extend(this._frameData.analysis.options, data);
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
