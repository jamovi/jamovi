'use strict';

import type LayoutGrid from './layoutgrid';
import { TitledOptionControl } from './optioncontrol';
import { FormatDef } from './formatdef';
const _focusLoop = require('../common/focusloop');
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { VerticalAlignment } from './layoutcell';

export class GridCombobox extends TitledOptionControl {
    $label: HTMLElement;
    $input: HTMLSelectElement;
    
    constructor(params) {
        super(params);

        this.$label = null;
    }

    protected registerProperties(properties) {
        super.registerProperties(properties);

        this.registerOptionProperty('options');
        this.registerSimpleProperty('format', FormatDef.string);
    }

    onPropertyChanged(name) {
        super.onPropertyChanged(name);

        if (name === 'options') {
            this.updateOptionsList();
        }
        else if (name === 'enable') {
            let enabled = this.getPropertyValue(name);
            this.$input.disabled = enabled === false;
            if (this.$label !== null) {
                if (enabled)
                    this.$label.classList.remove('disabled-text');
                else
                    this.$label.classList.add('disabled-text');
            }
        }
    }

    getOptionsProperty() {
        let options = this.getPropertyValue('options');
        if (options === null)
            options = [];

        if (options.length > 0) {
            if (typeof options[0] === 'string') {
                let newOptions = [];
                for (let i = 0; i < options.length; i++)
                    newOptions[i] = { title: this.translate(options[i]), name: options[i] };
                this.setPropertyValue('options', newOptions);
                options = newOptions;
            }
        }

        return options;
    }

    override onRenderToGrid(grid: LayoutGrid, row, column, owner) {

        let label = this.getPropertyValue('label');
        if (label === null)
            label = '';

        label = this.translate(label);
        let id = _focusLoop.getNextAriaElementId('ctrl');

        let columnUsed = 0;
        let cell = null;
        if (label !== "") {
            this.$label = HTML.parse(`<label for="${id}" class="silky-option-combo-label silky-control-margin-${this.getPropertyValue("margin")}" style="display: inline; white-space: nowrap;" >${label}</label>`);
            cell = grid.addCell(column, row, this.$label);
            cell.setAlignment("left", "center");
            columnUsed += 1;
        }

        let options = this.getOptionsProperty();

        let t = `<select id="${id}" class="silky-option-input silky-option-combo-input silky-control-margin-${this.getPropertyValue("margin")}">`;
        for (let i = 0; i < options.length; i++)
            t += '<option>' + this.translate(options[i].title) + '</option>';
        t += '</select>';

        this.$input = HTML.parse(t);
        this.updateDisplayValue();
        this.$input.addEventListener('change', (event) => {
            let opts = this.getOptionsProperty();
            let select = this.$input;
            let option = opts[select.selectedIndex];
            let value = option.name;
            this.setValue(value);
        });

        let spans = { rows: 1, columns: 1 };
        let vAlign: VerticalAlignment = 'top';
        if (columnUsed === 0 && this.isPropertyDefined('cell')) {
            spans = { rows: 1, columns: 2 };
            vAlign = 'center';
        }
        
        cell = grid.addCell(column + columnUsed, row, this.$input, { spans, vAlign });
        cell.setAlignment("left", "center");

        columnUsed += 1;

        return { height: 1, width: columnUsed };
    }

    onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        if (this.$input)
            this.updateDisplayValue();
    }

    updateDisplayValue() {
        let select = this.$input;
        let value = this.getSourceValue();
        let options = this.getOptionsProperty();
        let index = -1;
        for (let i = 0; i < options.length; i++) {
            if (options[i].name === value) {
                index = i;
                break;
            }
        }
        if (index !== -1)
            select.selectedIndex = index;
    }

    updateOptionsList() {
        if ( ! this.$input) 
            return;

        let options = this.getOptionsProperty();

        let html = '';
        for (let i = 0; i < options.length; i++)
            html += '<option>' + this.translate(options[i].title) + '</option>';

        this.$input.innerHTML = html;

        this.updateDisplayValue();
    }
}

export default GridCombobox;
