'use strict';

const $ = require('jquery');
const LayoutGrid = require('./layoutgrid').Grid;
const GridOptionControl = require('./gridoptioncontrol');
const FormatDef = require('./formatdef');
const EnumPropertyFilter = require('./enumpropertyfilter');

const GridTextbox = function(params) {

    this.parse = function(value) {
        return this.getPropertyValue('format').parse(value);
    };

    GridOptionControl.extendTo(this, params);
    this.registerSimpleProperty('format', FormatDef.string);
    this.registerSimpleProperty('suffix', null);
    this.registerSimpleProperty('inputPattern', null);
    this.registerSimpleProperty('borderless', false);
    this.registerSimpleProperty('alignText', 'left', new EnumPropertyFilter(['left', 'center', 'right'], 'left'));
    this.registerSimpleProperty('width', 'normal', new EnumPropertyFilter(['small', 'normal', 'large', 'largest'], 'normal'));
    this.registerSimpleProperty('suggestedValues', null);


    this.$suffix = null;
    this.$label = null;

    this.onRenderToGrid = function(grid, row, column) {

        let label = this.getPropertyValue('label');
        if (label === null)
            label = '';

        let cell = null;
        let startClass = label === '' ? '' : 'silky-option-text-start';
        this.$label = $('<div class="silky-option-text-label silky-control-margin-' + this.getPropertyValue('margin') + ' ' + startClass + '" style="display: inline; white-space: nowrap;" >' + label + '</div>');
        cell = grid.addCell(column, row, false, this.$label);
        cell.blockInsert('right');
        cell.setAlignment('left', 'center');


        let suffix = this.getPropertyValue('suffix');
        if (suffix === null)
            suffix = '';

        let subgrid = new LayoutGrid();
        subgrid.$el.addClass('silky-layout-grid');
        cell = grid.addCell(column + 1, row, true, subgrid);
        cell.setStretchFactor(this.getPropertyValue('stretchFactor'));
        cell.blockInsert('left');
        startClass = label === '' ? 'silky-option-text-start' : '';
        startClass = startClass + ' ' + (suffix === '' ? 'silky-option-text-end' : '');

        let dd = '';
        let suggestedValues = this.getPropertyValue('suggestedValues');
        let optionsName = suggestedValues === null ? null : this.getPropertyValue('name') + '_suggestedValues';
        if (suggestedValues !== null) {
            dd = '<div class="jmv-option-text-input-suggested silky-control-margin-' + this.getPropertyValue('margin') + ' ' + startClass + '" id="'+ optionsName + '" style="display: none;">';
            for (let i = 0; i < suggestedValues.length; i++) {
                let isObject = false;
                let value = suggestedValues[i];
                if (suggestedValues[i].value !== undefined) {
                    value = suggestedValues[i].value;
                    isObject = true;
                }
                dd = dd + '<div class="jmv-option-text-input-suggested-option" data-value="' + value + '">';
                dd = dd + '    <div class="jmv-option-text-input-suggested-option-value">' + value + '</div>';
                if (isObject && suggestedValues[i].label)
                    dd = dd + '    <div class="jmv-option-text-input-suggested-option-label">' + suggestedValues[i].label + '</div>';
                dd = dd + '</div>';
            }
            dd = dd + '</div>';
        }
        this.$suggestValues = $(dd);

        let t = '<input class="silky-option-input silky-option-text-input silky-option-value silky-control-margin-' + this.getPropertyValue('margin') + ' ' + startClass + '" style="display: inline;" type="text" value="' + this.getValueAsString() + '"';
        let inputPattern = this.getPropertyValue('inputPattern');
        if (inputPattern !== null)
            t += ' pattern="'+ inputPattern + '"';
        t += '>';

        this.$input = $(t);
        if (this.getPropertyValue('stretchFactor') === 0)
            this.$input.addClass('silky-option-' + this.getPropertyValue('width') + '-text');
        if (this.getPropertyValue('borderless'))
            this.$input.addClass('frameless-textbox');
        if (this.getPropertyValue('alignText') === 'center')
            this.$input.addClass('centre-text');

        this.$input.on('focus', function() { $(this).select(); });
        this.$input.keyup((event) => {
            if (event.keyCode == 13) {
                this.$input.blur();
            }
        });
        this.$input.on('focus', (event) => {
            this.$suggestValues.show();
            if (this.$fullCtrl)
                this.$fullCtrl.addClass('float-up');
        });
        this.$input.on('blur', (event) => {
            this.$suggestValues.hide();
            if (this.$fullCtrl)
                this.$fullCtrl.removeClass('float-up');
        });
        this.$input.change((event) => {

            if (this.$input[0].validity.valid === false)
                this.$input.addClass('silky-options-option-invalid');
            else
                this.$input.removeClass('silky-options-option-invalid');

            let value = this.$input.val();
            value = this.parse(value);
            this.setValue(value);
        });

        this.$suggestValues.find('.jmv-option-text-input-suggested-option').on('mousedown', null, this,  function (event) {
            let value = $(this).data('value');
            let self = event.data;
            value = self.parse(value);
            self.setValue(value);
        });

        let $ctrl = this.$input;
        if (suggestedValues !== null) {
            $ctrl = $('<div></div>');
            $ctrl.append(this.$input);
            $ctrl.append(this.$suggestValues);
            this.$fullCtrl = $ctrl;
        }

        cell = subgrid.addCell(0, 0, true, $ctrl);
        cell.blockInsert('left');
        cell.setAlignment('left', 'center');
        cell.setStretchFactor(this.getPropertyValue('stretchFactor'));

        startClass = suffix === '' ? '' : 'silky-option-text-end';

        this.$suffix = $('<div class="silky-option-suffix silky-control-margin-' + this.getPropertyValue('margin') + ' ' + startClass + '" style="display: inline; white-space: nowrap;" >' + suffix + '</div>');
        cell = subgrid.addCell(1, 0, false, this.$suffix);
        cell.setAlignment('left', 'center');

        return { height: 1, width: 3 };
    };

    this.getValueAsString = function() {
        let value = this.getValue();
        if (value === undefined || value === null)
            return '';

        return this.getPropertyValue('format').toString(value);
    };

    this.onOptionValueChanged = function(key, data) {
        if (this.$input)
            this.$input.val(this.getValueAsString());
    };

    this._override('onPropertyChanged', (baseFunction, name) => {
        baseFunction.call(this, name);
        if (name === 'enable') {
            let disabled = this.getPropertyValue(name) === false;
            this.$input.prop('disabled', disabled);
            if (disabled) {
                if (this.$label !== null)
                    this.$label.addClass('disabled-text');
                if (this.$suffix !== null)
                    this.$suffix.addClass('disabled-text');
            }
            else {
                if (this.$label !== null)
                    this.$label.removeClass('disabled-text');
                if (this.$suffix !== null)
                    this.$suffix.removeClass('disabled-text');
            }
        }
    });
};

module.exports = GridTextbox;
