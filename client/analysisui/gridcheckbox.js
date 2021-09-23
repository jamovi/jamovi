'use strict';

const $ = require('jquery');
const OptionControl = require('./optioncontrol');
const TitledGridControl = require('./titledgridcontrol');
const ChildLayoutSupport = require('./childlayoutsupport');
const FormatDef = require('./formatdef');
const Icons = require('./iconsupport');

const GridCheckbox = function(params) {

    OptionControl.extendTo(this, params);
    TitledGridControl.extendTo(this, params);

    this.registerSimpleProperty("format", FormatDef.bool);
    Icons.addSupport(this);

    this.$_subel = $('<div class="silky-option-checkbox silky-control-margin-' + this.getPropertyValue("margin") + '" style="white-space: nowrap;"></div>');

    this.$el = this.$_subel;

    let horizontalAlign = this.getPropertyValue("horizontalAlignment");
    this.$_subel.attr('data-horizontal-align', horizontalAlign);

    this.createItem = function() {
        let type = "checkbox";
        this.checkedValue = this.getPropertyValue('optionPart');

        let value = this.getSourceValue();
        let label = this.getTranslatedProperty('label');
        if (label === null)
            label = this.getTranslatedProperty('name');

        let $checkbox = $('<label style="white-space: nowrap;"></label>');
        this.$input = $('<input class="silky-option-input" type="checkbox" value="value" ' +  (value ? 'checked' : '') + ' >');
        this.$label = $('<span>' + label + '</span>');
        $checkbox.append(this.$input);
        $checkbox.append(this.$label);
        this.$_subel.append($checkbox);

        if (Icons.exists(this)) {
            this.$icons = Icons.get(this);
            let iconPosition = Icons.position(this);
            if (iconPosition === 'right')
                this.$_subel.append(this.$icons);
            else
                this.$_subel.prepend(this.$icons);
        }

        this.$input.change((event) => {
            let value = this.$input[0].checked;
            this.setValue(value);
        });
    };

    this.onOptionValueChanged = function(key, data) {
        if (this.$input)
            this.$input.prop('checked', this.getValue());
    };

    this._override('onPropertyChanged', (baseFunction, name) => {
        if (baseFunction !== null)
            baseFunction.call(this, name);
        if (name === 'enable') {
            let enabled = this.getPropertyValue(name);
            this.$_subel.find('input').prop('disabled', enabled === false);
            if (enabled)
                this.$_subel.removeClass('disabled-text');
            else
                this.$_subel.addClass('disabled-text');
        }
    });

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

        let list = this.getSourceValue();
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
