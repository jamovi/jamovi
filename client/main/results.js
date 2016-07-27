'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

const ResultsPanel = require('./resultspanel');

var ResultsView = Backbone.View.extend({
    className: "ResultsView",
    initialize: function(args) {

        this.$el.addClass('silky-results');

        this.$richView = $('<div></div>');
        this.$richView.appendTo(this.$el);
        this.richView = new ResultsPanel({
            el: this.$richView,
            iframeUrl: args.iframeUrl,
            model: this.model,
            mode: 'rich' });

        this.$textView = $('<div></div>');
        this.$textView.appendTo(this.$el);
        this.$textView.addClass('silky-results-panel-hidden');
        this.textView = new ResultsPanel({
            el: this.$textView,
            iframeUrl: args.iframeUrl,
            model: this.model,
            mode: 'text' });

        this.model.on('change:resultsMode', event => {
            if (event.changed.resultsMode === 'text')
                this.$textView.removeClass('silky-results-panel-hidden');
            else
                this.$textView.addClass('silky-results-panel-hidden');
        });
    }
});

module.exports = ResultsView;
