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

        this.iframes = { };
        
        if (_.has(args, 'iframeUrl'))
            this.iframeUrl = args.iframeUrl;
        
        this.model.on('analysisResults', this._onResults, this);
        
        var self = this;

        window.addEventListener('message', function(event) {
            self._onMessage(event);
        });
    },
    _onResults : function(analysis) {
    
        var element = '<iframe \
            class="id' + analysis.id + '" \
            src="' + this.iframeUrl + '" \
            sandbox="allow-scripts allow-same-origin" \
            style="border: 0" \
            ></iframe>';
        
        var $iframe = $(element).appendTo(this.$el);
        var iframe = $iframe[0];
        
        var self = this;

        $iframe.load(function() {
            iframe.contentWindow.postMessage(analysis.results, self.iframeUrl);
        });

        this.iframes[analysis.id] = iframe;
    },
    _onMessage : function(event) {
        
        var ids = _.keys(this.iframes);
        
        for (var i = 0; i < ids.length; i++) {
        
            var id = ids[i];
            var iframe = this.iframes[id];
            
            if (event.source !== iframe.contentWindow)
                continue;
        
            var eventType = event.data.eventType;
            var eventData = event.data.eventData;
        
            switch (eventType) {
                case "sizeChanged":
                    $(iframe).animate(eventData);
                    break;
                default:
                    break;
            }
        }
    }
});

module.exports = ResultsView;
