'use strict';

const $ = require('jquery');
const FormatDef = require('./formatdef');
const GridOptionListControl = require('./gridoptionlistcontrol');
const RequestDataSupport = require('./requestdatasupport');
const SuperClass = require('../common/superclass');
let DefaultControls;

const VariablesListBox = function(params) {

    if (params.columns === undefined) {
        if (!DefaultControls)
            DefaultControls = require('./defaultcontrols');
        params.template = { type: DefaultControls.VariableLabel };
    }

    GridOptionListControl.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.registerSimpleProperty("format", FormatDef.variables);

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

    this._override("onOptionSet", (baseFunction, option) => {

        if (baseFunction !== null)
            baseFunction.call(this, option);

        if (option === null)
            return;

        var properties = this.searchForVariableProperties(option.getProperties());

        this._suggestedVariableTypes = properties.suggested;
        if (this._suggestedVariableTypes === undefined)
            this._suggestedVariableTypes = [];
        this._permittedVariableTypes = properties.permitted;
        if (this._permittedVariableTypes === undefined)
            this._permittedVariableTypes = [];

        if (this._rendered)
            this._renderSuggestedIcons();
    });

    this._renderSuggestedIcons = function() {
        if (this._suggestedVariableTypes.length > 0) {
            this.$icons = $('<div class="silky-variablelist-icons"></div>');
            for (let i = 0; i < this._suggestedVariableTypes.length; i++) {
                this.$icons.append('<div style="display: inline-block; overflow: hidden;" class="silky-variable-type-img silky-variable-type-' + this._suggestedVariableTypes[i] + '"></div>');
            }

            this.checkScrollBars();
            this.$el.append(this.$icons);
        }
    };


    this.checkScrollBars = () => {
            if (this.$icons) {

                let rightValue = 3 - this.$el.scrollLeft();
                let bottomValue = 3 - this.$el.scrollTop();

                this.$icons.css("bottom", bottomValue);
                this.$icons.css("right", rightValue);
            }
    };

    this.$el.scroll(this.checkScrollBars);


    this._override('addedContentToCell', (baseFunction, cell) => {
        if (baseFunction !== null)
            baseFunction.call(this, cell);

        this.on('layoutgrid.validated', () => { this.checkScrollBars(); } );
        this.$el.addClass("silky-variable-target");
        if (this.getOption() !== null)
            this._renderSuggestedIcons();
        this._rendered = true;
    });

    this._override('testValue', (baseFunction, item, rowIndex, columnName) => {
        let allowItem = true;
        if (baseFunction !== null) {
            allowItem = baseFunction.call(this, item, rowIndex, columnName);
            if (!allowItem)
                return allowItem;
        }

        var itemValue = item.value;
        if (itemValue.format.name === 'variable' && item.properties !== undefined)
            allowItem = this._checkIfVariableTypeAllowed(item.properties);

        if (!allowItem)
            this._flashIcons();

        return allowItem;
    });

    this._checkPermitted = function(column, permitted) {

        let measureType = column.measureType;
        if ((column.measureType === 'nominal' || column.measureType === 'ordinal') && column.dataType === 'text')
            measureType = column.measureType + 'text';
        if (permitted.includes(measureType))
            return true;


        if (column.measureType === 'id')
            return false;
        else if ((column.measureType === 'nominal' || column.measureType === 'ordinal') && permitted.includes('factor'))
            return true;
        else if ((column.dataType === 'integer' || column.dataType === 'decimal') && permitted.includes('numeric'))
            return true;

        return false;
    };

    this._checkIfVariableTypeAllowed = function(data) {
        let allowItem = true;
        if (this._permittedVariableTypes.length > 0)
            allowItem = this._checkPermitted(data, this._permittedVariableTypes);
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
};
SuperClass.create(VariablesListBox);
module.exports = VariablesListBox;
