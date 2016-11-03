'use strict';

var $ = require('jquery');
var _ = require('underscore');
var FormatDef = require('./formatdef');
var GridTargetList = require('./gridtargetlist');

var GridVariablesTargetList = function(params) {
    GridTargetList.extendTo(this, params);

    this._suggestedVariableTypes = [];
    this._permittedVariableTypes = [];
    this.$icons = null;

    this.searchForVariableProperties = function(properties) {
        var optType = properties.type;
        if (optType === "Array")
            return this.searchForVariableProperties(properties.template);
        else if (optType === "Group") {
            for (let i = 0; i < properties.elements.length; i++) {
                var props = this.searchForVariableProperties(properties.elements[i]);
                if (props !== null)
                    return props;
            }
        }
        else if (optType === "Variable" || optType === "Variables" || optType === "Pair" || optType === "Pairs")
            return properties;

        return null;
    };

    this.onOptionSet = function(option) {
        var properties = this.searchForVariableProperties(option.getProperties());

        this._suggestedVariableTypes = properties.suggested;
        if (_.isUndefined(this._suggestedVariableTypes))
            this._suggestedVariableTypes = [];
        this._permittedVariableTypes = properties.permitted;
        if (_.isUndefined(this._permittedVariableTypes))
            this._permittedVariableTypes = [];

        if (this._rendered)
            self._renderSuggestedIcons();
    };

    this._renderSuggestedIcons = function() {
        if (this._suggestedVariableTypes.length > 0) {
            this.$icons = $('<div class="silky-variablelist-icons"></div>');
            for (let i = 0; i < this._suggestedVariableTypes.length; i++) {
                this.$icons.append('<div style="display: inline-block; overflow: hidden;" class="silky-variable-type-img silky-variable-type-' + this._suggestedVariableTypes[i] + '"></div>');
            }

            this.checkScrollBars();
            this.targetGrid._parentCell.$el.append(this.$icons);
        }
    };

    this.checkScrollBars = function() {
        setTimeout(() => {
            if (this.$icons) {
                var rightValue = 3;
                if (this.targetGrid.hasVScrollbar())
                    rightValue += this.targetGrid.getScrollbarWidth();

                var bottomValue = parseFloat(this.targetGrid.$el.css("bottom")) + 3;
                if (this.targetGrid.hasHScrollbar())
                    bottomValue += this.targetGrid.getScrollbarHeight();

                this.$icons.css("bottom", bottomValue);
                this.$icons.css("right", rightValue);
            }
        }, 0);
    };

    var self = this;
    this._override('onRenderToGrid', function(baseFunction, grid, row, column) {
        var returnValue = baseFunction.call(self, grid, row, column);

        self.targetGrid.on('layoutgrid.validated', () => { this.checkScrollBars(); } );
        self.targetGrid.$el.addClass("silky-variable-target");
        if (self.option !== null)
            self._renderSuggestedIcons();
        self._rendered = true;
        return returnValue;
    });

    this._override('testValue', function(baseFunction, item, rowIndex, columnName) {
        var allowItem = true;
        if (baseFunction !== null) {
            allowItem = baseFunction.call(self, item, rowIndex, columnName);
            if (!allowItem)
                return allowItem;
        }

        var itemValue = item.value;
        if (itemValue.format.name === 'variable')
            allowItem = this._checkIfVariableTypeAllowed(item.properties.type);

        if (!allowItem)
            this._flashIcons();

        return allowItem;
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
        return allowItem;
    };

    this._flashIcons = function() {
        if (this.$icons === null)
            return;

        this.$icons.addClass('silky-variable-flash');
        setTimeout(() => {
            this.$icons.removeClass('silky-variable-flash');
        }, 500);
    };

    this._override('updateContext', function(baseFunction, context) {
        if (baseFunction !== null)
            baseFunction.call(this, context);

        this.refreshListItems();
    });
};

module.exports = GridVariablesTargetList;
