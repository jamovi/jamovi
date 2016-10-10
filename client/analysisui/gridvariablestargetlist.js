'use strict';

var $ = require('jquery');
var _ = require('underscore');
var FormatDef = require('./formatdef');
var EnumArrayPropertyFilter = require('./enumarraypropertyfilter');
var GridTargetList = require('./gridtargetlist');
var Overridable = require('./overridable');

var GridVariablesTargetList = function(params) {
    GridTargetList.extendTo(this, params);
    Overridable.extendTo(this);

    this.registerSimpleProperty("variableFilter", [], new EnumArrayPropertyFilter(["none", "continuous", "ordinal", "nominal", "nominaltext"]));

    var self = this;
    this._override('onRenderToGrid', function(baseFunction, grid, row, column) {
        var returnValue = baseFunction.call(self, grid, row, column);
        this.targetGrid.$el.addClass("silky-variable-target");

        var allowableVariableTypes = this.getPropertyValue("variableFilter");
        if (allowableVariableTypes.length > 0) {
            var $icons = $('<div class="silky-variablelist-icons"></div>');
            for (let i = 0; i < allowableVariableTypes.length; i++) {
                $icons.append('<div style="display: inline-block; overflow: hidden;" class="silky-variable-type-img silky-variable-type-' + allowableVariableTypes[i] + '"></div>');
            }
            this.targetGrid.$el.append($icons);
        }
        return returnValue;
    });
};

module.exports = GridVariablesTargetList;
