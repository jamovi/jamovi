'use strict';

const $ = require('jquery');
const GridOptionControl = require('./gridoptioncontrol');
const RequestDataSupport = require('./requestdatasupport');
const FormatDef = require('./formatdef');

const LevelSelector = function(params) {

    GridOptionControl.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.registerSimpleProperty('format', FormatDef.string);
    this.registerSimpleProperty('defaultLevelIndex', 0);
    this.registerOptionProperty('variable');

    this.$icon = null;
    this.$label = null;
    this.$el = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-string"></div>');

    this.levels = [];
    this.enabled = true;

    this.onRenderToGrid = function(grid, row, column) {

        let label = this.getPropertyValue('label');
        if (label === null)
            label = '';

        let columnUsed = 0;
        let cell = null;
        if (label !== '') {
            this.$label = $('<div class="silky-option-combo-label silky-control-margin-' + this.getPropertyValue('margin') + '" style="display: inline; white-space: nowrap;" >' + label + '</div>');
            cell = grid.addCell(column, row, this.$label);
            cell.setAlignment('left', 'center');
            columnUsed += 1;
        }

        let t = '<select class="silky-option-input silky-option-combo-input jmv-level-selector silky-control-margin-' + this.getPropertyValue('margin') + '">';
        t += '</select>';

        this.$input = $(t);
        this.update();
        this.$input.change((event) => {
            let value = this.$input.val();
            this.setValue(value);
        });

        cell = grid.addCell(column + columnUsed, row, this.$input);
        cell.setAlignment('left', 'center');

        columnUsed += 1;

        return { height: 1, width: columnUsed };
    };

    this.update = function() {
        let variable = this.getPropertyValue('variable');
        let promise = this.requestData('column', { columnName: variable, properties: [ 'measureType', 'levels' ] });
        promise.then(rData => {

            if (this.isDisposed)
                return;

            if (variable !== this.getPropertyValue('variable'))
                return;

            if (rData.columnFound === false)
               this.$el.addClass('unavaliable_variable');
           else
               this.$el.removeClass('unavaliable_variable');

            if (this.$label !== null)
                this.$label.removeClass('disabled-text');

            this.measureType = rData.measureType;
            let enabled = this.enabled && this.measureType !== 'continuous';

            if (this.$label !== null) {
                if (enabled)
                    this.$label.removeClass('disabled-text');
                else
                    this.$label.addClass('disabled-text');
            }
            this.$input.prop('disabled', enabled === false);

            let html = '';
            let displayValue = this.getValue();
            this.levels = rData.levels;
            let selIndex = -1;
            if (this.levels) {
                for (let i = 0; i < this.levels.length; i++) {
                    if (this.levels[i].label === displayValue)
                        selIndex = i;

                    html += '<option>' + this.levels[i].label + '</option>';
                }
            }
            else
                this.levels = [];

            this.$input.empty();
            this.$input.html(html);
            this.$input[0].selectedIndex = selIndex;
            if (selIndex === -1 && this.levels.length > 0) {
                let defaultIndex = this.getPropertyValue('defaultLevelIndex');
                if (defaultIndex >= this.levels.length)
                    defaultIndex = this.levels.length - 1;
                this.setValue(this.levels[defaultIndex].label);
            }
        });
    };

    this._override('onPropertyChanged', (baseFunction, name) => {
        baseFunction.call(this, name);

        if (name === 'variable') {
            this.update();
        }
        else if (name === 'enable') {
            this.enabled = this.getPropertyValue(name);
            this.$input.prop('disabled', this.enabled === false);
            if (this.$label !== null) {
                if (this.enabled)
                    this.$label.removeClass('disabled-text');
                else
                    this.$label.addClass('disabled-text');
            }
        }
    });

    this.onOptionValueChanged = function(key, data) {
        if (this.$input)
            this._updateSelection();
    };

    this._updateSelection = function() {
        let select = this.$input[0];
        let value = this.getSourceValue();
        let index = -1;
        for (let i = 0; i < this.levels.length; i++) {
            if (this.levels[i].label === value) {
                index = i;
                break;
            }
        }
        select.selectedIndex = index;
    };
};

module.exports = LevelSelector;
