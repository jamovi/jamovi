
'use strict';

var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var RibbonButton = require('./ribbonbutton');

var RibbonModel = Backbone.Model.extend({

    defaults : {
        dataAvailable : false,
        tabs : [
            { title : "File" },
            { title : "Analyse", items : [
                { name : 'Descriptives', type : 'menu', title : 'Exploration', requiresData: true, items : [
                    { name : 'Descriptives', type: 'analysis', title : 'Descriptives', ns : 'silkyR' },
                ]},
                { name : 'TTest', type : 'menu', title : 'T-Test', requiresData: true, items : [
                    { name : 'TTestIS',   type: 'analysis', title : 'Independent Samples T-Test', ns : 'silkyR' },
                    { name : 'TTestPS',   type: 'analysis', title : 'Paired Samples T-Test', ns : 'silkyR' },
                    { name : 'TTestOneS', type: 'analysis', title : 'One Sample T-Test', ns : 'silkyR' },
                ]},
                { name : 'Anova', type : 'menu', title : 'ANOVA', requiresData: true, items : [
                    { name : 'Anova',   title : 'ANOVA', ns : 'silkyR' },
                    { name : 'AnovaRM', title : 'Repeated Measures ANOVA', ns : 'silkyR' },
                    { name : 'Ancova',  title : 'ANCOVA', ns : 'silkyR' },
                    { name : 'Mancova', title : 'MANCOVA', ns : 'silkyR' },
                    { name : 'Non-param', type : 'group', title : 'Non-Parametric', items : [
                        { name : 'Kruskal', title : 'One Way ANOVA', subtitle : 'Kruskal-Wallis', ns : 'silkyR' },
                        { name : 'Friedman', title : 'Repeated Measures ANOVA', subtitle : 'Friedman', ns : 'silkyR' },
                    ]},
                    { name : 'Bayesian', type : 'group', title : 'Bayesian', items : [
                        { name : 'BAnova', title : 'Bayesian ANOVA', ns : 'silkyR' },
                        { name : 'BRMAnova', title : 'B. Repeated Measures ANOVA', ns : 'silkyR' },
                        { name : 'BAncova', title : 'Bayesian ANCOVA', ns : 'silkyR' },
                    ]}
                ]},
                { name : 'Regression', type : 'menu', title : 'Regression', requiresData: true, items : [
                    { name : 'CorrMatrix', title : 'Correlation Matrix', ns : 'silkyR' },
                    { name : 'LinReg',     title : 'Linear Regression', ns : 'silkyR' },
                ]},
                { name : 'Frequencies', type : 'menu', title : 'Frequencies', requiresData: true, items : [
                    { name : 'ContTable', title : 'Contingency Table', ns : 'silkyR' },
                    { name : 'BinomialTest', title : 'Binomial Test', ns : 'silkyR' },
                ]},
            ]}
        ],
        selectedIndex : 1
    },
    _activateAnalysis : function(ns, name) {
        this.trigger('analysisSelected', { name : name, ns : ns } );
    }

});

var RibbonView = Backbone.View.extend({
    events : {
        'click .silky-ribbon-tab'    : '_ribbonClicked'
    },
    initialize: function() {
        if (typeof(this.model) === "undefined")
            this.model = new RibbonModel();

        this.model.on('change:dataAvailable', this._dataAvailableChanged, this);

        this.$el.addClass('silky-ribbon');

        var html = '';
        html += '<div class="silky-ribbon-header">';
        html += '</div>';
        html += '<div class="silky-ribbon-body">';
        html += '</div>';

        this.$el.append(html);

        this.$header = this.$el.find('.silky-ribbon-header');
        this.$body   = this.$el.find('.silky-ribbon-body');

        var currentTabIndex = this.model.get('selectedIndex');
        var currentTab = this.model.get('tabs')[currentTabIndex];
        var items = currentTab.items;

        this.buttons = { };

        var self = this;

        items.forEach(function(item) {

            var $button = $('<div style="display: inline-block ; "></div>').appendTo(self.$body);
            var  button = new RibbonButton($button, item);
            self.buttons[item.name] = button;

            button.onAnalysisSelected(function(analysis) { self._analysisSelected(analysis); });
        });

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
    _analysisSelected : function(analysis) {
        this.model._activateAnalysis(analysis.ns, analysis.name);
    },
    _dataAvailableChanged : function(source, available) {
        var currentTab = this.model.get('tabs')[1];
        var items = currentTab.items;

        var self = this;

        items.forEach(function(item) {
            if (item.requiresData)
                self.buttons[item.name].setEnabled(available);
        });
    }
});

module.exports = { View : RibbonView, Model : RibbonModel };
