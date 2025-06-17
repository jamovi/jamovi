'use strict';

import { TitledOptionControl } from './optioncontrol';
import createChildLayoutSupport from './childlayoutsupport';
import { FormatDef } from './formatdef';
const Icons = require('./iconsupport');
import focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';


export class GridCheckbox extends TitledOptionControl  {
    input: HTMLInputElement;
    label: HTMLElement;
    icons: HTMLElement;
    checkedValue: string;

    static create(params) {
        let classes = createChildLayoutSupport(params, GridCheckbox);
        return new classes(params);
    }

    constructor(params) {
        super(params);

        Icons.addSupport(this);
    
        this._subel = HTML.parse('<div role="presentation" class="silky-option-checkbox silky-control-margin-' + this.getPropertyValue("margin") + '" style="white-space: nowrap;"></div>');
    
        if (this.el === undefined)
            this.el = this._subel;
    
        let horizontalAlign = this.getPropertyValue("horizontalAlignment");
        this._subel.setAttribute('data-horizontal-align', horizontalAlign);
    }

    protected registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.bool);
    }

    onPropertyChanged(name) {
        super.onPropertyChanged(name);
        if (name === 'enable') {
            let enabled = this.getPropertyValue(name);
            let input = this._subel.querySelector<HTMLInputElement>('input');
            input.disabled = enabled === false;
            if (enabled)
                this._subel.classList.remove('disabled-text');
            else
                this._subel.classList.add('disabled-text');
        }
    }

    getValue(keys=null) {
        if (this.checkedValue === null)
            return super.getValue(keys);

        let value = super.getValue([]);
        if (value === null)
            return false;

        if (Array.isArray(value) === false)
            return false;

        for (let i = 0; i < value.length; i++) {
            if (value[i] === this.checkedValue)
                return true;
        }

        return false;
    }

    setValue(value, keys=[]) {
        if (this.checkedValue === null)
            return super.setValue(value, keys);

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

        return super.setValue(list);
    }

    createItem() {
        let type = "checkbox";
        this.checkedValue = this.getPropertyValue('optionPart');

        let value = this.getSourceValue();
        let label = this.getTranslatedProperty('label');
        if (label === null)
            label = this.getTranslatedProperty('name');

        this.labelId = focusLoop.getNextAriaElementId('label');
        let checkbox = HTML.parse(`<label id="${this.labelId}" style="white-space: nowrap;"></label>`);
        this.input = HTML.parse('<input class="silky-option-input" tabindex="0" type="checkbox" value="value" ' +  (value ? 'checked' : '') + ' >');
        this.label = HTML.parse('<span>' + label + '</span>');
        checkbox.append(this.input);
        checkbox.append(this.label);
        this._subel.append(checkbox);

        if (Icons.exists(this)) {
            this.icons = Icons.get(this);
            let iconPosition = Icons.position(this);
            if (iconPosition === 'right')
                this._subel.append(this.icons);
            else
                this._subel.prepend(this.icons);
        }

        this.input.addEventListener('click', (event) => {
            let enabled = this.getPropertyValue('enable');
            if ( ! enabled) {
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
        });

        this.input.addEventListener('change', (event) => {
            let value = this.input.checked;
            this.setValue(value);
        });
    }

    onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        if (this.input)
            this.input.checked = this.getValue();
    }
}

export default GridCheckbox;
