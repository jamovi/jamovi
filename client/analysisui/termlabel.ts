'use strict';

import OptionControl, { GridOptionControlProperties } from './optioncontrol';
import GetRequestDataSupport, { RequestDataSupport } from './requestdatasupport';
import { FormatDef, TermFormat } from './formatdef';
import focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export type TermLabelProperties = GridOptionControlProperties<string[]> & {
    format: TermFormat;
}

export class TermLabel extends OptionControl<TermLabelProperties> {
    label: HTMLElement;
    _format: TermFormat;
    dataSupport: RequestDataSupport;
    _updateCount: number;

    constructor(params: TermLabelProperties, parent) {
        super(params, parent);

        this.dataSupport = GetRequestDataSupport(this);

        this.setRootElement(HTML.parse('<div style="white-space: nowrap;" class="silky-list-item silky-format-term"></div>'));

        this._format = this.getPropertyValue('format');
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.term);
    }

    getAriaLabel() {
        let value = this.getValue();
        return this._format.toAriaLabel(value);
    }

    createItem() {
        let value = this.getValue();

        let displayValue = this._format.toString(value);

        this.labelId = focusLoop.getNextAriaElementId('label');
        this.label = HTML.parse(`<div id="${this.labelId}" aria-label="${ this.getAriaLabel() }" style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">${ displayValue }</div>`);

        this.el.append(this.label);
        if (value !== null)
            this.updateView(value);

        this._updateCount = 0;
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        if (this.label) {
            let value = this.getValue();
            let displayValue = this._format.toString(value);
            this.label.innerHTML = displayValue;
            this.label.setAttribute('aria-label', this._format.toAriaLabel(value));
            if (value !== null)
                this.updateView(value);
        }
    }

    onDataChanged(data) {
        if (data.dataType !== 'columns')
            return;

        if (data.dataInfo.countChanged) {
            let value = this.getValue();
            if (value !== null)
                this.updateView(value);
        }
    }

    updateView(columnNames: string[]) {
        let promises = [];
        let count = 0;
        let columnFound = true;
        this._updateCount += 1;
        let process = rData => {
            if (rData.requestData.requestId !== this._updateCount)
                return;

            if (columnFound && rData.columnFound === false)
               columnFound = false;

            count += 1;
            if (count === columnNames.length) {
                if (columnFound === false)
                   this.el.classList.add('unavaliable_variable');
               else
                   this.el.classList.remove('unavaliable_variable');
            }
        };
        for (let i = 0; i < columnNames.length; i++) {
            let columnName = columnNames[i];
            let promise = this.dataSupport.requestData('column', { columnName: columnName, properties: [ 'measureType' ], requestId: this._updateCount });
            promise.then(process);
        }
    }
}

export default TermLabel;
