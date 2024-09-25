'use strict';

const $ = require('jquery');
const FormatDef = require('./formatdef');
const GridOptionListControl = require('./gridoptionlistcontrol');
const RequestDataSupport = require('./requestdatasupport');
const SuperClass = require('../common/superclass');
const focusLoop = require('../common/focusloop');

const VariablesListBox = function (params) {

    if (params.columns === undefined)
        params.template = { type: params.DefaultControls.VariableLabel };

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
        else if (optType === "Variable" || optType === "Variables" || optType === "Pair" || optType === "Pairs" || optType === 'Output' || optType === 'Outputs')
            return properties;

        return null;
    };

    this._override("onOptionSet", (baseFunction, option) => {

        if (baseFunction !== null)
            baseFunction.call(this, option);

        if (option === null)
            return;

        let properties = this.searchForVariableProperties(option.getProperties());

        if (properties === null) {
            this._suggestedVariableTypes = [];
            this._permittedVariableTypes = [];
        }
        else {
            this._suggestedVariableTypes = properties.suggested;
            if (this._suggestedVariableTypes === undefined)
                this._suggestedVariableTypes = [];
            this._permittedVariableTypes = properties.permitted;
            if (this._permittedVariableTypes === undefined)
                this._permittedVariableTypes = [];
        }

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

        if (this.hasProperty('permitted')) {
            let permitted = this.getPropertyValue('permitted');
            if (permitted.includes('output')) {
                this.$createButton = $(`<div class="variablelist-button-box"><div class="button"><span class="mif-plus"></span><div class="text">Add New Variable</div></div></div>`);
                this.fillerCell.setContent(this.$createButton);
                this.fillerCell.makeSticky({ bottom: '0px' });
                this.$createButton = this.$createButton.find('.button');
                let label = this.getPropertyValue('label');

                this.$createButton.on('click', () => {
                    let desiredName = label;
                    if (this.isSingleItem === false)
                        desiredName = desiredName + ' ' + (this.contentRowCount() + 1);

                    let promise = this.requestAction('createColumn',  { columnType: 'output', name: desiredName}).then((value) => {
                        if (this.isSingleItem)
                            this.setValue(value);
                        else {
                            let list = this.getValue();
                            if (list === null)
                                list = [value];
                            else {
                                list = list.slice();
                                list.push(value);
                            }

                            this.setValue(list);
                        }
                    });
                });
                let value = this.getValue();
                if (this.isSingleItem && value !== null) {
                    this.fillerCell.setVisibility(false);
                    this.$createButton.css('display', 'none');
                }
            }
        }
    };

    this._override('onOptionValueChanged', (baseFunction, key, data) => {
        if (baseFunction !== null)
            baseFunction.call(this, key, data);

        if (this.isSingleItem && this.$createButton) {
            let value = this.getValue();
            if (value === null) {
                this.fillerCell.setVisibility(true);
                this.$createButton.css('display', '');
            }
            else {
                this.fillerCell.setVisibility(false);
                this.$createButton.css('display', 'none');
            }
        }
    });


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

    this._override('testValue', (baseFunction, item, silent, rowIndex, columnName) => {
        let allowItem = true;
        if (baseFunction !== null) {
            allowItem = baseFunction.call(this, item, silent, rowIndex, columnName);
            if (!allowItem)
                return allowItem;
        }

        var itemValue = item.value;
        if (itemValue.format.name === 'variable' && item.properties !== undefined)
            allowItem = this._checkIfVariableTypeAllowed(item.properties);

        if ( ! allowItem &&  ! silent) {
            focusLoop.speakMessage(s_('{var} not permitted. Incorrect measure or data type.', {var: itemValue.toAriaLabel()}));
            this._flashIcons();
        }

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
