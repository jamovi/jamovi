'use strict';

import { TitledOptionControl } from './optioncontrol';
const RequestDataSupport = require('./requestdatasupport');
import { FormatDef } from './formatdef';
const focusLoop = require('../common/focusloop');

import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export class VariableLabel extends TitledOptionControl {

    label: HTMLElement = null;
    icon: HTMLElement = null;

    constructor(params) {
        super(params);

        RequestDataSupport.extendTo(this);

        this.el = HTML.parse('<div style="white-space: nowrap;" class="silky-list-item silky-format-variable"></div>');
    
        this._updateCount = 0;
    }

    protected registerProperties(properties) {
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
        let promise = this.requestData("column", { columnName: columnName, properties: [ "measureType", "dataType" ], requestId: this._updateCount });
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

            this.icon.classList.add(...imageClasses);
        });
    };

    onOptionValueChanged(key, data) {
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
