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

    this.registerSimpleProperty("suggestedVariableTypes", [], new EnumArrayPropertyFilter(["continuous", "ordinal", "nominal", "nominaltext"]));
    this.registerSimpleProperty("permittedVariableTypes", [], new EnumArrayPropertyFilter(["continuous", "ordinal", "nominal", "nominaltext"]));

    this._suggestedVariableTypes = this.getPropertyValue("suggestedVariableTypes");
    this._permittedVariableTypes = this.getPropertyValue("permittedVariableTypes");

    var self = this;
    this._override('onRenderToGrid', function(baseFunction, grid, row, column) {
        var returnValue = baseFunction.call(self, grid, row, column);
        self.targetGrid.$el.addClass("silky-variable-target");

        if (self._suggestedVariableTypes.length > 0) {
            var $icons = $('<div class="silky-variablelist-icons"></div>');
            for (let i = 0; i < this._suggestedVariableTypes.length; i++) {
                $icons.append('<div style="display: inline-block; overflow: hidden;" class="silky-variable-type-img silky-variable-type-' + self._suggestedVariableTypes[i] + '"></div>');
            }
            self.targetGrid.$el.append($icons);
        }
        return returnValue;
    });

    this._override('addRawToOption', function(baseFunction, item, key) {
        var allowItem = true;
        var itemValue = item.value;
        if (itemValue.format.name === 'variable')
            allowItem = this._checkIfVariableTypeAllowed(item.properties.type);

        if (allowItem)
            return baseFunction.call(self, item, key);
        else
            return false;
    });

    this._checkIfVariableTypeAllowed = function(type) {
        var allowItem = true;
        if (this._permittedVariableTypes.length > 0) {
            allowItem = false;
            for (let i = 0; i < this._permittedVariableTypes.length; i++) {
                if (type === this._permittedVariableTypes[i]) {
                    allowItem = true;
                    break;
                }
            }
        }
        if (!allowItem) {
            for (let i = 0; i < this._suggestedVariableTypes.length; i++) {
                if (type === this._suggestedVariableTypes[i]) {
                    allowItem = true;
                    break;
                }
            }
        }

        return allowItem;
    };

    this._override('filterItemsForDrop', function(baseFunction, items) {
        var list = baseFunction.call(self, items);

        var itemsToDrop = [];
        for (var i = 0; i < list.length; i++) {
            if (this._checkIfVariableTypeAllowed(list[i].properties.type))
                itemsToDrop.push(items[i]);
        }
        return itemsToDrop;
    });
};

module.exports = GridVariablesTargetList;
