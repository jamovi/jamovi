'use strict';

var $ = require('jquery');
var GridOptionControl = require('./gridoptioncontrol');

var GridRadioButton = function(option, params) {

    GridOptionControl.extend(this, option, params);

    var optionValue = this.option.getValue();
    this.checkedValue = this.getParam('value');
    var label = this.getParam('label');
    var name = this.getParam('name');
    if (label === null)
        label = name;
    this.$el = $('<label class="silky-option-radio" style="white-space: nowrap;"><input id="' + name + '" class="silky-option-input" type="radio" name="' + name + '" value="value" ' +  ((this.checkedValue === optionValue) ? 'checked' : '') + ' ><span>' + label + '</span></label>');

    var self = this;
    this.$input = this.$el.find('input');
    this.$input.change(function(event) {
        var checked = self.$input[0].checked;
        if (checked)
            self.option.setValue(self.checkedValue);
    });

    this.onRender = function(grid, row, column) {
        var cell = grid.addCell(column, row, true, this.$el);
        cell.setAlignment("left", "centre");

        return { height: 1, width: 1 };
    };

    this.onOptionValueChanged = function(keys, data) {
        var optionValue = this.option.getValue();
        this.$input.prop('checked', optionValue === this.checkedValue);
    };
};

module.exports = GridRadioButton;
