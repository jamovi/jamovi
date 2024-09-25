'use strict';

const $ = require('jquery');
const GridOptionControl = require('./gridoptioncontrol');
const RequestDataSupport = require('./requestdatasupport');
const FormatDef = require('./formatdef');
const focusLoop = require('../common/focusloop');

const TermLabel = function(params) {

    GridOptionControl.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.$el = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-term"></div>');

    this.registerSimpleProperty('format', FormatDef.term);

    this._format = this.getPropertyValue('format');

    this.getAriaLabel = function() {
        let value = this.getValue();
        return this._format.toAriaLabel(value);
    }

    this.createItem = function() {
        let value = this.getValue();

        let displayValue = this._format.toString(value);

        this.labelId = focusLoop.getNextAriaElementId('label');
        this.$label = $(`<div id="${this.labelId}" aria-label="${ this.getAriaLabel() }" style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">${ displayValue }</div>`);

        this.$el.append(this.$label);
        if (value !== null)
            this.updateView(value);

    };

    this.onOptionValueChanged = function(key, data) {
        if (this.$label) {
            let value = this.getValue();
            let displayValue = this._format.toString(value);
            this.$label.html(displayValue);
            this.$label.attr('aria-label', this._format.toAriaLabel(value));
            if (value !== null)
                this.updateView(value);
        }
    };

    this._override('onDataChanged', (baseFunction, data) => {
        if (baseFunction !== null)
            baseFunction.call(this, data);

        if (data.dataType !== 'columns')
            return;

        if (data.dataInfo.countChanged) {
            let value = this.getValue();
            if (value !== null)
                this.updateView(value);
        }
    });

    this._updateCount = 0;

    this.updateView = function(columnNames) {
        let promises = [];
        let count = 0;
        let columnFound = true;
        this._updateCount += 1;
        let process = rData => {
            if (rData.requestData.requestId !== this._updateCount)
                return;

            if (columnFound && rData.columnFound === false)
               columnFound = false;

            count += 1;
            if (count === columnNames.length) {
                if (columnFound === false)
                   this.$el.addClass('unavaliable_variable');
               else
                   this.$el.removeClass('unavaliable_variable');
            }
        };
        for (let i = 0; i < columnNames.length; i++) {
            let columnName = columnNames[i];
            let promise = this.requestData('column', { columnName: columnName, properties: [ 'measureType' ], requestId: this._updateCount });
            promise.then(process);
        }
    };
};

module.exports = TermLabel;
