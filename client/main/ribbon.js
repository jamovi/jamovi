
'use strict';

var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var RibbonModel = Backbone.Model.extend({

    enabled : false,
    defaults : {
        tabs : [
            { title : "File" },
            { title : "Silky", analyses : [
                { name : 'Descriptives', title : 'Descriptives', ns : 'silkyR' },
                { name : 'TTestOneS', title : 'TTestOneS', ns : 'silkyR' },
                { name : 'TTestPS',   title : 'TTestPS', ns : 'silkyR' },
                { name : 'Anova',   title : 'ANOVA', ns : 'silkyR' } ]
            },
            { title : "Silky J" }
        ],
        selectedIndex : 1
    },
    _activateAnalysis : function(ns, name) {
        this.trigger('analysisSelected', { name : name, ns : ns } );
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

        var currentTabIndex = this.model.get('selectedIndex');
        var currentTab = this.model.get('tabs')[currentTabIndex];
        var analyses = currentTab.analyses;

        analyses.forEach(function(value) {
            html += '   <button class="silky-ribbon-button" data-name="' + value.name + '" + data-ns="' + value.ns + '">';
            html += '       <div class="silky-ribbon-button-icon"></div>';
            html += '       <div class="silky-ribbon-button-label">' + value.title + '</div>';
            html += '   </button>';
        });

        html += '</div>';

        this.$el.append(html);

        this.$header = this.$el.find('.silky-ribbon-header');
        this.$body   = this.$el.find('.silky-ribbon-body');

        var tabs = this.model.get('tabs');

        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            this.$header.append('<div class="silky-ribbon-tab">' + tab.title + '</div>');
        }

        this.$tabs = this.$header.find('.silky-ribbon-tab');
        $(this.$tabs[1]).addClass('selected');
    },
    _ribbonClicked : function(event) {
        var index = this.$tabs.index(event.target);
        this.model.set('selectedIndex', index);
    },
    _analysisClicked : function(event) {
        var button = event.currentTarget;
        var name = button.dataset.name;
        var ns   = button.dataset.ns;
        this.model._activateAnalysis(ns, name);
    }
});

module.exports = { View : RibbonView, Model : RibbonModel };
