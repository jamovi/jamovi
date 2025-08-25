'use strict';

import createChildLayoutSupport from './childlayoutsupport';
import { FormatDef, OutputFormat } from './formatdef';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import OptionControl, { GridOptionControlProperties } from './optioncontrol';

export type OutputControlProperties = GridOptionControlProperties<{value:boolean, vars: string[]}> & {
    format: OutputFormat;
}

export class OutputControl extends OptionControl<OutputControlProperties> {

    input: HTMLInputElement;
    label: HTMLElement;
    data: {value:boolean, vars: string[]};

    static create(params: OutputControlProperties, parent) {
        let classes = createChildLayoutSupport(params, OutputControl);
        return new classes(params, parent);
    }

    constructor(params: OutputControlProperties, parent) {
        super(params, parent);

        this._subel = HTML.parse('<div class="silky-option-checkbox silky-control-margin-' + this.getPropertyValue("margin") + '" style="white-space: nowrap;"></div>');

        if (this.el === undefined)
            this.setRootElement(this._subel);

        let horizontalAlign = this.getPropertyValue("horizontalAlignment");
        this._subel.setAttribute('data-horizontal-align', horizontalAlign);
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.output);
    }

    override onPropertyChanged<K extends keyof OutputControlProperties>(name: K) {
        super.onPropertyChanged(name);
        if (name === 'enable') {
            let enabled = this.getPropertyValue(name);
            let input = this._subel.querySelector('input')
            input.disabled = enabled === false;
            if (enabled)
                this._subel.classList.remove('disabled-text');
            else
                this._subel.classList.add('disabled-text');
        }
    }

    createItem() {
        this.data = this.getSourceValue();
        if (this.data === null)
            this.data = { value: false, vars: [] };

        let value = this.data.value;

        let label = this.getPropertyValue('label');
        if (label === null)
            label = this.getPropertyValue('name');

        label = this.translate(label);

        let checkbox = HTML.parse('<label style="white-space: nowrap;"></label>');
        this.input = HTML.parse('<input class="silky-option-input" type="checkbox" value="value" ' +  (value ? 'checked' : '') + ' >');
        this.label = HTML.parse('<span>' + label + '</span>');
        checkbox.append(this.input);
        checkbox.append(this.label);
        this._subel.append(checkbox);

        this.input.addEventListener('change', (event) => {
            if ( ! this.data) {
                this.data = this.getValue();
                if (this.data === null)
                    this.data = { value: false, vars: [] };
            }
            else
                this.data = { value: this.data.value, vars: this.data.vars };

            this.data.value = this.input.checked;
            this.setValue(this.data);
        });
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);

        this.data = this.getValue();
        if (this.data === null)
            this.data = { value: false, vars: [] };
        if (this.input)
            this.input.checked = this.data.value;
    }
}

export default OutputControl;
