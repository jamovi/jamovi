'use strict';

const $ = require('jquery');
const GridOptionControl = require('./gridoptioncontrol');
const FormatDef = require('./formatdef');

const GridCombobox = function(params) {

    GridOptionControl.extendTo(this, params);

    this.registerSimpleProperty("options", []);
    this.registerSimpleProperty("format", FormatDef.string);

    this.$label = null;

    this.onRenderToGrid = function(grid, row, column) {

        let label = this.getPropertyValue('label');
        if (label === null)
            label = '';

        let columnUsed = 0;
        let cell = null;
        if (label !== "") {
            this.$label = $('<div class="silky-option-combo-label silky-control-margin-' + this.getPropertyValue("margin") + '" style="display: inline; white-space: nowrap;" >' + label + '</div>');
            cell = grid.addCell(column, row, true, this.$label);
            cell.setAlignment("left", "center");
            columnUsed += 1;
        }

        let options = this.getPropertyValue('options');

        let t = '<select class="silky-option-input silky-option-combo-input silky-control-margin-' + this.getPropertyValue("margin") + '">';
        for (let i = 0; i < options.length; i++)
            t += '<option>' + options[i].label + '</option>';
        t += '</select>';

        let self = this;
        this.$input = $(t);
        this.updateDisplayValue();
        this.$input.change(function(event) {
            let select = self.$input[0];
            let option = options[select.selectedIndex];
            let value = option.value;
            self.setValue(value);
        });

        cell = grid.addCell(column + columnUsed, row, true, this.$input);
        cell.setAlignment("left", "center");

        columnUsed += 1;

        return { height: 1, width: columnUsed };
    };

    this.onOptionValueChanged = function(key, data) {
        if (this.$label)
            this.updateDisplayValue();
    };

    this.updateDisplayValue = function() {
        let select = this.$input[0];
        let value = this.getSourceValue();
        let options = this.getPropertyValue('options');
        let index = -1;
        for (let i = 0; i < options.length; i++) {
            if (options[i].value === value) {
                index = i;
                break;
            }
        }
        if (index !== -1)
            select.selectedIndex = index;
    };

    this.onPropertyChanged = function(name) {
        if (name === 'enable') {
            let enabled = this.getPropertyValue(name);
            this.$input.prop('disabled', enabled === false);
            if (this.$label !== null) {
                if (enabled)
                    this.$label.removeClass('disabled-text');
                else
                    this.$label.addClass('disabled-text');
            }
        }
    };
};

module.exports = GridCombobox;
