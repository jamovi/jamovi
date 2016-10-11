
'use strict';

var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var RibbonButton = require('./ribbonbutton');

var RibbonModel = Backbone.Model.extend({

    toggleResultsMode : function() {
        this.trigger('toggleResultsMode');
    },
    defaults : {
        dataAvailable : false,
        tabs : [
            { title : "File" },
            { title : "Analyse", items : [
                { name : 'Descriptives', type : 'menu', title : 'Exploration', requiresData: true, items : [
                    { name : 'Descriptives', type: 'analysis', title : 'Descriptives', ns : 'jmv' },
                ]},
                { name : 'TTest', type : 'menu', title : 'T-Test', requiresData: true, items : [
                    { name : 'TTestIS',   type: 'analysis', title : 'Independent Samples T-Test', ns : 'jmv' },
                    { name : 'TTestPS',   type: 'analysis', title : 'Paired Samples T-Test', ns : 'jmv' },
                    { name : 'TTestOneS', type: 'analysis', title : 'One Sample T-Test', ns : 'jmv' },
                ]},
                { name : 'Anova', type : 'menu', title : 'ANOVA', requiresData: true, items : [
                    { name : 'Anova',   title : 'ANOVA', ns : 'jmv' },
                    { name : 'AnovaRM', title : 'Repeated Measures ANOVA', ns : 'jmv' },
                    { name : 'Ancova',  title : 'ANCOVA', ns : 'jmv' },
                    { name : 'Mancova', title : 'MANCOVA', ns : 'jmv' },
                    { name : 'Non-param', type : 'group', title : 'Non-Parametric', items : [
                        { name : 'Kruskal', title : 'One Way ANOVA', subtitle : 'Kruskal-Wallis', ns : 'jmv' },
                        { name : 'Friedman', title : 'Repeated Measures ANOVA', subtitle : 'Friedman', ns : 'jmv' },
                    ]},
                    /*{ name : 'Bayesian', type : 'group', title : 'Bayesian', items : [
                        { name : 'BAnova', title : 'Bayesian ANOVA', ns : 'jmv' },
                        { name : 'BRMAnova', title : 'B. Repeated Measures ANOVA', ns : 'jmv' },
                        { name : 'BAncova', title : 'Bayesian ANCOVA', ns : 'jmv' },
                    ]},*/
                ]},
                { name : 'Regression', type : 'menu', title : 'Regression', requiresData: true, items : [
                    { name : 'CorrMatrix', title : 'Correlation Matrix', ns : 'jmv' },
                    { name : 'LinReg',     title : 'Linear Regression', ns : 'jmv' },
                ]},
                { name : 'Frequencies', type : 'menu', title : 'Frequencies', requiresData: true, items : [
                    { name : 'OSPT', type : 'group', title : 'One Sample Proportion Tests', items : [
                        { name : 'Binomial', title : '2 Outcomes', subtitle : 'Binomial test', ns : 'jmv' },
                        { name : 'GoFit',   title : 'N Outcomes', subtitle : 'χ² Goodness of Fit', ns : 'jmv' },
                    ]},
                    { name : 'ContTables', type : 'group', title : 'Contingency Tables', items : [
                        { name : 'ContTables', title : 'Independent Samples', subtitle: 'χ² Test of Association', ns : 'jmv' },
                        { name : 'ContTablesPaired', title : 'Paired Samples', subtitle: 'McNemar test', ns : 'jmv' },
                    ]},
                    { name : 'Empty', type : 'group', title : '', items : [ ] },
                    { name : 'LogLinear', title : 'Log-Linear Regression', ns : 'jmv' },
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
        html += '    <div class="silky-ribbon-menu-button"><span class="mif-more-vert"><span></div>';
        html += '</div>';
        html += '<div class="silky-ribbon-body">';
        html += '</div>';

        this.$el.append(html);

        this.$header = this.$el.find('.silky-ribbon-header');
        this.$body   = this.$el.find('.silky-ribbon-body');
        this.$menu   = this.$el.find('.silky-ribbon-menu-button');

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

        this.$menu.on('click', () => this.model.toggleResultsMode());
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
