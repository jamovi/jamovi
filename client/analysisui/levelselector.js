'use strict';

const $ = require('jquery');
const GridOptionControl = require('./gridoptioncontrol');
const RequestDataSupport = require('./requestdatasupport');
const FormatDef = require('./formatdef');
const _focusLoop = require('../common/focusloop');

const LevelSelector = function(params) {

    GridOptionControl.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.registerSimpleProperty('format', FormatDef.string);
    this.registerSimpleProperty('defaultLevelIndex', 0);
    this.registerOptionProperty('variable');
    this.registerOptionProperty('allowNone');

    this.$icon = null;
    this.$label = null;
    this.$el = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-string"></div>');

    this.levels = [];
    this.enabled = true;
    this.none = '- None -';

    this.onRenderToGrid = function(grid, row, column) {

        let label = this.getPropertyValue('label');
        if (label === null)
            label = '';

        let columnUsed = 0;
        let cell = null;
        let id = _focusLoop.getNextAriaElementId('ctrl');
        if (label !== '') {
            this.$label = $(`<label for="${id}" class="silky-option-combo-label silky-control-margin-${this.getPropertyValue('margin')}" style="display: inline; white-space: nowrap;" >${label}</label>`);
            cell = grid.addCell(column, row, this.$label);
            cell.setAlignment('left', 'center');
            columnUsed += 1;
        }

        let t = `<select id="${id}" class="silky-option-input silky-option-combo-input jmv-level-selector silky-control-margin-${this.getPropertyValue('margin')}">`;
        if (this.getPropertyValue('allowNone'))
            t += '<option>' + this.none + '</option>';
        t += '</select>';

        this.$input = $(t);
        this.update();
        this.$input.change((event) => {
            let value = this.$input.val();
            if (value === this.none && this.getPropertyValue('allowNone'))
                this.setValue(null);
            else
                this.setValue(value);
        });

        let spans = { rows: 1, columns: 1 };
        let vAlign = 'top';
        if (columnUsed === 0 && this.hasProperty('cell')) {
            spans = { rows: 1, columns: 2 };
            vAlign = 'center';
        }

        cell = grid.addCell(column + columnUsed, row, this.$input, { spans, vAlign });
        cell.setAlignment('left', 'center');

        columnUsed += 1;

        return { height: 1, width: columnUsed };
    };

    this.update = function() {
        let allowNone = this.getPropertyValue('allowNone');
        if (allowNone === null)
            allowNone = false;
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
            if (allowNone)
                html += '<option>' + this.none + '</option>';
            if (this.levels) {
                for (let i = 0; i < this.levels.length; i++) {
                    if (this.levels[i].label === displayValue)
                        selIndex = i;

                    html += '<option>' + this.levels[i].label + '</option>';
                }
            }
            else
                this.levels = [];

            selIndex = allowNone ? selIndex + 1 : selIndex;
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
        let allowNone = this.getPropertyValue('allowNone');
        if (allowNone === null)
            allowNone = false;
        let index = -1;
        if (value === null && allowNone)
            index = 0;
        else {
            for (let i = 0; i < this.levels.length; i++) {
                if (this.levels[i].label === value) {
                    if (allowNone)
                        index = i + 1;
                    else
                        index = i;
                    break;
                }
            }
        }
        select.selectedIndex = index;
    };
};

module.exports = LevelSelector;
