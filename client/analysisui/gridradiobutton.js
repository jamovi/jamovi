'use strict';

const $ = require('jquery');
const OptionControl = require('./optioncontrol');
const TitledGridControl = require('./titledgridcontrol');
const ChildLayoutSupport = require('./childlayoutsupport');

const GridRadioButton = function(params) {

    OptionControl.extendTo(this, params);
    TitledGridControl.extendTo(this, params);

    this.$_subel = $('<div class="silky-option-radio silky-control-margin-' + this.getPropertyValue("margin") + '" style="white-space: nowrap;"><label></label></div>');
    this.$el = this.$_subel;

    this.createItem = function() {
        let optionValue = this.getSourceValue();
        this.checkedValue = this.getPropertyValue('optionPart');

        if (optionValue !== null && typeof this.checkedValue !== typeof optionValue)
            throw "The type of the checkedValue property must be the same as the option.";

        if (typeof this.checkedValue === 'string') {
            let options = this.getOption().source.params.options;
            this.otherValue = '';
            if (options !== undefined)
                this.otherValue = options[0] === this.checkedValue ? options[1] : options[0];
        }
        else if (typeof this.checkedValue === 'boolean')
            this.otherValue = !this.checkedValue;
        else if (typeof this.checkedValue === 'number')
            this.otherValue = this.checkedValue === 0 ? 1 : 0;
        else
            throw "The checkedValue property does not support '" + typeof optionValue + "' data types.";

        let label = this.getPropertyValue('label');
        let name = this.getPropertyValue('name');
        if (label === null)
            label = name;

        label = this.translate(label);

        let $radioButton = $('<label style="white-space: nowrap;"></label>');
        this.$input = $('<input id="' + name + '" class="silky-option-input" type="radio" name="' + name + '" value="value" ' +  ((this.checkedValue === optionValue) ? 'checked' : '') + ' >');
        this.$label = $('<span>' + label + '</span>');
        $radioButton.append(this.$input);
        $radioButton.append(this.$label);
        this.$_subel.append($radioButton);

        this.$input.change((event) => {
            let checked = this.$input[0].checked;
            if (checked)
                this.setSourceValue(this.checkedValue);
        });
    };

    this.onOptionValueChanged = function(key, data) {
        if (this.$input)
            this.$input.prop('checked', this.getValue());
    };

    this._override('onPropertyChanged', (baseFunction, name) => {
        baseFunction.call(this, name);
        if (name === 'enable') {
            let disabled = this.getPropertyValue(name) === false;
            this.$_subel.find('input').prop('disabled', disabled);
            if (disabled)
                this.$_subel.addClass('disabled-text');
            else
                this.$_subel.removeClass('disabled-text');
        }
    });

    this._override('getValue', (baseFunction, keys) => {
        return baseFunction.call(this, keys) === this.checkedValue;
    });

    this._override('setValue', (baseFunction, value, keys) => {
        return baseFunction.call(this, value ? this.checkedValue : this.otherValue, keys);
    });

    ChildLayoutSupport.extendTo(this);
};

module.exports = GridRadioButton;
