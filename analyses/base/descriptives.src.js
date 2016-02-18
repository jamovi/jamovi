'use strict';


var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var Bool = require('bool');
var Int = require('int');
var Variables = require('variables');
var Options = require('options');
var OptionsView = require('optionsview');



var Model = Options.extend({
    defaults : {
        "options" :[
            new Variables({
                "name" : "vars",
                "permitted" : "continuous|ordinal|nominal",
                "suggested" : "continuous"
            }),
            new Bool({
                "name" : "mean",
                default : true
            }),
            new Bool({
                "name" : "median",
                default : false
            }),
            new Bool({
                "name" : "frequencies",
                default : false
            }),
            new Bool({
                "name" : "mode",
                default : false
            }),
            new Bool({
                "name" : "sum",
                default : false
            }),
            new Bool({
                "name" : "sd",
                default : true
            }),
            new Bool({
                "name" : "variance",
                default : false
            }),
            new Bool({
                "name" : "range",
                default : false
            }),
            new Bool({
                "name" : "min",
                default : true
            }),
            new Bool({
                "name" : "max",
                default : true
            }),
            new Bool({
                "name" : "se",
                default : false
            }),
            new Bool({
                "name" : "skew",
                default : false
            }),
            new Bool({
                "name" : "kurt",
                default : false
            }),
            new Bool({
                "name" : "plots",
                default : false
            }),
            new Int({
                "name" : "plotW",
                default : 480
            }),
            new Int({
                "name" : "plotH",
                default : 320
            }),
            new Bool({
                "name" : "plotCorr",
                default : false
            }),
            new Bool({
                "name" : "pcQuart",
                default : false
            }),
            new Bool({
                "name" : "pcPercent",
                default : false
            }),
            new Bool({
                "name" : "pcEqGr",
                default : false
            }),
            new Int({
                "name" : "pcNEqGr",
                default : 4
            })
        ]
    },

});

var descriptivesView = OptionsView.extend({

    title: "Descriptives",

    optionText: {
        vars : function() { return "Columns and stuff"; },
        mean : "Mean",
        median : function() { return "Median and stuff"; },
        //frequencies : "Display Frequency Tables",
        plots : "Display Plots",
        plotCorr : "Display Correlation Plot",
        pcQuart : "Quartiles",
        pcEqGr : "Cut points for",
        pcPercent : "Percentiles",
        mode : "Mode",
        sum : "Sum",
        sd : "Std. deviation",
        variance : "Variance",
        range : "Range",
        min : "Minimum",
        max : "Maximum",
        se : "S. E. Mean",
        skew : "Skewness",
        kurt : "Kurtosis",
        plotW : "Plot Width",
        plotH : "Polt Height",
        pcNEqGr : "equal groups"
    },

    onRender_mean: function(e) {
        return "STUFF AND THINGS!";
    }
});

module.exports = { Model : Model, View : descriptivesView };
