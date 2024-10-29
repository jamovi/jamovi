'use strict';

const $ = require('jquery');
const LayoutGrid = require('./layoutgrid');
const GridOptionControl = require('./gridoptioncontrol');
const FormatDef = require('./formatdef');
const EnumPropertyFilter = require('./enumpropertyfilter');
const focusLoop = require('../common/focusloop');

const GridTextbox = function(params) {

    this.parse = function(value) {
        let format = this.getPropertyValue('format');
        let raw = format.parse(value);
        if (format.isValid(raw))
            return { success: true, value: raw };

        let defaultValue = this.getPropertyValue('defaultValue');
        if (format.isValid(defaultValue))
            return { success: false, value:defaultValue };

        return { success: true, value: raw };
    };

    GridOptionControl.extendTo(this, params);
    this.registerSimpleProperty('format', FormatDef.string);
    this.registerSimpleProperty('suffix', null);
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

        label = this.translate(label);
        
        let id = focusLoop.getNextAriaElementId('ctrl');
        this.valueId = id

        let cell = null;
        let valueOffset = 0;
        let startClass = label === '' ? '' : 'silky-option-text-start';
        if (label !== '') {
            this.labelId = focusLoop.getNextAriaElementId('label');
            this.$label = $(`<label id="${this.labelId}" for="${id}" class="silky-option-text-label silky-control-margin-${this.getPropertyValue('margin')} ${startClass}" style="display: inline; white-space: nowrap;" >${label}</label>`);
            cell = grid.addCell(column, row, this.$label);
            cell.blockInsert('right');
            cell.setAlignment('left', 'center');
            valueOffset += 1;
        }


        let suffix = this.getPropertyValue('suffix');
        if (suffix === null)
            suffix = '';
        
        suffix = suffix.trim();

        let subgrid = new LayoutGrid();
        subgrid.$el.css('column-gap', '1ex');
        subgrid.$el.addClass('silky-layout-grid');
        let spans = { rows: 1, columns: 1 };
        let vAlign = 'top';
        if (valueOffset === 0 && this.isPropertyDefined('cell')) {
            spans = { rows: 1, columns: 2 };
            vAlign = 'center';
        }

        cell = grid.addCell(column + valueOffset, row, subgrid, { spans, vAlign });
        cell.setStretchFactor(this.getPropertyValue('stretchFactor'));
        cell.blockInsert('left');
        
        
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
                    dd = dd + '    <div class="jmv-option-text-input-suggested-option-label">' + this.translate(suggestedValues[i].label) + '</div>';
                dd = dd + '</div>';
            }
            dd = dd + '</div>';
        }
        this.$suggestValues = $(dd);

        let t = '<input id="'+id+'" class="silky-option-input silky-option-text-input silky-option-value silky-control-margin-' + this.getPropertyValue('margin') + ' ' + startClass + '" style="display: inline;" type="text" spellcheck="false" value="' + this.getValueAsString() + '"';

        // this code block has been commented out because of a bug in electron 3.X that caused a crash if
        // the validation failed.
        /*let format = this.getPropertyValue('format');
        if (format.name === 'number')
            t += ' pattern="^-?[0-9]*\\.?[0-9]+$"';*/
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
            let parsed = this.parse(value);

            this.setValue(parsed.value);
            if (parsed.success === false)
                this.$input.val(this.getValueAsString());
        });

        this.$suggestValues.find('.jmv-option-text-input-suggested-option').on('mousedown', null, this,  function (event) {
            let value = $(this).data('value');
            let self = event.data;
            let parsed = self.parse(value);

            self.setValue(parsed.value);
            if (parsed.success === false)
                self.$input.val(self.getValueAsString());
        });

        let $ctrl = this.$input;
        if (suggestedValues !== null) {
            $ctrl = $('<div role="presentation"></div>');
            $ctrl.append(this.$input);
            $ctrl.append(this.$suggestValues);
            this.$fullCtrl = $ctrl;
        }

        cell = subgrid.addCell(0, 0, $ctrl);
        cell.blockInsert('left');
        cell.setAlignment('left', 'center');
        cell.setStretchFactor(this.getPropertyValue('stretchFactor'));

        if (suffix !== '') {
            startClass = suffix === '' ? '' : 'silky-option-text-end';

            this.$suffix = $('<div class="silky-option-suffix silky-control-margin-' + this.getPropertyValue('margin') + ' ' + startClass + '" style="display: inline; white-space: nowrap;" >' + _(suffix) + '</div>');
            cell = subgrid.addCell(1, 0, this.$suffix);
            cell.setAlignment('left', 'center');
        }
        
        return { height: 1, width: 1 + valueOffset };
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
        if (baseFunction) baseFunction.call(this, name);
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
