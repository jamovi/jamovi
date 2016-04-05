'use strict';

var $ = require('jquery');
var _ = require('underscore');
var GridOptionControl = require('./gridoptioncontrol');

var GridCheckbox = function(option, params) {

    GridOptionControl.extend(this, option, params);

    var id = this.option.getName();
    var type = "checkbox";

    var value = this.option.getValue();
    this.$el = $('<label class="silky-option-checkbox" style="white-space: nowrap;"><input id="' + id + '" class="silky-option-input" type="checkbox" value="value" ' +  (value ? 'checked' : '') + ' ><span>' + this.option.getText() + '</span></label>');

    var self = this;
    this.$input = this.$el.find('input');
    this.$input.change(function(event) {
        var value = self.$input[0].checked;
        self.option.setValue(value);
    });

    this.onRender = function(grid, row, column) {
        var cell = grid.addCell(column, row, true, this.$el);
        cell.setAlignment("left", "centre");

        return { height: 1, width: 1 };
    };

    this.onOptionValueChanged = function(keys, data) {
        this.$input.prop('checked', this.option.getValue(keys));
    };
};

module.exports = GridCheckbox;
