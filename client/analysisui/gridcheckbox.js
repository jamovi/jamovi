'use strict';

var $ = require('jquery');
var _ = require('underscore');
var GridOptionControl = require('./gridoptioncontrol');

var GridCheckbox = function(params) {

    GridOptionControl.extend(this, params);

    this.onRenderToGrid = function(grid, row, column) {
        var id = this.option.getName();
        var type = "checkbox";

        var value = this.option.getValue();
        var label = this.getPropertyValue('label');
        if (label === null)
            label = this.getPropertyValue('name');

        this.$el = $('<label class="silky-option-checkbox" style="white-space: nowrap;"><input id="' + id + '" class="silky-option-input" type="checkbox" value="value" ' +  (value ? 'checked' : '') + ' ><span>' + label + '</span></label>');

        var self = this;
        this.$input = this.$el.find('input');
        this.$input.change(function(event) {
            var value = self.$input[0].checked;
            self.option.setValue(value);
        });

        var cell = grid.addCell(column, row, true, this.$el);
        cell.setAlignment("left", "centre");

        return { height: 1, width: 1 };
    };

    this.onOptionValueChanged = function(keys, data) {
        this.$input.prop('checked', this.option.getValue(keys));
    };

    this.onPropertyChanged = function(name) {
        if (name === 'disabled') {
            var disabled = this.getPropertyValue(name);
            this.$el.find('input').prop('disabled', disabled);
            if (disabled)
                this.$el.addClass("disabled-text");
            else
                this.$el.removeClass("disabled-text");
        }
    };
};

module.exports = GridCheckbox;
