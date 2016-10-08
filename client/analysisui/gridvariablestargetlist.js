'use strict';

var $ = require('jquery');
var _ = require('underscore');
var FormatDef = require('./formatdef');
var EnumPropertyFilter = require('./enumpropertyfilter');
var GridTargetList = require('./gridtargetlist');
var Overridable = require('./overridable');

var GridVariablesTargetList = function(params) {
    GridTargetList.extend(this, params);
    Overridable.extendTo(this);

    this.registerSimpleProperty("variableFilter", "none", new EnumPropertyFilter(["none", "unique", "unique_per_row", "unique_per_column"], "none"));

    var self = this;
    this._override('onRenderToGrid', function(baseFunction, grid, row, column) {
        var returnValue = baseFunction.call(self.targetGrid, grid, row, column);
        this.targetGrid.$el.addClass("silky-variable-target");

        return returnValue;
    });
};

module.exports = GridVariablesTargetList;
