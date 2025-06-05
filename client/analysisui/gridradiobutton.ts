'use strict';

import { TitledOptionControl } from './optioncontrol';
import createChildLayoutSupport from './childlayoutsupport';
const focusLoop = require('../common/focusloop');
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export class GridRadioButton extends TitledOptionControl {
    checkedValue: boolean;
    otherValue: any;
    //_subel: HTMLElement;
    input: HTMLInputElement;
    label: HTMLElement;

    static create(params) {
        let classes = createChildLayoutSupport(params, GridRadioButton);
        return new classes(params);
    }

    constructor(params) {
        super(params);
    
        this._subel = HTML.parse('<div role="presentation" class="silky-option-radio silky-control-margin-' + this.getPropertyValue("margin") + '" style="white-space: nowrap;"><label></label></div>');
        if (this.el === undefined)
            this.el = this._subel;
    }

    onPropertyChanged(name) {
        super.onPropertyChanged(name);
        if (name === 'enable') {
            let disabled = this.getPropertyValue(name) === false;
            let input = this._subel.querySelector('input')
            input.disabled = disabled;
            if (disabled)
                this._subel.classList.add('disabled-text');
            else
                this._subel.classList.remove('disabled-text');
        }
    }

    getValue(keys=null) {
        return super.getValue(keys) === this.checkedValue;
    }

    setValue(value, keys=[]) {
        return super.setValue(value ? this.checkedValue : this.otherValue, keys);
    }

    createItem() {
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

        this.labelId = focusLoop.getNextAriaElementId('label');
        let radioButton = HTML.parse(`<label id="${this.labelId}" style="white-space: nowrap;"></label>`);
        this.input = HTML.parse('<input id="' + name + '" class="silky-option-input" type="radio" name="' + name + '" value="value" ' +  ((this.checkedValue === optionValue) ? 'checked' : '') + ' >');
        this.label = HTML.parse('<span>' + label + '</span>');
        radioButton.append(this.input);
        radioButton.append(this.label);
        this._subel.append(radioButton);

        this.input.addEventListener('change', (event) => {
            let checked = this.input.checked;
            if (checked)
                this.setSourceValue(this.checkedValue);
        });
    }

    onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        if (this.input)
            this.input.checked = this.getValue();
    }
}

export default GridRadioButton;
