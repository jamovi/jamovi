'use strict';

const $ = require('jquery');
const GridOptionControl = require('./gridoptioncontrol');
const RequestDataSupport = require('./requestdatasupport');
const FormatDef = require('./formatdef');

const VariableLabel = function(params) {

    GridOptionControl.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.registerSimpleProperty("format", FormatDef.variable);

    this.$icon = null;
    this.$label = null;
    this.$el = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-variable"></div>');

    this._override("onDataChanged", (baseFunction, data) => {
        if (baseFunction !== null)
            baseFunction.call(this, data);

        if (data.dataType !== "columns")
            return;

        if (data.dataInfo.measureTypeChanged)
            this.updateView();
    });

    this.createItem = function() {
        let displayValue = this.getValue();
        if (displayValue === null)
            displayValue = '';

        this.$label = $('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + displayValue + '</div>');
        this.$icon = $('<div style="display: inline-block; overflow: hidden;"></div>');

        this.$el.append(this.$icon);
        this.$el.append(this.$label);
    };

    this.addedContentToCell = function(cell) {
        let displayValue = this.getValue();
        if (displayValue === null)
            displayValue = '';
        this._cell = cell;
        this._updateIcon(displayValue);
    };

    this._updateIcon = function(columnName) {
        let promise = this.requestData("column", { columnName: columnName, properties: [ "measureType" ] });
        promise.then(rData => {
            this.$icon.removeClass();
            let measureType = rData.measureType;
            if (measureType === undefined)
                measureType = "none";
            var imageClasses = 'silky-variable-type-img';
            if (measureType !== null && measureType !== undefined)
                imageClasses = imageClasses + ' silky-variable-type-' + measureType;
            else
                imageClasses = imageClasses + ' silky-variable-type-none';

            this.$icon.addClass(imageClasses);

            this._cell.onContentSizeChanged({type: "both"});
        });
    };

    this.onOptionValueChanged = function(key, data) {
        this.updateView();
    };

    this.updateView = function() {
        if (this.$label === null)
            return;

        let displayValue = this.getValue();
        this.$label.text(displayValue);
        this._updateIcon(displayValue);
    };
};

module.exports = VariableLabel;
