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
                class="id' + analysis.id + '" \
                src="' + this.iframeUrl + this.model.instanceId() + '/" \
                sandbox="allow-scripts allow-same-origin" \
                style="border: 0 ; height : 0 ;" \
                data-selected \
                ></iframe>';

            var $iframe = $(element).appendTo(this.$el);
            var iframe = $iframe[0];

            analysisResults = { iframe : iframe, $iframe : $iframe, results : analysis.results, loaded : false };
            this.results[analysis.id] = analysisResults;

            var self = this;

            $iframe.load(function() {
                analysisResults.iframe.contentWindow.postMessage(analysisResults.results, self.iframeUrl);
                analysisResults.loaded = true;
            });
        }
        else {

            analysisResults.results = analysis.results;
            if (analysisResults.loaded)
                analysisResults.iframe.contentWindow.postMessage(analysisResults.results, this.iframeUrl);
        }
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

            switch (eventType) {
                case "sizeChanged":
                    if ($iframe.height() === 0)
                        $iframe.width(eventData.width);
                    this._scrollIntoView($iframe, eventData.height);
                    analysisResults.$iframe.animate(eventData);
                    break;
                default:
                    break;
            }
        }
    },
    _scrollIntoView : function($item, itemHeight) {

        itemHeight = itemHeight || $item.height();

        var itemTop = $item.position().top;
        var itemBottom = itemTop + itemHeight;
        var viewTop = this.$el.scrollTop();
        var viewHeight = this.$el.parent().height();
        var viewBottom = viewTop + viewHeight;

        if ($item.height() < viewHeight) {

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
