'use strict';

import $ from 'jquery';  // for backwards compatibility

import LayoutGrid from './layoutgrid';
import OptionControl, { GridOptionControlProperties } from './optioncontrol';
import { FormatDef, StringFormat } from './formatdef';
import EnumPropertyFilter from './enumpropertyfilter';
import interactionManager from '../common/interactionmanager';
import { attrs, h, rich }  from '../common/htmlelementcreator';
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
            this.label = h('label', { id: this.labelId, for: id, class: `silky-option-text-label silky-control-margin-${this.getPropertyValue('margin')} ${startClass}`, style: "display: inline; white-space: nowrap;" }, rich(label));
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
        let optionsName = suggestedValues === null ? null : this.getPropertyValue('name') + '_suggestedValues';
        this.suggestValues = null;
        if (suggestedValues !== null) {
            this.suggestValues = h('div', attrs({
                class: `jmv-option-text-input-suggested silky-control-margin-${this.getPropertyValue('margin')} ${startClass}`,
                id: optionsName as string,
                role: 'listbox',
            }));
            this.suggestValues.style.display = 'none';

            for (let i = 0; i < suggestedValues.length; i++) {
                let isObject = false;
                let value = suggestedValues[i];
                if (suggestedValues[i].value !== undefined) {
                    value = suggestedValues[i].value;
                    isObject = true;
                }

                let valueText = String(value);
                let option = h('div', attrs({ id: `${optionsName}_${i}`, class: 'jmv-option-text-input-suggested-option', 'data-value': valueText, role: 'option' }),
                    h('div', { class: 'jmv-option-text-input-suggested-option-value' }, valueText));
                if (isObject && suggestedValues[i].label)
                    option.append(h('div', { class: 'jmv-option-text-input-suggested-option-label' }, this.translate(suggestedValues[i].label)));
                this.suggestValues.append(option);
            }
        }
        this.$suggestValues = $(this.suggestValues);

        this.input = h('input', { id: id, class: `silky-option-input silky-option-text-input silky-option-value silky-control-margin-${this.getPropertyValue('margin')} ${startClass}`, style: "display: inline;", type: "text", spellcheck: "false", value: this.getValueAsString(), role: suggestedValues === null ? undefined : 'combobox', 'aria-expanded': suggestedValues === null ? undefined : 'false', 'aria-controls': suggestedValues === null ? undefined : optionsName as string, 'aria-autocomplete': suggestedValues === null ? undefined : 'list' });


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

        let suggestions: HTMLElement[] = [];
        let selectedSuggestion = -1;

        let setSelectedSuggestion = (index: number) => {
            if (suggestions.length === 0)
                return;

            if (selectedSuggestion >= 0) {
                suggestions[selectedSuggestion].classList.remove('selected');
                suggestions[selectedSuggestion].setAttribute('aria-selected', 'false');
            }

            selectedSuggestion = index;

            if (selectedSuggestion >= 0) {
                let suggestion = suggestions[selectedSuggestion];
                suggestion.classList.add('selected');
                suggestion.setAttribute('aria-selected', 'true');
                this.input.setAttribute('aria-activedescendant', suggestion.id);
                suggestion.scrollIntoView({ block: 'nearest' });
            }
            else
                this.input.removeAttribute('aria-activedescendant');
        };

        let showSuggestions = () => {
            if (this.suggestValues === null)
                return;
            this.suggestValues.style.display = '';
            this.input.setAttribute('aria-expanded', 'true');
            if (this.fullCtrl)
                this.fullCtrl.classList.add('float-up');
        };

        let hideSuggestions = () => {
            if (this.suggestValues === null)
                return;
            this.suggestValues.style.display = 'none';
            this.input.setAttribute('aria-expanded', 'false');
            if (this.fullCtrl)
                this.fullCtrl.classList.remove('float-up');
            setSelectedSuggestion(-1);
        };

        let commitSuggestion = (suggestion: HTMLElement) => {
            let value = suggestion.dataset.value ?? '';
            let parsed = this.parse(value);

            this.setValue(parsed.value);
            this.input.value = parsed.success === false ? this.getValueAsString() : value;
            hideSuggestions();
        };

        this.input.addEventListener('focus', () => {
            this.input.select();
            showSuggestions();
        });
        this.input.addEventListener('keydown', (event) => {
            if (suggestions.length === 0) {
                if (event.key === 'Enter')
                    this.input.blur();
                return;
            }

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                showSuggestions();
                setSelectedSuggestion(selectedSuggestion < suggestions.length - 1 ? selectedSuggestion + 1 : 0);
            }
            else if (event.key === 'ArrowUp') {
                event.preventDefault();
                showSuggestions();
                setSelectedSuggestion(selectedSuggestion > 0 ? selectedSuggestion - 1 : suggestions.length - 1);
            }
            else if (event.key === 'Enter') {
                if (selectedSuggestion >= 0) {
                    event.preventDefault();
                    commitSuggestion(suggestions[selectedSuggestion]);
                }
                else
                    this.input.blur();
            }
            else if (event.key === 'Escape') {
                event.preventDefault();
                hideSuggestions();
            }
        });
        this.input.addEventListener('blur', () => {
            hideSuggestions();
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
            suggestions = Array.from(this.suggestValues.querySelectorAll<HTMLElement>('.jmv-option-text-input-suggested-option'));
            suggestions.forEach((el) => {
                el.addEventListener('mouseenter', () => {
                    setSelectedSuggestion(suggestions.indexOf(el));
                });
                el.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    commitSuggestion(el);
                });
            });
        }

        let $ctrl = this.input;
        if (suggestedValues !== null) {
            $ctrl = h('div', { role: "presentation", class: "jmv-option-text-input-suggested-container"} );
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

            this.suffix = h('div', { class: `silky-option-suffix silky-control-margin-${this.getPropertyValue('margin')} ${startClass}`, style: "display: inline; white-space: nowrap;" }, rich(_(suffix)));
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
