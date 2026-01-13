'use strict';

import OptionControl, { GridOptionControlProperties } from './optioncontrol';
import GetRequestDataSupport, { RequestDataSupport } from './requestdatasupport';
import { FormatDef, VariableFormat } from './formatdef';
import focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export type VariableLabelProperties = GridOptionControlProperties<string> & {
    format: VariableFormat;
}

export class VariableLabel extends OptionControl<VariableLabelProperties> {

    label: HTMLElement = null;
    icon: HTMLElement = null;
    dataSupport: RequestDataSupport;
    _updateCount = 0;

    constructor(params: VariableLabelProperties, parent) {
        super(params, parent);

        this.dataSupport = GetRequestDataSupport(this);

        this.setRootElement(HTML.parse('<div style="white-space: nowrap;" class="silky-list-item silky-format-variable"></div>'));
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.variable);
    }

    onDataChanged(data) {
        if (data.dataType !== "columns")
            return;

        if (data.dataInfo.measureTypeChanged || data.dataInfo.dataTypeChanged || data.dataInfo.countChanged)
            this.updateView();
    }

    getAriaLabel() {
        let format = this.getPropertyValue('format');
        let value = this.getValue();
        return format.toAriaLabel(value);
    }

    createItem() {
        let displayValue = this.getValue();
        if (displayValue === null)
            displayValue = '';

        this.labelId = focusLoop.getNextAriaElementId('label');

        this.label = HTML.parse(`<div id="${this.labelId}" aria-label="${ this.getAriaLabel() }" style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">${ displayValue }</div>`);
        this.icon = HTML.parse('<div class="silky-variable-type-img" style="display: inline-block; overflow: hidden;"></div>');

        this.el.append(this.icon);
        this.el.append(this.label);
    }

    addedContentToCell(cell) {
        let displayValue = this.getValue();
        if (displayValue === null)
            displayValue = '';
        this._cell = cell;
        this._updateIcon(displayValue);
    }

    _updateIcon(columnName) {
        this._updateCount += 1;
        let promise = this.dataSupport.requestData("column", { columnName: columnName, properties: [ "measureType", "dataType" ], requestId: this._updateCount });
        promise.then(rData => {
            if (rData.requestData.requestId !== this._updateCount)
                return;

            this.icon.classList.remove();

            if (rData.columnFound === false)
               this.el.classList.add('unavaliable_variable');
           else
               this.el.classList.remove('unavaliable_variable');

            let measureType = rData.measureType;
            if (measureType === undefined)
                measureType = "none";
            let dataType = rData.dataType;
            if (dataType === undefined)
                dataType = "none";
            let imageClasses = ['silky-variable-type-img'];
            if (measureType !== null && measureType !== undefined)
                imageClasses.push('silky-variable-type-' + measureType);
            else
                imageClasses.push('silky-variable-type-none');

            if (dataType !== null && dataType !== undefined)
                imageClasses.push('jmv-data-type-' + dataType);
            else
                imageClasses.push('jmv-data-type-none');

            const prefix1 = 'jmv-data-type-';
            const prefix2 = 'silky-variable-type-';
            [...this.icon.classList].filter(cls => cls.startsWith(prefix1) || cls.startsWith(prefix2)).forEach(cls => this.icon.classList.remove(cls));
            this.icon.classList.add(...imageClasses);
        });
    };

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        this.updateView();
    }

    updateView() {
        if (this.label === null)
            return;

        let displayValue = this.getValue();
        this.label.innerText = displayValue;
        this._updateIcon(displayValue);
        this.label.setAttribute('aria-label', this.getAriaLabel());
    }
}

export default VariableLabel;
