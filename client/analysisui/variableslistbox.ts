'use strict';

import { FormatDef, VariablesFormat } from './formatdef';
import GetRequestDataSupport, { RequestDataSupport } from './requestdatasupport';
import focusLoop from '../common/focusloop';
import { SelectableOptionListControl, SelectableOptionListControlProperties } from './optionlistcontrol';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { IItem } from './dragndrop';
import DefaultControls from './defaultcontrols';
import { Column, MeasureType } from '../main/dataset';


function checkParams(params: VariablesListBoxProperties) : VariablesListBoxProperties {
    if (params.columns === undefined)
        params.template = { type: DefaultControls.VariableLabel };

    return params;
}

type PermittedVariableType = ('continuous' | 'ordinal' | 'nominal' | 'nominaltext' | 'id' | 'numeric' | 'factor' | 'output');

export type VariablesListBoxProperties = SelectableOptionListControlProperties<string> & {
    format: VariablesFormat;
    permitted: PermittedVariableType[];
}

export class VariablesListBox extends SelectableOptionListControl<VariablesListBoxProperties> {

    static create(params, parent) {
        checkParams(params);
        return new VariablesListBox(params, parent);
    }

    $icons: HTMLElement = null;
    $createButton: HTMLElement;
    _suggestedVariableTypes = [];
    _permittedVariableTypes = [];
    _rendered = false;

    dataSupport: RequestDataSupport;

    constructor(params: VariablesListBoxProperties, parent) {
        super(checkParams(params), parent)

        this.dataSupport = GetRequestDataSupport(this);

        this.checkScrollBars = this.checkScrollBars.bind(this);
        
        this.el.addEventListener('scroll', this.checkScrollBars);
    }

    checkScrollBars() {
        if (this.$icons) {

            let rightValue = 3 - this.el.scrollLeft;
            let bottomValue = 3 - this.el.scrollTop;

            this.$icons.style.bottom = `${bottomValue}px`;
            this.$icons.style.right = `${rightValue}px`;
        }
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('format', FormatDef.variables);
    }

    searchForVariableProperties(properties) {
        var optType = properties.type;
        if (optType === "Array")
            return this.searchForVariableProperties(properties.template);
        else if (optType === "Group") {
            for (let i = 0; i < properties.elements.length; i++) {
                var props = this.searchForVariableProperties(properties.elements[i]);
                if (props !== null)
                    return props;
            }
        }
        else if (optType === "Variable" || optType === "Variables" || optType === "Pair" || optType === "Pairs" || optType === 'Output' || optType === 'Outputs')
            return properties;

        return null;
    }

    override onOptionSet(option) {

        super.onOptionSet(option);

        if (option === null)
            return;

        let properties = this.searchForVariableProperties(option.getProperties());

        if (properties === null) {
            this._suggestedVariableTypes = [];
            this._permittedVariableTypes = [];
        }
        else {
            this._suggestedVariableTypes = properties.suggested;
            if (this._suggestedVariableTypes === undefined)
                this._suggestedVariableTypes = [];
            this._permittedVariableTypes = properties.permitted;
            if (this._permittedVariableTypes === undefined)
                this._permittedVariableTypes = [];
        }

        if (this._rendered)
            this._renderSuggestedIcons();
    }

    _renderSuggestedIcons() {
        if (this._suggestedVariableTypes.length > 0) {
            this.$icons = HTML.parse('<div class="silky-variablelist-icons"></div>');
            for (let i = 0; i < this._suggestedVariableTypes.length; i++) {
                this.$icons.append(HTML.parse('<div style="display: inline-block; overflow: hidden;" class="silky-variable-type-img silky-variable-type-' + this._suggestedVariableTypes[i] + '"></div>'));
            }

            this.checkScrollBars();
            this.el.append(this.$icons);
        }

        if (this.hasProperty('permitted')) {
            let permitted = this.getPropertyValue('permitted');
            if (permitted.includes('output')) {
                this.$createButton = HTML.parse(`<div class="variablelist-button-box"><div class="button"><span class="mif-plus"></span><div class="text">Add New Variable</div></div></div>`);
                this.fillerCell.setContent(this.$createButton);
                this.fillerCell.makeSticky({ bottom: '0px' });
                this.$createButton = this.$createButton.querySelector<HTMLElement>('.button');
                let label = this.getPropertyValue('label');

                this.$createButton.addEventListener('click', () => {
                    let desiredName = label;
                    if (this.isSingleItem === false)
                        desiredName = desiredName + ' ' + (this.contentRowCount() + 1);

                    this.dataSupport.requestAction('createColumn',  { columnType: 'output', name: desiredName}).then((value) => {
                        if (this.isSingleItem)
                            this.setValue(value);
                        else {
                            let list = this.getValue();
                            if (list === null)
                                list = [value];
                            else {
                                list = list.slice();
                                list.push(value);
                            }

                            this.setValue(list);
                        }
                    });
                });
                let value = this.getValue();
                if (this.isSingleItem && value !== null) {
                    this.fillerCell.setVisibility(false);
                    this.$createButton.style.display = 'none';
                }
            }
        }
    }

    override onOptionValueChanged(key, data) {
        if (this.isSingleItem && this.$createButton) {
            let value = this.getValue();
            if (value === null) {
                this.fillerCell.setVisibility(true);
                this.$createButton.style.display = '';
            }
            else {
                this.fillerCell.setVisibility(false);
                this.$createButton.style.display = 'none';
            }
        }
        super.onOptionValueChanged(key, data);
    }

    override addedContentToCell(cell) {
        super.addedContentToCell(cell);

        this.el.classList.add("silky-variable-target");
        if (this.getOption() !== null)
            this._renderSuggestedIcons();
        this._rendered = true;
    }

    override testValue(item:IItem<string>, silent: boolean, rowIndex: number, columnName) {
        let allowItem = true;
        allowItem = super.testValue(item, silent, rowIndex, columnName);
        if (!allowItem)
            return allowItem;

        var itemValue = item.value;
        if (itemValue.format.name === 'variable' && item.properties !== undefined)
            allowItem = this._checkIfVariableTypeAllowed(item.properties);

        if ( ! allowItem &&  ! silent) {
            focusLoop.speakMessage(s_('{var} not permitted. Incorrect measure or data type.', {var: itemValue.toAriaLabel()}));
            this._flashIcons();
        }

        return allowItem;
    }

    _checkPermitted(column: Column, permitted: PermittedVariableType[]) {
        let measureType = column.measureType as PermittedVariableType;
        if ((column.measureType === 'nominal' || column.measureType === 'ordinal') && column.dataType === 'text')
            measureType = column.measureType + 'text';
        if (permitted.includes(measureType))
            return true;


        if (column.measureType === 'id')
            return false;
        else if ((column.measureType === 'nominal' || column.measureType === 'ordinal') && permitted.includes('factor'))
            return true;
        else if ((column.dataType === 'integer' || column.dataType === 'decimal') && permitted.includes('numeric'))
            return true;

        return false;
    }

    _checkIfVariableTypeAllowed(data) {
        let allowItem = true;
        if (this._permittedVariableTypes.length > 0)
            allowItem = this._checkPermitted(data, this._permittedVariableTypes);
        return allowItem;
    }

    _flashIcons() {
        if (this.$icons === null)
            return;

        this.$icons.classList.add('silky-variable-flash');
        setTimeout(() => {
            this.$icons.classList.remove('silky-variable-flash');
        }, 500);
    }
}

export default VariablesListBox;
