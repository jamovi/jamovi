'use strict';

var $ = require('jquery');
var GridOptionControl = require('./gridoptioncontrol');
var Overridable = require('./overridable');
var ChildLayoutSupport = require('./childlayoutsupport');

var GridRadioButton = function(params) {

    GridOptionControl.extend(this, params);
    Overridable.extendTo(this);

    this.registerSimpleProperty("checkedValue", null);

    this.onRenderToGrid = function(grid, row, column) {

        var optionValue = this.option.getValue();
        this.checkedValue = this.getPropertyValue('checkedValue');
        var options = this.option.source.params.options;
        this.otherValue = options[0] === this.checkedValue ? options[1] : options[0];
        var label = this.getPropertyValue('label');
        var name = this.getPropertyValue('name');
        if (label === null)
            label = name;
        this.$el = $('<label class="silky-option-radio silky-control-margin-' + this.getPropertyValue("margin") + '" style="white-space: nowrap;"><input id="' + name + '" class="silky-option-input" type="radio" name="' + name + '" value="value" ' +  ((this.checkedValue === optionValue) ? 'checked' : '') + ' ><span>' + label + '</span></label>');

        var self = this;
        this.$input = this.$el.find('input');
        this.$input.change(function(event) {
            var checked = self.$input[0].checked;
            if (checked)
                self.option.setValue(self.checkedValue);
        });

        var cell = grid.addCell(column, row, true, this.$el);
        cell.setAlignment("left", "centre");

        return { height: 1, width: 1 };
    };

    this.onOptionValueChanged = function(keys, data) {
        var optionValue = this.option.getValue();
        this.$input.prop('checked', optionValue === this.checkedValue);
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

    var self = this;
    this._override('getValue', function(baseFunction, keys) {
        return baseFunction.call(self, keys) === self.checkedValue;
    });

    this._override('setValue', function(baseFunction, value, keys) {
        return baseFunction.call(self, value ? self.checkedValue : self.otherValue, keys);
    });

    ChildLayoutSupport.extend(this);
};

module.exports = GridRadioButton;
