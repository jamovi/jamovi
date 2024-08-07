'use strict';

const $ = require('jquery');
const OptionControl = require('./optioncontrol');
const GridControl = require('./gridcontrol');
const FormatDef = require('./formatdef');
const Icons = require('./iconsupport');

const GridActionButton = function(params) {

    OptionControl.extendTo(this, params);
    GridControl.extendTo(this, params);

    this.registerSimpleProperty("format", FormatDef.bool);

    this.$el = $('<button class="jmv-action-button"></button>');

    let horizontalAlign = this.getPropertyValue("horizontalAlignment");
    this.$el.attr('data-horizontal-align', horizontalAlign);

    this.createItem = function() {
        let type = "checkbox";
        this.checkedValue = this.getPropertyValue('optionPart');

        let value = this.getSourceValue();
        let label = this.getTranslatedProperty('label');
        if (label === null)
            label = this.getTranslatedProperty('name');

        this.$el.text(label);

        this.$el.click((event) => {
            let enabled = this.getPropertyValue('enable');
            if (enabled)
                this.setValue(true);
        });
    };

    this.onOptionValueChanged = function (key, data) {
        let value = this.getValue();
        let enabled = this.getPropertyValue('enable');
        if (value || enabled === false)
            this.$el[0].setAttribute('aria-disabled', true);
        else
            this.$el[0].removeAttribute('aria-disabled');
    };

    this._override('onPropertyChanged', (baseFunction, name) => {
        if (baseFunction !== null)
            baseFunction.call(this, name);
        if (name === 'enable') {
            let enabled = this.getPropertyValue(name);
            let value = this.getValue();
            if (value || enabled === false)
                this.$el[0].setAttribute('aria-disabled', true);
            else
                this.$el[0].removeAttribute('aria-disabled');
        }
    });
};

module.exports = GridActionButton;
