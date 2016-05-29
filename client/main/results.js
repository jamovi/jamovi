'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var ResultsView = Backbone.View.extend({
    className: "ResultsView",
    initialize: function(args) {

        _.bindAll(this, '_onMessage');

        this.$el.empty();

        this.results = { };

        if (_.has(args, 'iframeUrl'))
            this.iframeUrl = args.iframeUrl;

        this.model.analyses().on('analysisResultsChanged', this._onResults, this);
        this.model.on('change:selectedAnalysis', this._onSelectedChanged, this);

        var self = this;

        window.addEventListener('message', function(event) {
            self._onMessage(event);
        });
    },
    _onResults : function(analysis) {

        var analysisResults = this.results[analysis.id];

        if (_.isUndefined(analysisResults)) {

            var element = '<iframe \
                scrolling="no" \
                class="id' + analysis.id + '" \
                src="' + this.iframeUrl + this.model.instanceId() + '/" \
                sandbox="allow-scripts allow-same-origin" \
                style="border: 0 ; height : 0 ;" \
                data-selected \
                ></iframe>';

            var $container = $('<div class="silky-results-container"></div>').appendTo(this.$el);
            var $cover = $('<div class="silky-results-cover"></div>').appendTo($container);
            var $iframe = $(element).appendTo($container);
            var iframe = $iframe[0];

            analysisResults = { iframe : iframe, $iframe : $iframe, $container : $container, results : analysis.results, loaded : false };
            this.results[analysis.id] = analysisResults;

            var self = this;

            $iframe.load(function() {
                analysisResults.iframe.contentWindow.postMessage(analysisResults.results, self.iframeUrl);
                analysisResults.loaded = true;
            });

            $cover.click(function() {
                self._resultsClicked(analysis);
            });
        }
        else {

            analysisResults.results = analysis.results;
            if (analysisResults.loaded)
                analysisResults.iframe.contentWindow.postMessage(analysisResults.results, this.iframeUrl);
        }
    },
    _resultsClicked : function(analysis) {
        var current = this.model.get('selectedAnalysis');
        if (current === null || current.id !== analysis.id)
            this.model.set('selectedAnalysis', analysis);
        else
            this.model.set('selectedAnalysis', null);
    },
    _onMessage : function(event) {

        var ids = _.keys(this.results);

        for (var i = 0; i < ids.length; i++) {

            var id = ids[i];
            var analysisResults = this.results[id];

            if (event.source !== analysisResults.iframe.contentWindow)
                continue;

            var eventType = event.data.eventType;
            var eventData = event.data.eventData;
            var $iframe = analysisResults.$iframe;
            var $container = analysisResults.$container;

            switch (eventType) {
                case "sizeChanged":
                    if ($iframe.height() === 0)
                        $iframe.width(eventData.width);
                    this._scrollIntoView($container, eventData.height);
                    $iframe.animate(eventData, 400);
                    $container.width(eventData.width);
                    $container.height(eventData.height);
                    break;
                default:
                    break;
            }
        }
    },
    _scrollIntoView : function($item, itemHeight) {

        itemHeight = itemHeight || $item.height();

        var viewPad = parseInt(this.$el.css('padding-top'));
        var viewTop = this.$el.scrollTop();
        var viewHeight = this.$el.parent().height();
        var viewBottom = viewTop + viewHeight;
        var itemTop = viewTop + $item.position().top;
        var itemBottom = itemTop + itemHeight;

        viewTop += viewPad;

        if (itemHeight < viewHeight) {

            if (itemTop < viewTop)
                this.$el.animate({ scrollTop: itemTop }, { duration: 'slow', easing: 'swing' });
            else if (itemBottom > viewBottom)
                this.$el.animate({ scrollTop: itemBottom - viewHeight + 10 }, { duration: 'slow', easing: 'swing' });
        }
        else {
            if (itemTop > viewTop)
                this.$el.animate({ scrollTop: itemTop }, { duration: 'slow', easing: 'swing' });
            else if (itemBottom < viewBottom)
                this.$el.animate({ scrollTop: itemBottom - viewHeight + 10 }, { duration: 'slow', easing: 'swing' });
        }
    },
    _onSelectedChanged : function(event) {

        var oldSelected = this.model.previous('selectedAnalysis');
        var newSelected = this.model.get('selectedAnalysis');

        if (oldSelected) {
            var oldSelectedResults = this.results[oldSelected.id];
            if (oldSelectedResults)
                oldSelectedResults.$iframe.removeAttr('data-selected');
        }

        if (newSelected) {
            this.$el.attr('data-analysis-selected', '');
            var newSelectedResults = this.results[newSelected.id];
            if (newSelectedResults)
                newSelectedResults.$iframe.attr('data-selected', '');
        }
        else {
            this.$el.removeAttr('data-analysis-selected');
        }
    }
});

module.exports = ResultsView;
