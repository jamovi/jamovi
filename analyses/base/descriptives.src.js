
var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
Backbone.$ = $

var Bool = require('bool')
var Int = require('int')
var Variables = require('variables')
var Options = require('options')
var OptionsView = require('optionsview')



var Model = Options.extend({
    defaults : {
        "options" :[
            new Variables({
                "id" : "variables",
                "permitted" : "continuous|ordinal|nominal",
                "suggested" : "continuous"
            }),
            new Bool({
                "id" : "mean",
                default : true
            }),
            new Bool({
                "id" : "median",
                default : false
            }),
            new Bool({
                "id" : "frequencyTables",
                default : false
            }),
            new Bool({
                "id" : "plotVariables",
                default : false
            }),
            new Bool({
                "id" : "plotCorrelationMatrix",
                default : false
            }),
            new Bool({
                "id" : "percentileValuesQuartiles",
                default : false
            }),
            new Bool({
                "id" : "percentileValuesEqualGroups",
                default : false
            }),
            new Bool({
                "id" : "percentileValuesPercentiles",
                default : false
            }),
            new Bool({
                "id" : "mode",
                default : false
            }),
            new Bool({
                "id" : "sum",
                default : false
            }),
            new Bool({
                "id" : "standardDeviation",
                default : true
            }),
            new Bool({
                "id" : "variance",
                default : false
            }),
            new Bool({
                "id" : "range",
                default : false
            }),
            new Bool({
                "id" : "minimum",
                default : true
            }),
            new Bool({
                "id" : "maximum",
                default : true
            }),
            new Bool({
                "id" : "standardErrorMean",
                default : false
            }),
            new Bool({
                "id" : "skewness",
                default : false
            }),
            new Bool({
                "id" : "kurtosis",
                default : false
            }),
            new Int({
                "id" : "plotWidth",
                default : 480
            }),
            new Int({
                "id" : "plotHeight",
                default : 320
            }),
            new Int({
                "id" : "percentileValuesEqualGroupsNo",
                default : 4
            })
        ]
    },

    /*_refList: { },
    _refListIndex: 0,

    getOption: function(id) {

        var list = this.get("options");
        if ($.isNumeric(id))
            return list[id];

        var option = _refList[id];

        if (_.isUndefined(option) === false)
            return option;

        var i = this._refListIndex;
        for (; i < list.length; i++) {
            var opt = list[i];
            if (opt.id === id) {
                i += 1;
                break;
            }
            _refList[id] = opt;
        }

        this._refListIndex = i;

        return opt;
    }*/


})

var descriptivesView = OptionsView.extend({

    title: "Descriptives",

    optionText: {
        variables : function() { return "Columns and stuff" },
        mean : "Mean",
        median : function() { return "Median and stuff" },
        //frequencyTables : "Display Frequency Tables",
        plotVariables : "Display Plots",
        plotCorrelationMatrix : "Display Correlation Plot",
        percentileValuesQuartiles : "Quartiles",
        percentileValuesEqualGroups : "Cut points for",
        percentileValuesPercentiles : "Percentiles",
        mode : "Mode",
        sum : "Sum",
        standardDeviation : "Std. deviation",
        variance : "Variance",
        range : "Range",
        minimum : "Minimum",
        maximum : "Maximum",
        standardErrorMean : "S. E. Mean",
        skewness : "Skewness",
        kurtosis : "Kurtosis",
        plotWidth : "Plot Width",
        plotHeight : "Polt Height",
        percentileValuesEqualGroupsNo : "equal groups"
    },

    onRender_mean: function(e) {
        return "STUFF AND THINGS!"
    }
})

module.exports = { Model : Model, View : descriptivesView }
