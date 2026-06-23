'use strict';

import $ from 'jquery';  // for backwards compatibility

import LayoutGrid from './layoutgrid';
import OptionControl, { GridOptionControlProperties } from './optioncontrol';
import { FormatDef, StringFormat } from './formatdef';
import EnumPropertyFilter from './enumpropertyfilter';
import interactionManager from '../common/interactionmanager';
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
    suggestedValues: Array<string | number | boolean | { value: string | number | boolean, label?: string }>;
}

export class GridTextbox extends OptionControl<GridTextboxProperties> {

    label: HTMLElement;
    input: HTMLInputElement;
    suffix: HTMLElement;
    suggestValues: HTMLElement;
    fullCtrl: HTMLElement;
    private activeSuggestion: number = -1;


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

    constructor(params: GridTextboxProperties, parent) {
        super(params, parent);

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

        let format = this.getPropertyValue('format');
        format.on('displayFormatChanged', () => {
            if (this.input)
                this.input.value = this.getValueAsString();
        });
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

        let id = interactionManager.nextAriaId('ctrl');
        this.valueId = id

        let cell = null;
        let valueOffset = 0;
        let startClass = label === '' ? '' : 'silky-option-text-start';
        if (label !== '') {
            this.labelId = interactionManager.nextAriaId('label');
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


        let suggestedValues = this.getPropertyValue('suggestedValues');
        let optionsName = suggestedValues === null ? null : interactionManager.nextAriaId('suggestions');
        if (suggestedValues !== null) {
            this.suggestValues = HTML.create('div', {
                class: 'jmv-option-text-input-suggested',
                id: optionsName,
                role: 'listbox',
            });
            this.suggestValues.hidden = true;

            for (let i = 0; i < suggestedValues.length; i++) {
                let suggestion = suggestedValues[i];
                let isObject = typeof suggestion === 'object' && suggestion !== null;
                let value = isObject ? suggestion.value : suggestion;
                let option = HTML.create('div', {
                    class: 'jmv-option-text-input-suggested-option',
                    id: `${optionsName}-${i}`,
                    role: 'option',
                }, HTML.create('div', { class: 'jmv-option-text-input-suggested-option-value' }, String(value)));

                if (isObject && suggestion.label)
                    option.append(HTML.create('div', { class: 'jmv-option-text-input-suggested-option-label' }, this.translate(suggestion.label)));

                option.addEventListener('mousedown', (event) => {
                    // Keep focus on the input so blur cannot hide the list before selection.
                    event.preventDefault();
                });
                option.addEventListener('click', () => {
                    this.commitSuggestion(String(value));
                });
                this.suggestValues.append(option);
            }
        }
        else {
            this.suggestValues = null;
        }
        this.$suggestValues = $(this.suggestValues);

        this.input = HTML.create('input', {
            id: id,
            class: `silky-option-input silky-option-text-input silky-option-value silky-control-margin-${this.getPropertyValue('margin')} ${startClass}`,
            style: 'display: inline;',
            type: 'text',
            spellcheck: 'false',
        });
        this.input.value = this.getValueAsString();
        this.$input = $(this.input);
        if (this.suggestValues) {
            this.input.setAttribute('role', 'combobox');
            this.input.setAttribute('aria-autocomplete', 'list');
            this.input.setAttribute('aria-controls', optionsName);
            this.input.setAttribute('aria-expanded', 'false');
        }
        if (this.getPropertyValue('stretchFactor') === 0)
            this.input.classList.add('silky-option-' + this.getPropertyValue('width') + '-text');
        if (this.getPropertyValue('borderless'))
            this.input.classList.add('frameless-textbox');
        if (this.getPropertyValue('alignText') === 'center')
            this.input.classList.add('centre-text');

        this.input.addEventListener('focus', () => {
            this.input.select();
            this.showSuggestions();
        });
        this.input.addEventListener('click', () => this.showSuggestions());
        this.input.addEventListener('blur', () => this.hideSuggestions());
        this.input.addEventListener('keydown', (event) => {
            if (! this.suggestValues) {
                if (event.key === 'Enter')
                    this.input.blur();
                return;
            }

            let count = this.suggestValues.children.length;
            if (count === 0) {
                if (event.key === 'Enter')
                    this.input.blur();
                return;
            }

            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                this.showSuggestions();
                let offset = event.key === 'ArrowDown' ? 1 : -1;
                let next = this.activeSuggestion < 0 ? (offset > 0 ? 0 : count - 1) : (this.activeSuggestion + offset + count) % count;
                this.setActiveSuggestion(next);
            }
            else if (event.key === 'Enter' && this.activeSuggestion >= 0) {
                event.preventDefault();
                let suggestion = suggestedValues[this.activeSuggestion];
                let value = typeof suggestion === 'object' && suggestion !== null ? suggestion.value : suggestion;
                this.commitSuggestion(String(value));
            }
            else if (event.key === 'Escape') {
                event.preventDefault();
                this.hideSuggestions();
            }
            else if (event.key === 'Enter') {
                this.input.blur();
            }
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

        let $ctrl = this.input;
        if (suggestedValues !== null) {
            $ctrl = HTML.parse('<div class="jmv-option-text-input-control" role="presentation"></div>');
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

    private showSuggestions() {
        if (! this.suggestValues || this.suggestValues.children.length === 0 || this.input.disabled)
            return;

        this.suggestValues.hidden = false;
        this.input.setAttribute('aria-expanded', 'true');
        if (this.fullCtrl)
            this.fullCtrl.classList.add('float-up');
    }

    private hideSuggestions() {
        if (! this.suggestValues)
            return;

        this.suggestValues.hidden = true;
        this.input.setAttribute('aria-expanded', 'false');
        this.setActiveSuggestion(-1);
        if (this.fullCtrl)
            this.fullCtrl.classList.remove('float-up');
    }

    private setActiveSuggestion(index: number) {
        if (! this.suggestValues)
            return;

        let options = this.suggestValues.querySelectorAll<HTMLElement>('[role="option"]');
        options.forEach((option, optionIndex) => {
            let active = optionIndex === index;
            option.classList.toggle('active', active);
            option.setAttribute('aria-selected', active.toString());
        });
        this.activeSuggestion = index;

        if (index >= 0) {
            this.input.setAttribute('aria-activedescendant', options[index].id);
            options[index].scrollIntoView({ block: 'nearest' });
        }
        else {
            this.input.removeAttribute('aria-activedescendant');
        }
    }

    private commitSuggestion(value: string) {
        let parsed = this.parse(value);
        this.setValue(parsed.value);
        this.input.value = this.getValueAsString();
        this.input.classList.toggle('silky-options-option-invalid', ! parsed.success);
        this.hideSuggestions();
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        if (this.input)
            this.input.value = this.getValueAsString();
    }
}

export default GridTextbox;
