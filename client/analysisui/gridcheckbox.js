'use strict';

var $ = require('jquery');
var _ = require('underscore');
var GridOptionControl = require('./gridoptioncontrol');
var ChildLayoutSupport = require('./childlayoutsupport');

var GridCheckbox = function(params) {

    GridOptionControl.extendTo(this, params);

    this.registerSimpleProperty("checkedValue", null);

    this.onRenderToGrid = function(grid, row, column) {
        var id = this.option.getName();
        var type = "checkbox";
        this.checkedValue = this.getPropertyValue('checkedValue');

        var value = this.option.getValue();
        var label = this.getPropertyValue('label');
        if (label === null)
            label = this.getPropertyValue('name');

        if (this.checkedValue !== null) {
            if (Array.isArray(value) === false)
                value = false;
            else {
                for (let i = 0; i < value.length; i++) {
                    if (value[i] === this.checkedValue) {
                        value = true;
                        break;
                    }
                }
                if (value !== true)
                    value = false;
            }
        }


        this.$el = $('<label class="silky-option-checkbox silky-control-margin-' + this.getPropertyValue("margin") + '" style="white-space: nowrap;"><input id="' + id + '" class="silky-option-input" type="checkbox" value="value" ' +  (value ? 'checked' : '') + ' ><span>' + label + '</span></label>');

        var self = this;
        this.$input = this.$el.find('input');
        this.$input.change(function(event) {
            var value = self.$input[0].checked;
            self.setValue(value);
        });

        var cell = grid.addCell(column, row, true, this.$el);
        cell.setAlignment("left", "center");

        return { height: 1, width: 1, cell: cell };
    };

    this.onOptionValueChanged = function(keys, data) {
        this.$input.prop('checked', this.getValue(keys));
    };

    this.onPropertyChanged = function(name) {
        if (name === 'enableOn') {
            var enabled = this.getPropertyValue(name);
            this.$el.find('input').prop('disabled', enabled === false);
            if (enabled)
                this.$el.removeClass("disabled-text");
            else
                this.$el.addClass("disabled-text");
        }
    };

    this._override('getValue', (baseFunction, keys) => {
        if (this.checkedValue === null)
            return baseFunction.call(this, keys);

        let value = baseFunction.call(this, []);
        if (value === null)
            return false;

        if (Array.isArray(value) === false)
            return false;

        for (let i = 0; i < value.length; i++) {
            if (value[i] === this.checkedValue)
                return true;
        }

        return false;
    });

    this._override('setValue', (baseFunction, value, keys) => {
        if (this.checkedValue === null)
            return baseFunction.call(this, value, keys);

        let list = this.option.getValue();
        if (list === null || Array.isArray(list) === false)
            list = [];
        else
            list = list.slice(0);

        if (value === false) {
            for (let i = 0; i < list.length; i++) {
                if (list[i] === this.checkedValue) {
                    list.splice(i, 1);
                    break;
                }
            }
        }
        else {
            let found = false;
            for (let i = 0; i < list.length; i++) {
                if (list[i] === this.checkedValue) {
                    found = true;
                    break;
                }
            }
            if (found === false)
                list.push(this.checkedValue);
        }

        return baseFunction.call(this, list);
    });

    ChildLayoutSupport.extendTo(this);
};

module.exports = GridCheckbox;
