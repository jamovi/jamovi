'use strict';

import OptionControl from './optioncontrol';
import GridControl from './gridcontrol';
import { FormatDef } from './formatdef';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export class GridActionButton extends OptionControl(GridControl) {
    checkedValue: boolean;

    constructor(params) {
        super(params);
        
        this.el = HTML.parse('<button class="jmv-action-button"></button>');

        let horizontalAlign = this.getPropertyValue("horizontalAlignment");
        this.el.setAttribute('data-horizontal-align', horizontalAlign);
    }

    protected registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.bool);
    }

    onPropertyChanged(name) {
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
        let type = "checkbox";
        this.checkedValue = this.getPropertyValue('optionPart');

        let value = this.getSourceValue();
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

    onOptionValueChanged(key, data) {
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
