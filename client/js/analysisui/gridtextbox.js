'use strict';

var $ = require('jquery');
var LayoutGrid = require('./layoutgrid').Grid;
var GridOptionControl = require('./gridoptioncontrol');

var GridTextbox = function(option, params) {

    this.parse = function(value) {

        if (this.params.format === 'number')
            return parseFloat(value);
        else
            return value;

    };

    this.parseBoolean = function(value) {
        return value == 'true';
    };

    GridOptionControl.extend(this, option, params);

    this.onRender = function(grid, row, column) {

        var id = this.option.getName();
        var label = this.option.getText();

        var columnUsed = 0;
        var cell = null;
        if (label !== "") {
            cell = grid.addCell(column, row, true, $('<div class="silky-option-text-label" style="display: inline; white-space: nowrap;" >' + label + '</div>'));
            cell.setAlignment("left", "centre");
            columnUsed += 1;
        }

        var suffix = this.option.getSuffix();
        if (suffix !== null) {
            var subgrid = new LayoutGrid({ className: "silky-layout-grid" });
            grid.addLayout("textBox_" + id, column + 1, row, true, subgrid);
            grid = subgrid;
        }

        var t = '<input id="' + id + '" class="silky-option-input silky-option-value silky-option-short-text" style="display: inline;" type="text" value="' + this.option.getValueAsString() + '"';
        if (this.params.inputPattern)
            t += ' pattern="'+ this.params.inputPattern +'"';
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
            cell = grid.addCell(1, row, true, $('<div class="silky-option-suffix" style="display: inline; white-space: nowrap;" >' + suffix + '</div>'));
            cell.setAlignment("left", "centre");
        }

        columnUsed += 1;


        return { height: 1, width: columnUsed };
    };

    this.onOptionValueChanged = function(keys, data) {
        this.$input.val(this.option.getValueAsString());
    };
};

module.exports = GridTextbox;
