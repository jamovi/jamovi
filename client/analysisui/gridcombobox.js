'use strict';

var $ = require('jquery');
var LayoutGrid = require('./layoutgrid').Grid;
var GridOptionControl = require('./gridoptioncontrol');

var GridCombobox = function(option, params) {

    GridOptionControl.extend(this, option, params);

    this.onRender = function(grid, row, column) {

        var id = this.option.getName();
        var label = this.getParam('label');
        if (label === null)
            label = this.getParam('name');

        var columnUsed = 0;
        var cell = null;
        if (label !== "") {
            cell = grid.addCell(column, row, true, $('<div class="silky-option-text-label" style="display: inline; white-space: nowrap;" >' + label + '</div>'));
            cell.setAlignment("left", "centre");
            columnUsed += 1;
        }

        var options = this.getParam('options');

        var t = '<select class="silky-option-input">';
        for (var i = 0; i < options.length; i++)
            t += '<option>' + options[i].label + '</option>';
        t += '</select>';

        var self = this;
        this.$input = $(t);
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
        var select = this.$input[0];
        var value = this.option.getValue();
        var options = this.getParam('options');
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
};

module.exports = GridCombobox;
