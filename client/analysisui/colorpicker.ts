'use strict';

import { FormatDef, ColorFormat } from './formatdef';
import interactionManager from '../common/interactionmanager';
import { h, rich }  from '../common/htmlelementcreator';
import type LayoutGrid from './layoutgrid';
import { VerticalAlignment } from './layoutcell';
import OptionControl, { GridOptionControlProperties } from './optioncontrol';

export type ColorPickerProperties = GridOptionControlProperties<string> & {
    format: ColorFormat;
}

// a colour swatch (the browser's native colour picker) alongside the hex
// code, which can also be typed into. the value is a '#rrggbb' hex code,
// normally of a Color option (it can also be used with a String option)
export class ColorPicker extends OptionControl<ColorPickerProperties> {

    label: HTMLElement = null;
    swatch: HTMLInputElement;
    input: HTMLInputElement;

    constructor(params: ColorPickerProperties, parent) {
        super(params, parent);

        this.setRootElement(h('div'));
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.color);
    }

    override onPropertyChanged(name) {
        super.onPropertyChanged(name);

        if (name === 'enable')
            this.updateEnabled();
    }

    override onRenderToGrid(grid: LayoutGrid, row, column, owner) {

        let label = this.getTranslatedProperty('label');
        if (label === null)
            label = '';

        let columnUsed = 0;
        let cell = null;
        let id = interactionManager.nextAriaId('ctrl');
        if (label !== '') {
            this.labelId = interactionManager.nextAriaId('label');
            this.label = h('label', { id: this.labelId, for: id, class: `silky-option-text-label silky-control-margin-${this.getPropertyValue('margin')}`, style: 'display: inline; white-space: nowrap;' }, rich(label));
            cell = grid.addCell(column, row, this.label);
            cell.setAlignment('left', 'center');
            columnUsed += 1;
        }

        this.valueId = id;
        this.swatch = h('input', { id: id, type: 'color', class: 'jmv-color-picker-swatch' });
        this.input = h('input', { type: 'text', spellcheck: 'false', class: 'silky-option-input jmv-color-picker-hex', 'aria-label': s_('Hex code') });

        // the native picker fires 'input' continuously while dragging, and
        // 'change' once a colour is settled on -- only the latter commits,
        // so the analysis isn't rerun for every intermediate colour
        this.swatch.addEventListener('input', () => {
            this.input.value = this.swatch.value;
            this.input.classList.remove('silky-options-option-invalid');
        });
        this.swatch.addEventListener('change', () => {
            this.setValue(this.swatch.value);
        });

        this.input.addEventListener('focus', () => this.input.select());
        this.input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                this.input.blur();
            }
            else if (event.key === 'Escape') {
                this.update();  // discard what's been typed
                this.input.blur();
            }
        });
        this.input.addEventListener('change', () => {
            let hex = this.getPropertyValue('format').parse(this.input.value);
            if (hex === null) {
                // not a colour; put back the current value
                this.update();
                return;
            }
            this.setValue(hex);
            this.update();  // setValue() won't update if normalising produced the existing value
        });

        let body = h('div', { class: `jmv-color-picker silky-control-margin-${this.getPropertyValue('margin')}` }, this.swatch, this.input);

        let spans = { rows: 1, columns: 1 };
        let vAlign: VerticalAlignment = 'top';
        if (columnUsed === 0 && this.hasProperty('cell')) {
            spans = { rows: 1, columns: 2 };
            vAlign = 'center';
        }

        cell = grid.addCell(column + columnUsed, row, body, { spans, vAlign });
        cell.setAlignment('left', 'center');

        columnUsed += 1;

        this.update();

        return { height: 1, width: columnUsed };
    }

    updateEnabled() {
        let enabled = this.getPropertyValue('enable') !== false;
        if (this.swatch)
            this.swatch.disabled = ! enabled;
        if (this.input)
            this.input.disabled = ! enabled;
        if (this.label !== null)
            this.label.classList.toggle('disabled-text', ! enabled);
    }

    update() {
        if ( ! this.input)
            return;

        let value = this.getValue();
        if (value === null || value === undefined)
            value = '';

        this.input.value = value;
        this.input.classList.remove('silky-options-option-invalid');

        // the native picker only understands #rrggbb, so a value from a
        // String option like 'red' (which R is fine with) is shown via its
        // hex equivalent
        let hex = this.getPropertyValue('format').parse(value);
        this.swatch.value = hex === null ? '#000000' : hex;
        this.swatch.classList.toggle('empty', hex === null);

        this.updateEnabled();
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        this.update();
    }
}

export default ColorPicker;
