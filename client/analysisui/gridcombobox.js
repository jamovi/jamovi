'use strict';

var $ = require('jquery');
var GridOptionControl = require('./gridoptioncontrol');

var GridCombobox = function(params) {

    GridOptionControl.extendTo(this, params);

    this.registerSimpleProperty("options", []);

    this.$label = null;

    this.onRenderToGrid = function(grid, row, column) {

        var id = this.option.getName();
        var label = this.getPropertyValue('label');
        if (label === null)
            label = this.getPropertyValue('name');

        var columnUsed = 0;
        var cell = null;
        if (label !== "") {
            this.$label = $('<div class="silky-option-combo-label silky-control-margin-' + this.getPropertyValue("margin") + '" style="display: inline; white-space: nowrap;" >' + label + '</div>');
            cell = grid.addCell(column, row, true, this.$label);
            cell.setAlignment("left", "centre");
            columnUsed += 1;
        }

        var options = this.getPropertyValue('options');

        var t = '<select class="silky-option-input silky-option-combo-input silky-control-margin-' + this.getPropertyValue("margin") + '">';
        for (var i = 0; i < options.length; i++)
            t += '<option>' + options[i].label + '</option>';
        t += '</select>';

        var self = this;
        this.$input = $(t);
        this.updateDisplayValue();
        this.$input.change(function(event) {
            var select = self.$input[0];
            var option = options[select.selectedIndex];
            var value = option.value;
            self.option.setValue(value);
        });

        cell = grid.addCell(column + columnUsed, row, true, this.$input);
        cell.setAlignment("left", "centre");

        columnUsed += 1;

        return { height: 1, width: columnUsed };
    };

    this.onOptionValueChanged = function(keys, data) {
        this.updateDisplayValue();
    };

    this.updateDisplayValue = function() {
        var select = this.$input[0];
        var value = this.option.getValue();
        var options = this.getPropertyValue('options');
        var index = -1;
        for (var i = 0; i < options.length; i++) {
            if (options[i].value === value) {
                index = i;
                break;
            }
        }
        if (index !== -1)
            select.selectedIndex = index;
    };

    this.onPropertyChanged = function(name) {
        if (name === 'disabled') {
            var disabled = this.getPropertyValue(name);
            this.$input.prop('disabled', disabled);
            if (this.$label !== null) {
                if (disabled)
                    this.$label.addClass("disabled-text");
                else
                    this.$label.removeClass("disabled-text");
            }
        }
    };
};

module.exports = GridCombobox;
