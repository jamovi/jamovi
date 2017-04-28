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

        setTimeout(() => {
            if (this.model.analyses().hasActiveAnalyses() === false) {
                this.$welcome = $('<iframe id="main_welcome" \
                        name="welcome" \
                        sandbox="allow-scripts allow-same-origin" \
                        src="https://jamovi.org/welcome.html?version=0.7.3.0" \
                        class="silky-welcome-panel" \
                        style="overflow: hidden; box-sizing: border-box;" \
                        ></iframe>');
                this.$welcome.appendTo(this.$el);

                this.model.analyses().once('analysisResultsChanged', (event) => {
                    this.$welcome.addClass('silky-welcome-panel-hidden');
                });
            }
        }, 500);

        this.model.on('change:resultsMode', event => {
            if (event.changed.resultsMode === 'text')
                this.$textView.removeClass('silky-results-panel-hidden');
            else
                this.$textView.addClass('silky-results-panel-hidden');
        });
    }
});

module.exports = ResultsView;
