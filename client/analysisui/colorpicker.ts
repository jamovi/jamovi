'use strict';

import { FormatDef, StringFormat } from './formatdef';
import interactionManager from '../common/interactionmanager';
import { h, rich }  from '../common/htmlelementcreator';
import type LayoutGrid from './layoutgrid';
import { VerticalAlignment } from './layoutcell';
import OptionControl, { GridOptionControlProperties } from './optioncontrol';

export type ColorPickerProperties = GridOptionControlProperties<string> & {
    format: StringFormat;
}

// a colour swatch (the browser's native colour picker) alongside the hex
// code, which can also be typed into. the value is a String option holding
// a '#rrggbb' hex code
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

        this.registerSimpleProperty('format', FormatDef.string);
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
            if (event.key === 'Enter')
                this.input.blur();
        });
        this.input.addEventListener('change', () => {
            let hex = toHex(this.input.value);
            if (hex === null) {
                this.input.classList.add('silky-options-option-invalid');
                return;
            }
            this.input.classList.remove('silky-options-option-invalid');
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

        // the native picker only understands #rrggbb, so a default like
        // 'red' (which R is fine with) is shown via its hex equivalent
        let hex = toHex(value);
        this.swatch.value = hex === null ? '#000000' : hex;
        this.swatch.classList.toggle('empty', hex === null);

        this.updateEnabled();
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        this.update();
    }
}

let context: CanvasRenderingContext2D | null = null;

// normalises any css colour (#abc, abcdef, 'steelblue', ...) to '#rrggbb', or
// null if it isn't one. colours with transparency aren't supported, as the
// native picker can't represent them
export function toHex(value: string): string | null {
    value = value.trim();
    if (value === '')
        return null;
    if (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value))
        value = '#' + value;

    if (context === null)
        context = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    let ctx = context;

    // an invalid colour leaves fillStyle unchanged, so try two different
    // starting points to tell 'invalid' apart from 'same as before'
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    let first = ctx.fillStyle as string;
    ctx.fillStyle = '#ffffff';
    ctx.fillStyle = value;
    let second = ctx.fillStyle as string;

    if (first !== second)
        return null;
    if ( ! first.startsWith('#'))  // i.e. rgba(...)
        return null;
    return first.toLowerCase();
}

export default ColorPicker;
