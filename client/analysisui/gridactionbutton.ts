'use strict';

import OptionControl, { GridOptionControlProperties } from './optioncontrol';
import { BooleanFormat, FormatDef } from './formatdef';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { Control, CtrlDef } from './optionsview';


export type GridActionButtonProperties = GridOptionControlProperties<boolean> & {
    format: BooleanFormat;
    action: 'open' | 'run';
}


export class GridActionButton extends OptionControl<GridActionButtonProperties> {

    static create(params: GridActionButtonProperties, parent): Control<CtrlDef> {
        if (params.action === 'run')
            return null;
        else 
            return new GridActionButton(params, parent);
    }

    checkedValue: string;

    constructor(params: GridActionButtonProperties, parent) {
        super(params, parent);
        
        this.setRootElement(HTML.parse('<button class="jmv-action-button"></button>'));

        let horizontalAlign = this.getPropertyValue("horizontalAlignment");
        this.el.setAttribute('data-horizontal-align', horizontalAlign);
    }

    protected override registerProperties(properties: GridActionButtonProperties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.bool);
    }

    override onPropertyChanged(name) {
        super.onPropertyChanged(name);
        if (name === 'enable') {
            let enabled = this.getPropertyValue(name);
            let value = this.getValue();
            if (value || enabled === false)
                this.el.setAttribute('aria-disabled', 'true');
            else
                this.el.removeAttribute('aria-disabled');
        }
    }

    createItem() {
        this.checkedValue = this.getPropertyValue('optionPart');

        let label = this.getTranslatedProperty('label');
        if (label === null)
            label = this.getTranslatedProperty('name');

        this.el.innerText = label;

        this.el.addEventListener('click', (event) => {
            let enabled = this.getPropertyValue('enable');
            if (enabled)
                this.setValue(true);
        });
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        let value = this.getValue();
        let enabled = this.getPropertyValue('enable');
        if (value || enabled === false)
            this.el.setAttribute('aria-disabled', 'true');
        else
            this.el.removeAttribute('aria-disabled');
    }
}

export default GridActionButton;
