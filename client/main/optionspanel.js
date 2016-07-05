'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var SilkyView = require('./view');


var AnalysisResources = function(analysis, context, iframeUrl, instanceId) {

    this.context = context;
    this.analysis = analysis;
    this.name = analysis.name;
    this.options = null;
    this.def = null;

    var element = '<iframe id="' + analysis.ns + '-' + analysis.name + '" \
            sandbox="allow-scripts allow-same-origin" \
            src="' + iframeUrl + instanceId + '/" \
            class="silky-options-control silky-hidden-options-control" \
            style="overflow: hidden; box-sizing: border-box;" \
            src="./analysisui.html" \
            ></iframe>';

    this.$frame = $(element);

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

    initialize: function(args) {

        if (_.has(args, 'iframeUrl'))
            this.iframeUrl = args.iframeUrl;

        this._analysesResources = {};

        this._currentResources = null;

        var self = this;
        $(window).resize(function() { self.resizeHandler(); });
        this.$el.on('resized', function() { self.resizeHandler(); });

        this.render();
    },

    setAnalysis: function(analysis) {

        var resources = this._analysesResources[analysis.name];
        var createdNew = false;

        if (_.isUndefined(resources)) {
            resources = new AnalysisResources(analysis, { columns: this.dataSetModel.get('columns') }, this.iframeUrl, this.model.instanceId());
            this._analysesResources[analysis.name] = resources;
            createdNew = true;
        }

        if (this._currentResources !== null && resources !== this._currentResources) {
            this.removeMsgListeners();
            this._currentResources.abort();
            this._currentResources.$frame.addClass('silky-hidden-options-control');
            this._currentResources.$frame.css("height", 0);
            this._currentResources = null;
        }

        var context = { columns: this.dataSetModel.get('columns') };
        resources.ready.then(function() {
            resources.updateData(analysis.options, context);
        });

        resources.analysis = analysis;
        if (this._currentResources === null) {
            this._currentResources = resources;
            this.addMsgListeners(this._currentResources.$frame);
            this.updateContentHeight();
            if (createdNew)
                this.$el.append(resources.$frame);
        }
        if (this._currentResources !== null)
            this._currentResources.$frame.removeClass('silky-hidden-options-control');
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

    addMsgListeners: function($frame) {
        this.addMsgListener($frame, "options.changed", this.optionsChanged);
        this.addMsgListener($frame, "options.close", this.hideOptions);
        this.addMsgListener($frame, "document.ready", this.frameReady);
        this.addMsgListener($frame, "document.mouse", this.frameMouseEvent);
    },

    addMsgListener: function($frame, cmd, callback) {
        var self = this;
        var action = function (e) {
            //var frames = document.getElementsByClassName('silky-options-control active-options');
            if (e.source === $frame[0].contentWindow) {
                var msg = e.data;
                if (msg.cmd !== cmd)
                    return;

                callback.call(self, msg.data);
            }
        };

        if (_.isUndefined(this._msgActions))
            this._msgActions = [];
        this._msgActions.push(action);

        window.addEventListener("message", action, false);
    },

    removeMsgListeners: function(cmd) {
        if (_.isUndefined(this._msgActions) === false) {
            for(var i = 0; i < this._msgActions.length; i++)
                window.removeEventListener("message", this._msgActions[i], false);
        }

        this._msgActions = [];
    },

    hideOptions: function(data) {
        this.model.set('selectedAnalysis', null);
        this._currentResources.$frame.addClass('silky-hidden-options-control');
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
