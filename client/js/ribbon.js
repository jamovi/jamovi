
'use strict';

var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var RibbonModel = Backbone.Model.extend({

    defaults : {
        tabs : [
            { title : "File" },
            { title : "Silky"},
            { title : "Silky J"}
        ],
        selectedIndex : 1
    },
    _activateAnalysis : function(index) {
        this.trigger('analysisSelected', { name : 'descriptives', ns : 'base'} );
    }

});

var RibbonView = Backbone.View.extend({
    events : {
        'click .silky-ribbon-tab'    : '_ribbonClicked',
        'click .silky-ribbon-button' : '_analysisClicked'
    },
    initialize: function() {
        if (typeof(this.model) === "undefined")
            this.model = new RibbonModel();

        this.$el.addClass('silky-ribbon');

        var html = '';
        html += '<div class="silky-ribbon-header">';
        html += '</div>';
        html += '<div class="silky-ribbon-body">';
        html += '   <div class="silky-ribbon-button">';
        html += '       <div class="silky-ribbon-button-icon"></div>';
        html += '       <div class="silky-ribbon-button-label">Descriptives</div>';
        html += '   </div>';
        html += '</div>';

        this.$el.append(html);

        this.$header = this.$el.find('.silky-ribbon-header');
        this.$body   = this.$el.find('.silky-ribbon-body');

        var tabs = this.model.get('tabs');

        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i]
            this.$header.append('<div class="silky-ribbon-tab">' + tab.title + '</div>');
        };

        this.$tabs = this.$header.find('.silky-ribbon-tab');
        $(this.$tabs[1]).addClass('selected');
    },
    _ribbonClicked : function(event) {
        var index = this.$tabs.index(event.target);
        this.model.set('selectedIndex', index);
    },
    _analysisClicked : function(event) {
        this.model._activateAnalysis(0);
    }
});

module.exports = { View : RibbonView, Model : RibbonModel };
