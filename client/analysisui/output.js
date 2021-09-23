'use strict';

const $ = require('jquery');
const OptionControl = require('./optioncontrol');
const TitledGridControl = require('./titledgridcontrol');
const ChildLayoutSupport = require('./childlayoutsupport');
const FormatDef = require('./formatdef');

const Output = function(params) {

    OptionControl.extendTo(this, params);
    TitledGridControl.extendTo(this, params);

    this.registerSimpleProperty("format", FormatDef.output);

    this.$_subel = $('<div class="silky-option-checkbox silky-control-margin-' + this.getPropertyValue("margin") + '" style="white-space: nowrap;"></div>');

    this.$el = this.$_subel;

    let horizontalAlign = this.getPropertyValue("horizontalAlignment");
    this.$_subel.attr('data-horizontal-align', horizontalAlign);

    this.createItem = function() {
        this.data = this.getSourceValue();
        if (this.data === null)
            this.data = { value: false, vars: [] };

        let value = this.data.value;

        let label = this.getPropertyValue('label');
        if (label === null)
            label = this.getPropertyValue('name');

        label = this.translate(label);

        let $checkbox = $('<label style="white-space: nowrap;"></label>');
        this.$input = $('<input class="silky-option-input" type="checkbox" value="value" ' +  (value ? 'checked' : '') + ' >');
        this.$label = $('<span>' + label + '</span>');
        $checkbox.append(this.$input);
        $checkbox.append(this.$label);
        this.$_subel.append($checkbox);

        this.$input.change((event) => {
            if ( ! this.data) {
                this.data = this.getValue();
                if (this.data === null)
                    this.data = { value: false, vars: [] };
            }
            else
                this.data = { value: this.data.value, vars: this.data.vars };

            this.data.value = this.$input[0].checked;
            this.setValue(this.data);
        });
    };

    this.onOptionValueChanged = function(key, data) {
        this.data = this.getValue();
        if (this.data === null)
            this.data = { value: false, vars: [] };
        if (this.$input)
            this.$input.prop('checked', this.data.value);
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

    ChildLayoutSupport.extendTo(this);
};

module.exports = Output;
