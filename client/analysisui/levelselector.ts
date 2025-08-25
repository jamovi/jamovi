'use strict';

import GetRequestDataSupport, { RequestDataSupport } from './requestdatasupport';
import { FormatDef, StringFormat } from './formatdef';
import _focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import type LayoutGrid from './layoutgrid';
import { VerticalAlignment } from './layoutcell';
import OptionControl, { GridOptionControlProperties } from './optioncontrol';

export type LevelSelectorProperties = GridOptionControlProperties<string> & {
    allowNone: boolean;
    variable: string;
    defaultLevelIndex: number;
    format: StringFormat;
}

export class LevelSelector extends OptionControl<LevelSelectorProperties> {

    label: HTMLElement = null;
    input: HTMLSelectElement;
    dataSupport: RequestDataSupport;
    levels = [];
    enabled = true;
    none = '- None -';

    constructor(params: LevelSelectorProperties, parent) {
        super(params, parent);

        this.dataSupport = GetRequestDataSupport(this);

        this.setRootElement(HTML.parse('<div style="white-space: nowrap;" class="silky-list-item silky-format-string"></div>'));
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.string);
        this.registerSimpleProperty('defaultLevelIndex', 0);
        this.registerOptionProperty('variable');
        this.registerOptionProperty('allowNone');
    }

    override onPropertyChanged(name) {
        super.onPropertyChanged(name);

        if (name === 'variable') {
            this.update();
        }
        else if (name === 'enable') {
            this.enabled = this.getPropertyValue(name);
            this.input.disabled = this.enabled === false;
            if (this.label !== null) {
                if (this.enabled)
                    this.label.classList.remove('disabled-text');
                else
                    this.label.classList.add('disabled-text');
            }
        }
    }

    override onRenderToGrid(grid: LayoutGrid, row, column, owner) {

        let label = this.getPropertyValue('label');
        if (label === null)
            label = '';

        let columnUsed = 0;
        let cell = null;
        let id = _focusLoop.getNextAriaElementId('ctrl');
        if (label !== '') {
            this.label = HTML.parse(`<label for="${id}" class="silky-option-combo-label silky-control-margin-${this.getPropertyValue('margin')}" style="display: inline; white-space: nowrap;" >${label}</label>`);
            cell = grid.addCell(column, row, this.label);
            cell.setAlignment('left', 'center');
            columnUsed += 1;
        }

        let t = `<select id="${id}" class="silky-option-input silky-option-combo-input jmv-level-selector silky-control-margin-${this.getPropertyValue('margin')}">`;
        if (this.getPropertyValue('allowNone'))
            t += '<option>' + this.none + '</option>';
        t += '</select>';

        this.input = HTML.parse(t);
        this.update();
        this.input.addEventListener('change', (event) => {
            let value = this.input.value;
            if (value === this.none && this.getPropertyValue('allowNone'))
                this.setValue(null);
            else
                this.setValue(value);
        });

        let spans = { rows: 1, columns: 1 };
        let vAlign: VerticalAlignment = 'top';
        if (columnUsed === 0 && this.hasProperty('cell')) {
            spans = { rows: 1, columns: 2 };
            vAlign = 'center';
        }

        cell = grid.addCell(column + columnUsed, row, this.input, { spans, vAlign });
        cell.setAlignment('left', 'center');

        columnUsed += 1;

        return { height: 1, width: columnUsed };
    }

    update() {
        let allowNone = this.getPropertyValue('allowNone');
        if (allowNone === null)
            allowNone = false;
        let variable = this.getPropertyValue('variable');
        let promise = this.dataSupport.requestData('column', { columnName: variable, properties: [ 'measureType', 'levels' ] });
        promise.then(rData => {

            if (this.isDisposed)
                return;

            if (variable !== this.getPropertyValue('variable'))
                return;

            if (rData.columnFound === false)
               this.el.classList.add('unavaliable_variable');
           else
               this.el.classList.remove('unavaliable_variable');

            if (this.label !== null)
                this.label.classList.remove('disabled-text');

            let measureType = rData.measureType;
            let enabled = this.enabled && measureType !== 'continuous';

            if (this.label !== null) {
                if (enabled)
                    this.label.classList.remove('disabled-text');
                else
                    this.label.classList.add('disabled-text');
            }
            this.input.disabled = enabled === false;

            let html = '';
            let displayValue = this.getValue();
            this.levels = rData.levels;
            let selIndex = -1;
            if (allowNone)
                html += '<option>' + this.none + '</option>';
            if (this.levels) {
                for (let i = 0; i < this.levels.length; i++) {
                    if (this.levels[i].label === displayValue)
                        selIndex = i;

                    html += '<option>' + this.levels[i].label + '</option>';
                }
            }
            else
                this.levels = [];

            selIndex = allowNone ? selIndex + 1 : selIndex;
            this.input.innerHTML = html;
            //this.$input.html(html);
            this.input.selectedIndex = selIndex;
            if (selIndex === -1 && this.levels.length > 0) {
                let defaultIndex = this.getPropertyValue('defaultLevelIndex');
                if (defaultIndex >= this.levels.length)
                    defaultIndex = this.levels.length - 1;
                this.setValue(this.levels[defaultIndex].label);
            }
        });
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        if (this.input)
            this._updateSelection();
    }

    _updateSelection() {
        let select = this.input;
        let value = this.getSourceValue();
        let allowNone = this.getPropertyValue('allowNone');
        if (allowNone === null)
            allowNone = false;
        let index = -1;
        if (value === null && allowNone)
            index = 0;
        else {
            for (let i = 0; i < this.levels.length; i++) {
                if (this.levels[i].label === value) {
                    if (allowNone)
                        index = i + 1;
                    else
                        index = i;
                    break;
                }
            }
        }
        select.selectedIndex = index;
    }
}

export default LevelSelector;
