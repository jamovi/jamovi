'use strict';

var $ = require('jquery');
var _ = require('underscore');
var GridOptionControl = require('./gridoptioncontrol');

var GridRadioButton = function(option, params) {

    GridOptionControl.extend(this, option, params);

    var id = this.option.getName();

    var actionGroup = this.params.actiongroup;

    var value = this.option.getValue();
    var label = this.getParam('label');
    if (label === null)
        label = this.getParam('name');
    this.$el = $('<label class="silky-option-radio" style="white-space: nowrap;"><input id="' + id + '" class="silky-option-input" type="radio" name="' + actionGroup + '" value="value" ' +  (value ? 'checked' : '') + ' ><span>' + label + '</span></label>');

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

module.exports = GridRadioButton;
