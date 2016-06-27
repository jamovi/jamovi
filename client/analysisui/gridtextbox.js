'use strict';

var $ = require('jquery');
var LayoutGrid = require('./layoutgrid').Grid;
var GridOptionControl = require('./gridoptioncontrol');

var GridTextbox = function(params) {

    this.parse = function(value) {

        return this.getPropertyValue("format").parse(value);

    };

    GridOptionControl.extend(this, params);
    this.registerSimpleProperty("format", null);
    this.registerSimpleProperty("suffix", null);
    this.registerSimpleProperty("inputPattern", null);

    this.$suffix = null;
    this.$label = null;

    this.onRenderToGrid = function(grid, row, column) {

        var id = this.option.getName();
        var label = this.getPropertyValue('label');
        if (label === null)
            label = this.getPropertyValue('name');

        var columnUsed = 0;
        var cell = null;
        if (label !== "") {
            this.$label = $('<div class="silky-option-text-label" style="display: inline; white-space: nowrap;" >' + label + '</div>');
            cell = grid.addCell(column, row, true, this.$label);
            cell.setAlignment("left", "centre");
            columnUsed += 1;
        }

        var suffix = this.getPropertyValue('suffix');
        if (suffix !== null) {
            var subgrid = new LayoutGrid();
            subgrid.$el.addClass("silky-layout-grid");
            grid.addLayout(column + 1, row, true, subgrid);
            grid = subgrid;
        }

        var t = '<input id="' + id + '" class="silky-option-input silky-option-value silky-option-short-text" style="display: inline;" type="text" value="' + this.option.getValueAsString() + '"';
        var inputPattern = this.getPropertyValue("inputPattern");
        if (inputPattern !== null)
            t += ' pattern="'+ inputPattern +'"';
        t += '>';

        var self = this;
        this.$input = $(t);
        this.$input.change(function(event) {

            if (self.$input[0].validity.valid === false)
                self.$input.addClass("silky-options-option-invalid");
            else
                self.$input.removeClass("silky-options-option-invalid");

            var value = self.$input.val();
            value = self.parse(value);
            self.option.setValue(value);
        });

        cell = grid.addCell((suffix !== null ? 0 : column + 1), row, true, this.$input);
        cell.setAlignment("left", "centre");

        if (suffix !== null) {
            this.$suffix = $('<div class="silky-option-suffix" style="display: inline; white-space: nowrap;" >' + suffix + '</div>');
            cell = grid.addCell(1, row, true, this.$suffix);
            cell.setAlignment("left", "centre");
        }

        columnUsed += 1;


        return { height: 1, width: columnUsed };
    };

    this.onOptionValueChanged = function(keys, data) {
        this.$input.val(this.option.getValueAsString());
    };

    this.onPropertyChanged = function(name) {
        if (name === 'disabled') {
            var disabled = this.getPropertyValue(name);
            this.$input.prop('disabled', disabled);
            if (disabled) {
                if (this.$label !== null)
                    this.$label.addClass("disabled-text");
                if (this.$suffix !== null)
                    this.$suffix.addClass("disabled-text");
            }
            else {
                if (this.$label !== null)
                    this.$label.removeClass("disabled-text");
                if (this.$suffix !== null)
                    this.$suffix.removeClass("disabled-text");
            }
        }
    };
};

module.exports = GridTextbox;
