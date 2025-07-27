'use strict';

import $ from 'jquery';  // for backwards compatibility

import LayoutGrid from './layoutgrid';
import OptionControl, { GridOptionControlProperties } from './optioncontrol';
import { FormatDef, StringFormat } from './formatdef';
import EnumPropertyFilter from './enumpropertyfilter';
import focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { VerticalAlignment } from './layoutcell';
import { HorizontalAlignment } from './gridcontrol';

enum Size {
    Small = 'small',
    Normal = 'normal',
    Large = 'large',
    Largest = 'largest'
}

export type GridTextboxProperties = GridOptionControlProperties<any> & {
    format: StringFormat;
    suffix: string;
    borderless: boolean;
    alignText: HorizontalAlignment;
    width: Size;
    suggestedValues: any;
}

export class GridTextbox extends OptionControl<GridTextboxProperties> {

    label: HTMLElement;
    input: HTMLInputElement;
    suffix: HTMLElement;
    suggestValues: HTMLElement;
    fullCtrl: HTMLElement;
    valueId: string;

    /**
     * @deprecated Should not be used. Rather use `(property) Control.label: HTMLElement`.
     */
    $label: any;

    /**
     * @deprecated Should not be used. Rather use `(property) Control.input: HTMLElement`.
     */
    $input: any;

    /**
     * @deprecated Should not be used. Rather use `(property) Control.suffix: HTMLElement`.
     */
    $suffix: any;

    /**
     * @deprecated Should not be used. Rather use `(property) Control.suggestValues: HTMLElement`.
     */
    $suggestValues: any;

    /**
     * @deprecated Should not be used. Rather use `(property) Control.fullCtrl: HTMLElement`.
     */
    $fullCtrl: any;

    constructor(params: GridTextboxProperties) {
        super(params);

        this.suffix = null;
        this.$suffix = null;
        this.label = null;
        this.$label = null;
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.string);
        this.registerSimpleProperty('suffix', null);
        this.registerSimpleProperty('borderless', false);
        this.registerSimpleProperty('alignText', HorizontalAlignment.Left, new EnumPropertyFilter(HorizontalAlignment, HorizontalAlignment.Left));
        this.registerSimpleProperty('width', Size.Normal, new EnumPropertyFilter(Size, Size.Normal));
        this.registerSimpleProperty('suggestedValues', null);
    }

    override onPropertyChanged<K extends keyof GridTextboxProperties>(name: K) {
        super.onPropertyChanged(name);
        if (name === 'enable') {
            let disabled = this.getPropertyValue(name) === false;
            this.input.disabled = disabled;
            if (disabled) {
                if (this.label !== null)
                    this.label.classList.add('disabled-text');
                if (this.suffix !== null)
                    this.suffix.classList.add('disabled-text');
            }
            else {
                if (this.label !== null)
                    this.label.classList.remove('disabled-text');
                if (this.suffix !== null)
                    this.suffix.classList.remove('disabled-text');
            }
        }
    }

    parse(value) {
        let format = this.getPropertyValue('format');
        let raw = format.parse(value);
        if (format.isValid(raw))
            return { success: true, value: raw };

        let defaultValue = this.getPropertyValue('defaultValue');
        if (format.isValid(defaultValue))
            return { success: false, value:defaultValue };

        return { success: true, value: raw };
    }

    override onRenderToGrid(grid: LayoutGrid, row: number, column: number, owner) {
        let label = this.getPropertyValue('label');
        if (label === null)
            label = '';

        label = this.translate(label);
        
        let id = focusLoop.getNextAriaElementId('ctrl');
        this.valueId = id

        let cell = null;
        let valueOffset = 0;
        let startClass = label === '' ? '' : 'silky-option-text-start';
        if (label !== '') {
            this.labelId = focusLoop.getNextAriaElementId('label');
            this.label = HTML.parse(`<label id="${this.labelId}" for="${id}" class="silky-option-text-label silky-control-margin-${this.getPropertyValue('margin')} ${startClass}" style="display: inline; white-space: nowrap;" >${label}</label>`);
            this.$label = $(this.label);
            cell = grid.addCell(column, row, this.label);
            cell.blockInsert('right');
            cell.setAlignment('left', 'center');
            valueOffset += 1;
        }


        let suffix = this.getPropertyValue('suffix');
        if (suffix === null)
            suffix = '';
        
        suffix = suffix.trim();

        let subgrid = new LayoutGrid();
        subgrid.style.columnGap = '1ex';
        subgrid.classList.add('silky-layout-grid');
        let spans = { rows: 1, columns: 1 };
        let vAlign: VerticalAlignment = 'top';
        if (valueOffset === 0 && this.isPropertyDefined('cell')) {
            spans = { rows: 1, columns: 2 };
            vAlign = 'center';
        }

        cell = grid.addCell(column + valueOffset, row, subgrid, { spans, vAlign });
        cell.setStretchFactor(this.getPropertyValue('stretchFactor'));
        cell.blockInsert('left');
        
        
        let dd = '';
        let suggestedValues = this.getPropertyValue('suggestedValues');
        let optionsName = suggestedValues === null ? null : this.getPropertyValue('name') + '_suggestedValues';
        if (suggestedValues !== null) {
            dd = '<div class="jmv-option-text-input-suggested silky-control-margin-' + this.getPropertyValue('margin') + ' ' + startClass + '" id="'+ optionsName + '" style="display: none;">';
            for (let i = 0; i < suggestedValues.length; i++) {
                let isObject = false;
                let value = suggestedValues[i];
                if (suggestedValues[i].value !== undefined) {
                    value = suggestedValues[i].value;
                    isObject = true;
                }
                dd = dd + '<div class="jmv-option-text-input-suggested-option" data-value="' + value + '">';
                dd = dd + '    <div class="jmv-option-text-input-suggested-option-value">' + value + '</div>';
                if (isObject && suggestedValues[i].label)
                    dd = dd + '    <div class="jmv-option-text-input-suggested-option-label">' + this.translate(suggestedValues[i].label) + '</div>';
                dd = dd + '</div>';
            }
            dd = dd + '</div>';
        }
        this.suggestValues = HTML.parse(dd);
        this.$suggestValues = $(this.suggestValues);

        let t = '<input id="'+id+'" class="silky-option-input silky-option-text-input silky-option-value silky-control-margin-' + this.getPropertyValue('margin') + ' ' + startClass + '" style="display: inline;" type="text" spellcheck="false" value="' + this.getValueAsString() + '"';

        // this code block has been commented out because of a bug in electron 3.X that caused a crash if
        // the validation failed.
        /*let format = this.getPropertyValue('format');
        if (format.name === 'number')
            t += ' pattern="^-?[0-9]*\\.?[0-9]+$"';*/
        t += '>';
        

        this.input = HTML.parse(t);
        this.$input = $(this.input);
        if (this.getPropertyValue('stretchFactor') === 0)
            this.input.classList.add('silky-option-' + this.getPropertyValue('width') + '-text');
        if (this.getPropertyValue('borderless'))
            this.input.classList.add('frameless-textbox');
        if (this.getPropertyValue('alignText') === 'center')
            this.input.classList.add('centre-text');

        this.input.addEventListener('focus', () => { this.input.select(); });
        this.input.addEventListener('keyup', (event) => {
            if (event.keyCode == 13) {
                this.input.blur();
            }
        });
        this.input.addEventListener('focus', (event) => {
            if (this.suggestValues)
                this.suggestValues.style.display = '';
            if (this.fullCtrl)
                this.fullCtrl.classList.add('float-up');
        });
        this.input.addEventListener('blur', (event) => {
            if (this.suggestValues)
                this.suggestValues.style.display = 'none';
            if (this.fullCtrl)
                this.fullCtrl.classList.remove('float-up');
        });
        this.input.addEventListener('change', (event) => {

            if (this.input.validity.valid === false)
                this.input.classList.add('silky-options-option-invalid');
            else
                this.input.classList.remove('silky-options-option-invalid');

            let value = this.input.value;
            let parsed = this.parse(value);

            this.setValue(parsed.value);
            if (parsed.success === false)
                this.input.value = this.getValueAsString();
        });

        if (this.suggestValues) {
            let suggestions = this.suggestValues.querySelectorAll<HTMLElement>('.jmv-option-text-input-suggested-option')
            suggestions.forEach((el) => {
                el.addEventListener('mousedown', (event) => {
                    let option = event.target;
                    if (option instanceof HTMLElement) {
                        let value = option.dataset.value;
                        let parsed = this.parse(value);

                        this.setValue(parsed.value);
                        if (parsed.success === false)
                            this.input.value = this.getValueAsString();
                    }
                });
            });
        }

        let $ctrl = this.input;
        if (suggestedValues !== null) {
            $ctrl = HTML.parse('<div role="presentation"></div>');
            $ctrl.append(this.input);
            $ctrl.append(this.suggestValues);
            this.fullCtrl = $ctrl;
            this.$fullCtrl = $(this.fullCtrl);
        }

        cell = subgrid.addCell(0, 0, $ctrl);
        cell.blockInsert('left');
        cell.setAlignment('left', 'center');
        cell.setStretchFactor(this.getPropertyValue('stretchFactor'));

        if (suffix !== '') {
            startClass = suffix === '' ? '' : 'silky-option-text-end';

            this.suffix = HTML.parse('<div class="silky-option-suffix silky-control-margin-' + this.getPropertyValue('margin') + ' ' + startClass + '" style="display: inline; white-space: nowrap;" >' + _(suffix) + '</div>');
            this.$suffix = $(this.suffix);
            cell = subgrid.addCell(1, 0, this.suffix);
            cell.setAlignment('left', 'center');
        }
        
        return { height: 1, width: 1 + valueOffset };
    };

    getValueAsString() {
        let value = this.getValue();
        if (value === undefined || value === null)
            return '';

        return this.getPropertyValue('format').toString(value);
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        if (this.input)
            this.input.value = this.getValueAsString();
    }
}

export default GridTextbox;
