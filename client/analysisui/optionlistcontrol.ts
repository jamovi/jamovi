'use strict';

import {SelectableLayoutGrid} from './selectablelayoutgrid';
import OptionControl, { GridOptionControlProperties } from './optioncontrol';
import { FormattedValue, inferFormat } from './formatdef';
import EnumPropertyFilter from './enumpropertyfilter';
import { deepRenderToGrid } from './controlcontainer';
import TemplateItemControl, { TemplateItemControlProperties } from './templateitemcontrol';
import TargetListValueFilter from './targetlistvaluefilter';
import HiddenScrollBarSupport from './hiddenscrollbarsupport';
import LayoutGrid from './layoutgrid';
import LayoutCell, { HorizontalAlignment } from './layoutcell';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import Format from './format';
import { CtrlDef, IControlProvider, ControlType, Control } from './optionsview';

import $ from 'jquery';  // for backwards compatibility
import { IItem } from './dragndrop';

export interface ICellInfo<U> {
    validInfo: boolean;
    removed: boolean;
    cell: LayoutCell;
    listIndex: number;
    columnInfo: ColumnInfo;
    valueIndex: any;
    value: U;
    isValueCell: boolean;
    rowForm: "object" | "primitive";
    format: any;
}

type ColumnInfo = { 
    selectable: boolean; 
    stretchFactor: number; 
    label: string; 
    index: number;
    type: any;
    format: Format<any>;
    template?: any;
    name: string;
    isVirtual: boolean;
    headerAlign: HorizontalAlignment;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
};

const checkParams = function<T>(params: OptionListControlProperties<T>) : OptionListControlProperties<T> {
    if (params.columns === undefined) {
        let columnInfo = {
            name: "column1",
            stretchFactor: 1,
            template: params.template
        };
        delete params.template;

        if (params.templateName !== undefined) {
            columnInfo.templateName = params.templateName;
            delete params.templateName;
        }

        if (params.selectable !== undefined) {
            columnInfo.selectable = params.selectable;
            delete params.selectable;
        }

        params.columns = [ columnInfo ];
    }

    if (params.selectable === undefined && params.columns !== undefined && Array.isArray(params.columns)) {
        let selectable = false;
        for (let i = 0; i < params.columns.length; i++) {
            let columnParam = params.columns[i];
            if (columnParam.selectable === undefined || columnParam.selectable) {
                selectable = true;
                break;
            } 
        }
        if (!selectable)
            params.selectable = false;
    }

    return params;
}

enum RemoveAction {
    Deleterow = "deleterow", 
    Clearcell = "clearcell"
}

enum ValueFilter {
    None = "none",
    Unique = "unique",
    UniquePerRow = "uniquePerRow",
    UniquePerColumn = "uniquePerColumn"
}

enum SizeMethod {
    Smallest = "smallest",
    Small = "small",
    Normal = "normal",
    Large = "large",
    Largest = "largest",
    Auto = "auto"
}

export type OptionListControlProperties<U> = GridOptionControlProperties<(U | U[])> & {
    columns: any;
    maxItemCount: number;
    showColumnHeaders: boolean;
    removeAction: RemoveAction;
    height: SizeMethod;
    rowDataAsArray: boolean;
    stripedRows: boolean;
    addButton: string;
    ghostText: string;
    isTarget: boolean;
    valueFilter: ValueFilter;
    enable: boolean;
    stretchFactor: number;
}

const isSelectableOptionListControlProperties = function<U>(params: any): params is SelectableOptionListControlProperties<U> {
    return params && (params.selectable || params.selectable === undefined);
}

type InferType<P> = P extends OptionListControlProperties<infer A> ? A : never;

export class OptionListControl<P extends OptionListControlProperties<U>, TGrid extends new () => LayoutGrid = typeof LayoutGrid, U=InferType<P>> extends OptionControl<P, (U|U[]), (U|U[])> {
   
    static create(params: OptionListControlProperties<any> | SelectableOptionListControlProperties<any>) {
        checkParams(params);
        let List = null;
        if (isSelectableOptionListControlProperties(params))
            List = SelectableOptionListControl;  
        else
            List = OptionListControl;

        let addButtonText = params.addButton;
        if (addButtonText !== undefined && navigator.platform === 'MacIntel')
            List = HiddenScrollBarSupport(List);

        return new List(params);
    }

    isSingleItem: boolean;
    maxItemCount: number;
    fillerCell: LayoutCell;
    $ghostTextLabel: HTMLElement;
    addButton: HTMLElement;
    $addButton: any;
    _animateCells = true;
    _localData: U[] = [];
    controls = [];
    _listFilter = new TargetListValueFilter();
    _context: IControlProvider = null;
    defaultControls: {[key:string]: ControlType};
    showHeaders: boolean;
    removeAction: RemoveAction;
    rowDataAsArray: boolean;
    _columnInfo: { [key: string] : ColumnInfo; }
    _columnInfoList: ColumnInfo[];
    _realColumnInfoList: ColumnInfo[];
    declare _el: InstanceType<TGrid>;

    constructor(params: P, Grid: TGrid = LayoutGrid as TGrid) {
        super(checkParams(params));

        this.setRootElement(new Grid());

        this.defaultControls = params.DefaultControls;
    
        this.maxItemCount = this.getPropertyValue('maxItemCount');
        this.showHeaders = this.getPropertyValue('showColumnHeaders');
        
        this.removeAction = this.getPropertyValue('removeAction');
        this.rowDataAsArray = this.getPropertyValue('rowDataAsArray');
    
        this.isSingleItem = this.maxItemCount === 1;
        this.el.stretchEndCells = true;

        //let enabled = this.getPropertyValue('enable');
        //this.setEnabledState(enabled);


        this.initialize();
    }

    override get el() {
        return this._el;
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty("columns", null);
        this.registerSimpleProperty("maxItemCount", -1);
        this.registerSimpleProperty("showColumnHeaders", false);
        this.registerSimpleProperty("removeAction", RemoveAction.Deleterow, new EnumPropertyFilter(RemoveAction, RemoveAction.Deleterow));
        this.registerSimpleProperty("height", SizeMethod.Normal, new EnumPropertyFilter(SizeMethod, SizeMethod.Normal));
        this.registerSimpleProperty("rowDataAsArray", false);
        this.registerSimpleProperty("stripedRows", false);
        this.registerSimpleProperty("addButton", null);
        this.registerSimpleProperty("ghostText", null);
        this.registerSimpleProperty("isTarget", false);
        this.registerSimpleProperty("valueFilter", ValueFilter.None, new EnumPropertyFilter(ValueFilter, ValueFilter.None));
        this.registerSimpleProperty("enable", true);
        this.registerSimpleProperty("stretchFactor", 1);
    }

    hasDisplayLabel() {
        return false;
    }

    override onPropertyChanged<K extends keyof P>(name: K) {
        super.onPropertyChanged(name);
        if (name === "maxItemCount") {
            this.maxItemCount = this.getPropertyValue('maxItemCount');
            this.isSingleItem = this.maxItemCount === 1;
            this.el.classList.remove('single-item');
            this.el.classList.remove('multi-item');
            if (this.isSingleItem)
                this.el.classList.add('single-item');
            else
                this.el.classList.add('multi-item');
        }
        else if (name === 'enable') {
            //let enabled = this.getPropertyValue('enable');
            //this.setEnabledState(enabled);

        }
    }

    setEnabledState(value: boolean) {
        if (value)
            this.el.classList.remove('disabled-list');
        else
            this.el.classList.add('disabled-list');
    }

    addedContentToCell(cell) {
        if (this.isSingleItem === false)
            cell.setVerticalAlign('stretch');
    }

    initialize() {

        let heightType = this.getPropertyValue('height');
        this.el.classList.add(heightType + "-size");
        this.el.classList.add('silky-control-margin-' + this.getPropertyValue("margin"));
        this.el.classList.add("silky-option-list");
        if (this.isSingleItem)
            this.el.classList.add('single-item');
        else
            this.el.classList.add('multi-item');

        let addButtonText = this.getPropertyValue("addButton");
        //if (addButtonText !== null && navigator.platform === 'MacIntel')
        //    HiddenScrollBarSupport.extendTo(this);

        let columns = this.getPropertyValue("columns");
        this._columnInfo = { };
        this._columnInfoList = [];
        this._realColumnInfoList = [];
        let isTarget = this.getPropertyValue("isTarget");
        if (Array.isArray(columns)) {

            let addButtonClick = () => {
                this.setValue(this.createNewRow(), [this._localData.length]);
                setTimeout( () => {
                    this.setFocus(this._localData.length - 1);
                }, 0);
            };

            let addButtonKeyDown = (event) => {
                if (event.keyCode == 13 || event.keyCode == 32) { // 13=enter, 32=space
                    addButtonClick();
                }
            };

            for (let i = 0; i < columns.length; i++) {

                let columnInfo: Partial<ColumnInfo> = { selectable: true, stretchFactor: 1, label: columns[i].name };

                Object.assign(columnInfo, columns[i]);

                columnInfo.index = i;
                columnInfo.type = columnInfo.template.type;

                if (isTarget) {
                    columnInfo.format = columnInfo.template.format;
                    columnInfo.template._parentControl = this;
                    if (columnInfo.format === undefined) {
                        let ctrl = new columnInfo.type(columnInfo.template);
                        columnInfo.format = ctrl.getPropertyValue("format");
                    }
                    if ( ! columnInfo.format)
                        throw "The listitem control '" + columnInfo.type  + "' does not specify a format type.";
                }

                let name = columnInfo.name;

                if (name === undefined)
                    throw 'columns must have a name property.';

                if (this._columnInfo[name] !== undefined)
                    throw "Column names must be unique. The column '" + name + "' has been duplicated.";

                this._columnInfo[name] = columnInfo;
                this._columnInfoList.push(columnInfo);

                if ( ! columnInfo.isVirtual) {
                    columnInfo.isVirtual = false;
                    this._realColumnInfoList.push(columnInfo);
                }

                let row = 0;
                if (this.showHeaders) {
                    let hCell = this.el.addCell(i, row,  HTML.parse('<div style="white-space: nowrap;" class="silky-option-list-header" data-index="' + columnInfo.index + '">' + this.translate(columnInfo.label) + '</div>'));
                    hCell.setStretchFactor(columnInfo.stretchFactor);
                    hCell.makeSticky();
                    hCell.setHorizontalAlign(columnInfo.headerAlign === undefined ? 'left' : columnInfo.headerAlign);
                    hCell.setVerticalAlign('center');
                    hCell.classList.add('silky-option-list-header-cell');
                    hCell.setDimensionMinMax(columnInfo.minWidth, columnInfo.maxWidth, columnInfo.minHeight, columnInfo.maxHeight);
                    row += 1;
                }
                let $filler = HTML.parse('<div style="white-space: nowrap;" class="list-item-ctrl"></div>');
                let fillerInUse = false;
                let fillerZindex = '111';
                if (i === 0) {
                    let ghostText = this.getPropertyValue("ghostText");
                    if (ghostText !== null) {
                        this.$ghostTextLabel = HTML.parse('<div class="column-ghost-label">' + this.translate(ghostText) + '</div>');
                        $filler.append(this.$ghostTextLabel);
                        fillerInUse = true;
                        fillerZindex = '10';
                    }


                    if (addButtonText !== null) {
                        this.addButton = HTML.parse('<div class="column-add-button" tabindex="0"><div class="list-add-button"><span class="mif-plus"></span></div>' + this.translate(addButtonText) + '</div>');
                        this.$addButton = $(this.addButton);
                        this.addButton.addEventListener('click', addButtonClick);
                        this.addButton.addEventListener('keydown', addButtonKeyDown);
                        $filler.append(this.addButton);
                        fillerInUse = true;
                    }
                }
                this.fillerCell = this.el.addCell(i, row, $filler);
                this.fillerCell.classList.add('silky-option-list-filler');
                this.fillerCell.makeSticky({ bottom: '0px', 'zIndex': fillerZindex });
                if (fillerInUse)
                    this.fillerCell.classList.add('in-use');
                this.fillerCell.setStretchFactor(columnInfo.stretchFactor);
                this.fillerCell.setDimensionMinMax(columnInfo.minWidth, columnInfo.maxWidth);
            }
        }

    }

    hasColumnWithFormat(format) {
        for (let i = 0; i < this._columnInfoList.length; i++) {
            if (this._columnInfoList[i].format.name === format.name) {
                return true;
            }
        }
        return false;
    }

    setControlManager(context: IControlProvider) {
        this._context = context;
    }

    cloneObject(template) {
        let newTemplate = template;
        if (typeof template === 'object' && template !== null) {
            if (Array.isArray(template)) {
                newTemplate = [];
                for (let i = 0; i < template.length; i++)
                    newTemplate.push(this.cloneObject(template[i]));
            }
            else {
                newTemplate = { };
                for (let prop in template) {
                    if (prop === '_parentControl')
                        newTemplate[prop] = template[prop];
                    else
                        newTemplate[prop] = this.cloneObject(template[prop]);
                }
            }
        }
        return newTemplate;
    }

    updateValueCell(columnInfo, dispRow: number, value) {
        let dispColumn = columnInfo.index;
        if (dispRow === this.el._rowCount - 1)
            this.el.insertRow(dispRow, 1);
        let cell = this.el.getCell(dispColumn, dispRow);

        if (cell === null) {

            let isVirtual = columnInfo.isVirtual;
            let params: CtrlDef = { type: this.defaultControls.Label };

            if (isVirtual !== undefined)
                params.isVirtual = isVirtual;

            if (columnInfo.maxWidth !== undefined)
                params.maxWidth = columnInfo.maxWidth;

            if (columnInfo.minWidth !== undefined)
                params.minWidth = columnInfo.minWidth;

            params.stretchFactor = columnInfo.stretchFactor;

            params._templateInfo = { template: columnInfo.template, parent: this, name: columnInfo.name, instanceId: this.displayRowToRowIndex(dispRow) };

            if (columnInfo.templateName !== undefined)
                params._templateInfo.templateName = columnInfo.templateName;

            if (columnInfo.template !== undefined)
                Object.assign(params, this.cloneObject(columnInfo.template));

            let offsetKey = [this.displayRowToRowIndex(dispRow)];
            if (this.maxItemCount === 1)
                offsetKey = [];
            params.itemKey = offsetKey;

            if (this._realColumnInfoList.length > 1) {
                let valueKeyOffset = [this.rowDataAsArray ? columnInfo.index : columnInfo.name];
                if (params.valueKey !== undefined)
                    params.valueKey = valueKeyOffset.concat(params.valueKey);
                else
                    params.valueKey = valueKeyOffset;
            }

            let ctrl = this._context.createControl(params, this);
            //if (isSingleCellControl(ctrl) === false)
            //    throw 'Can only add single cell controls to options list';

            ctrl = TemplateItemControl<TemplateItemControlProperties, Control<TemplateItemControlProperties>>(ctrl as Control<TemplateItemControlProperties>);
            this.controls.push(ctrl);

            ctrl.setPropertyValue("useSingleCell", true);
            ctrl.setPropertyValue("verticalAlignment", "center");

            cell = deepRenderToGrid(ctrl, this._context, this.el, dispRow, dispColumn, this).cell;
            cell.classList.add('list-item-cell');
            this.onListItemAdded(ctrl, this.displayRowToRowIndex(dispRow));

            let hadAddButton = this.getPropertyValue("addButton") !== null;
            if (hadAddButton) {
                if (columnInfo === this._columnInfoList[this._columnInfoList.length - 1]) {
                    let $closeButton = HTML.parse('<button class="list-item-delete-button" aria-label="Delete Item"><span class="mif-cross"></span></button>');
                    $closeButton.addEventListener('click', (event) => {
                        let selectedIndices = this.getSelectedRowIndices();
                        this.getOption().removeAt(ctrl.getItemKey());
                        this.setSelectedRowIndices(selectedIndices);
                    });
                    $closeButton.addEventListener("mousedown", (event) => {
                        event.stopPropagation();
                        event.preventDefault();
                    });
                    ctrl.el.prepend($closeButton);
                }
            }

            cell.clickable(columnInfo.selectable);
            if (columnInfo.selectable) {
                cell.setAttribute('role', 'option');
                cell.setAttribute('aria-selected', 'false');
                if (ctrl.getLabelId) {
                    let labelId = ctrl.getLabelId();
                    if (labelId)
                        cell.setAttribute('aria-labelledby', labelId);
                }
            }
            if (this.getPropertyValue('stripedRows')) {
                if (this.showHeaders)
                    cell.classList.add((this.displayRowToRowIndex(dispRow) % 2 === 0) ? "even-list-row" : "odd-list-row");
                else
                    cell.classList.add((this.displayRowToRowIndex(dispRow) % 2 === 0) ? "odd-list-row" : "even-list-row");
            }
        }
        else if (columnInfo.isVirtual && cell.item.setValue)
            cell.item.setValue(value);

        let rowIndex = this.displayRowToRowIndex(dispRow);
        this._listFilter.addValue(new FormattedValue(value, columnInfo.format), rowIndex, columnInfo.name);
    }

    onListItemAdded(item, index) {
        let data = { item: item, index: index };
        this.emit("listItemAdded", data);
    }

    onListItemRemoved(item) {
        let data = { item: item };
        this.emit("listItemRemoved", data);
    }

    updateDisplayRow(dispRow: number, value: U, onlyVirtual?: boolean) {
        let columnInfo = null;

        if (this._columnInfoList.length === 1) {
            columnInfo = this._columnInfoList[0];
            if (columnInfo !== undefined && (!onlyVirtual || columnInfo.isVirtual))
                this.updateValueCell(columnInfo, dispRow, value);
        }
        else {
            if (this.rowDataAsArray) {
                if (Array.isArray(value) === false)
                    throw 'value must be array';

                let columnInfoList = this._columnInfoList;
                for (let i = 0; i < value.length; i++) {
                    if (i >= columnInfoList.length)
                        break;

                    if (!onlyVirtual || columnInfoList[i].isVirtual)
                        this.updateValueCell(columnInfoList[i], dispRow, value[i]);
                }
            }
            else {
                for (let key in value) {
                    let v = value[key];
                    columnInfo = this._columnInfo[key];
                    if (columnInfo !== undefined && (!onlyVirtual || columnInfo.isVirtual))
                        this.updateValueCell(columnInfo, dispRow, v);
                }
            }
        }
    }

    override getValue(keys=null) {
        if (this._realColumnInfoList.length === this._columnInfoList.length)
            return super.getValue(keys);
        else
            return this._localData;
    }

    override setValue(value: U | U[], key=[], insert=false) {
        if (this._realColumnInfoList.length === this._columnInfoList.length)
            super.setValue(value, key, insert);
        else if (key === undefined || key.length === 0) {
            if (Array.isArray(value) === false)
                throw 'value must be an array';
            this.beginPropertyEdit();
            super.setValue(this.virtualDataToReal(value), key, insert);
            for (let r = 0; r < value.length; r++) {
                this._localData[r] = this.clone(value[r]);
                this.updateDisplayRow(this.rowIndexToDisplayIndex(r), value[r], true);
            }
            this.endPropertyEdit();
        }
        else if (key.length > 1) {
            if (key[1] === this._realColumnInfoList[0].name) {
                let realKey = key;
                if (this._realColumnInfoList.length === 1)
                    realKey = this.clone(key).splice(1, 1);
                super.setValue(value, realKey, insert);
            }
            else {
                value = value as U;
                this.beginPropertyEdit();
                super.setValue(this.virtualToRealRowData(value), key, insert);
                this._localData[key[0]] = value;
                this.updateDisplayRow(this.rowIndexToDisplayIndex(key[0]), value, true);
                this.endPropertyEdit();
            }
        }
    }

    rowIndexToDisplayIndex(rowIndex: number): number {
        if (rowIndex < 0)
            return rowIndex;
        return rowIndex + (this.showHeaders ? 1 : 0);
    }

    displayRowToRowIndex(dispRow: number): number {
        return dispRow - (this.showHeaders ? 1 : 0);
    }

    getCellInfo(cell: LayoutCell) : ICellInfo<U> {
        let rowIndex = this.displayRowToRowIndex(cell.data.row);
        let offsetKey = [rowIndex];
        if (this.maxItemCount === 1)
            offsetKey = [];

        let info: ICellInfo<U> = { 
            validInfo: true, 
            removed: false, 
            cell: cell, 
            columnInfo: this._columnInfoList[cell.data.column],
            listIndex: rowIndex,
            valueIndex: this.getFullKey(offsetKey),
            value: this._localData[rowIndex],
            isValueCell: this._localData[rowIndex] !== undefined,
            rowForm: undefined,
            format: undefined
        };

        if (typeof info.value === 'object' && Array.isArray(info.value) === false && this._columnInfoList.length > 1) {
            info.value = info.value[this.rowDataAsArray ? info.columnInfo.index : info.columnInfo.name];
            info.rowForm = "object";
            info.valueIndex.push(this.rowDataAsArray ? info.columnInfo.index : info.columnInfo.name);
        }
        else
            info.rowForm = "primitive";

        if (info.columnInfo.format === null) {
            info.format = inferFormat(info.value);
            info.columnInfo.format = info.format;
        }
        else
            info.format = info.columnInfo.format;

        return info;
    }

    findEmptyProperty(item: U, format=undefined, value=undefined) {

        let columns = this._columnInfoList;

        for (let i = 0; i < columns.length; i++) {

            let valueKey: (number|string)[] = [columns[i].name];
            if (this.rowDataAsArray)
                valueKey = [columns[i].index];
            if (this._columnInfoList.length === 1)
                valueKey = [];

            let columnFormat = columns[i].format;
            let formats = columnFormat.allFormats(format);
            for (let y = 0; y < formats.length; y++) {
                let key = valueKey.concat(formats[y].key);
                let subItem = this._findValueWithKey(item, key);
                if (subItem === undefined || formats[y].format.isEmpty(subItem)) {
                    if (value !== undefined)
                        this._setValueWithKey(item, key, value);
                    return { format: formats[y].format, key: key };
                }
            }
        }

        return { format: null, key: null };
    }

    _findValueWithKey(data, key) {
        let value = data;
        for (let i = 0; i < key.length; i++)
            value = value[key[i]];

        return value;
    }

    _setValueWithKey(data: U, key: (string|number)[], value: any): U {
        let item = data;
        for (let i = 0; i < key.length; i++) {
            if (i === key.length - 1)
                item[key[i]] = value;
            else
                item = item[key[i]];
        }

        return item;
    }

    createNewRow(): U {
        let itemPrototype = {};
        if (this.rowDataAsArray)
            itemPrototype = [];

        let columns = this._columnInfoList;

        if (columns.length === 1)
            return null;

        for (let i = 0; i < columns.length; i++) {
            let key = null;
            if (this.rowDataAsArray)
                key = columns[i].index;
            else
                key = columns[i].name;

            let defaultValue = columns[i].template.default;

            if (defaultValue === undefined && columns[i].format)
                defaultValue = columns[i].format.default;

            if (defaultValue === undefined)
                defaultValue = null;

            itemPrototype[key] = defaultValue;
        }

        return itemPrototype as U;
    }

    clearFromOption(cellInfo) {
        let key = null;
        if (this.isSingleItem)
            key = [];
        else if (cellInfo.rowForm === "primitive")
            key = [cellInfo.listIndex];
        else
            key = [cellInfo.listIndex, this.rowDataAsArray ? cellInfo.columnInfo.index : cellInfo.columnInfo.name];

        this.setValue(null, key, false);
    }

    removeFromOption(cellInfo) {
        if (this.isSingleItem && cellInfo.listIndex !== 0)
            throw 'Index out of list index range.';

        cellInfo.validInfo = false;

        if (this.isSingleItem)
            this.clearFromOption(cellInfo);
        else if (this.removeAction === "deleterow") {
            cellInfo.removed = true;
            this.getOption().removeAt(this.getFullKey([cellInfo.listIndex]));
        }
        else {
            this.clearFromOption(cellInfo);
            return false; //not removed but column has been nulled nulled.
        }

        return true;
    }

    hasSpace(format=undefined) {
        let hasMaxItemCount = this.maxItemCount >= 0;
        let option = this.getOption();
        let currentCount = option.getLength(this.getValueKey());

        let cellKey: (number|string)[] = null;
        let lastRow = option.getLength(this.getValueKey()) - 1;
        let rowIndex = -1;
        for (let r = 0; r <= lastRow; r++) {
            let value = this.getRowValue(r);
            let emptyKey = r === undefined ? null : this.findEmptyProperty(value, format).key;
            if (emptyKey !== null) {
                rowIndex = r;
                emptyKey.unshift(r);
                cellKey = emptyKey;
                break;
            }
        }

        if (cellKey === null) {
            rowIndex = option.getLength(this.getValueKey());
            cellKey = [rowIndex];
        }

        if (hasMaxItemCount && rowIndex > this.maxItemCount - 1)
            return false;

        return true;
    }

    getSiblingCount?(): number;

    addRawToOption(data, cellKey, insert, format) {
        let hasMaxItemCount = this.maxItemCount >= 0;
        let option = this.getOption();
        let currentCount = option.getLength(this.getValueKey());
        let overrideValue = cellKey === null || insert === false;

        if (cellKey === null) {
            let lastRow = option.getLength(this.getValueKey()) - 1;
            let emptyKey = null;
            for (let r = 0; r <= lastRow; r++) {
                let value = this.getRowValue(r);
                emptyKey = r === undefined ? null : this.findEmptyProperty(value, format).key;
                if (emptyKey !== null) {
                    cellKey = [r].concat(emptyKey);
                    overrideValue = true;
                    break;
                }
            }
        }
        else if (overrideValue) {
            let targetFormat = this.formatFromCellKey(cellKey);
            if (targetFormat.name !== format.name)
                return false;
        }

        if (cellKey === null)
            cellKey = [option.getLength(this.getValueKey())];

        if (overrideValue === false || this.isRowEmpty(cellKey[0])) {
            let newRow = this.createNewRow();
            if (newRow !== null) {
                if (cellKey.length === 1)
                    this.findEmptyProperty(newRow, format, data);
                else
                    this._setValueWithKey(newRow, cellKey.slice(1), data);
                data = newRow;
            }
            cellKey = [cellKey[0]];
        }

        let siblingListCount = 0;
        if (this.getSiblingCount)
            siblingListCount = this.getSiblingCount();

        if ((siblingListCount > 0 || this.isSingleItem === false) && hasMaxItemCount && (cellKey[0] > this.maxItemCount - 1 || (overrideValue === false && option.getLength(this.getValueKey()) === this.maxItemCount)))
            return false;

        if (option.valueInited() === false) {
            cellKey = [];
            if (this.isSingleItem === false)
                data = [data];
        }

        if (this.isSingleItem) {
            let columnCount = this._columnInfoList.length;

            let arrayOfObjects = columnCount > 1 && this.rowDataAsArray === false;
            let arrayOfArrays = columnCount > 1 && this.rowDataAsArray === true;
            let multiDimensional = arrayOfObjects || arrayOfArrays;

            if (multiDimensional === false)
                cellKey = [];
        }

        this.setValue(data, cellKey, overrideValue === false);

        return true;
    }

    isRowEmpty(rowIndex) {
        if (this.isSingleItem) {
            let value = this.getSourceValue();
            if (value === null || value === undefined)
                return true;
        }
        else {
            if (rowIndex >= this.getOption().getLength(this.getValueKey()))
                return true;

            let value = this.getRowValue(rowIndex);
            if (value === null || value === undefined)
                return true;
        }

        return false;
    }

    formatFromCellKey(key) {

        let columnCount = this._columnInfoList.length;

        let arrayOfObjects = columnCount > 1 && this.rowDataAsArray === false;
        let arrayOfArrays = columnCount > 1 && this.rowDataAsArray === true;
        let multiDimensional = arrayOfObjects || arrayOfArrays;

        let columnFormat = null;

        if (key.length === 0) {
            if (this.maxItemCount === 1 && multiDimensional === false)
                columnFormat = this._columnInfoList[0].format;
            else
                return null;
        }
        else if (key.length === 1) {
            if (multiDimensional === false)
                columnFormat = this._columnInfoList[0].format;
            else if (this.maxItemCount === 1) {
                if (arrayOfArrays)
                    columnFormat = this._columnInfoList[key[0]].format;
                else
                    columnFormat = this._columnInfo[key[0]].format;
            }
            else
                return null;
        }
        else if (key.length > 1) {
            if (arrayOfArrays)
                columnFormat = this._columnInfoList[key[1]].format;
            else
                columnFormat = this._columnInfo[key[1]].format;
        }

        if (((key.length === 0 || key.length === 1) && (multiDimensional === false || this.maxItemCount === 1)) || (key.length === 2 && multiDimensional === true))
            return columnFormat;

        return columnFormat.getFormat(key.slice(multiDimensional ? 2 : 1));
    }

    //outside -> in
    override onOptionValueInserted(keys, data) {

        if (keys.length === 1) {

            let dispRow = this.rowIndexToDisplayIndex(keys[0]);

            this.adjustItemBaseKeys(keys[0], 1);

            this.el.insertRow(dispRow, 1);
            this._listFilter.insertRow(dispRow, 1);
            let rowData = this.realToVirtualRowData(this.getRowValue(keys[0]));

            this._localData.splice(keys[0], 0, this.clone(rowData));
            this.updateDisplayRow(dispRow, rowData);
            this.updateGhostLabel();
        }

        super.onOptionValueInserted(keys, data);
    }

    getRowValue(rowIndex: number): U {
        return this.getSourceValue([rowIndex]) as U;
    }

    adjustItemBaseKeys(index, by) {
        this.applyToItems(index, (item, index) => {
            if (item.setPropertyValue) {
                let cellRelPath = item.getPropertyValue('itemKey').slice();
                cellRelPath[0] += by;
                item.setPropertyValue('itemKey', cellRelPath);
            }
        });
    }

    override onOptionValueRemoved(keys, data) {
        if (keys.length === 1) {
            this.disposeOfRows(keys[0], 1);
            this._localData.splice(keys[0], 1);
            this.updateGhostLabel();

            this._listFilter.removeRow(keys[0]);
        }
        super.onOptionValueRemoved(keys, data);
    }

    updateGhostLabel() {
        if (this.$ghostTextLabel) {
            if (this._localData.length === 0)
                this.$ghostTextLabel.classList.remove('hidden-ghost-label');
            else
                this.$ghostTextLabel.classList.add('hidden-ghost-label');

            let event = new CustomEvent('contentchanged');
            this.$ghostTextLabel.dispatchEvent(event);
        }
    }

    virtualDataToReal(data: U[]) {
        let rData: U[] = [];
        for (let i = 0; i < data.length; i++)
            rData.push(this.virtualToRealRowData(data[i]));

        return rData;
    }

    realToVirtualRowData(rowData, oldRow?) {
        if (this._realColumnInfoList.length === this._columnInfoList.length)
            return rowData;

        let obj = { };
        if (this._realColumnInfoList.length === 1) {
            for (let i = 0; i < this._columnInfoList.length; i++) {
                let columnInfo = this._columnInfoList[i];
                if (oldRow === undefined)
                    obj[columnInfo.name] = null;
                else
                    obj[columnInfo.name] = oldRow[columnInfo.name];


            }
            for (let i = 0; i < this._realColumnInfoList.length; i++) {
                let columnInfo = this._realColumnInfoList[i];
                obj[columnInfo.name] = this._realColumnInfoList.length === 1 ? rowData : rowData[columnInfo.name];
            }
        }

        return obj;
    }

    virtualToRealRowData(rowData: U): U {
        if (this._realColumnInfoList.length === this._columnInfoList.length)
            return rowData;

        if (this._realColumnInfoList.length === 1) {
            if (typeof rowData === 'object')
                return rowData[this._realColumnInfoList[0].name];

            return rowData;
        }

        let obj = { };
        for (let i = 0; i < this._realColumnInfoList.length; i++) {
            let columnInfo = this._realColumnInfoList[i];
            obj[columnInfo.name] = rowData[columnInfo.name];
        }

        return obj as U;
    }

    override onOptionValueChanged(key, data) {
        if (key.length <= 1) {

            this._listFilter.clear();

            let list: U | U[] = [];
            if (this.getOption() !== null)
                list = this.getSourceValue();

            if (list !== null) {
                let oldLocalCount = this._localData.length;
                let oldLocal = this._localData;
                this._localData = [];
                if (Array.isArray(list)) {
                    for (let i = 0; i < list.length; i++) {
                        let rowData = this.realToVirtualRowData(list[i], oldLocal[i]);
                        this.updateDisplayRow(this.rowIndexToDisplayIndex(i), rowData);
                        this._localData.push(this.clone(rowData));
                    }
                    let countToRemove = oldLocalCount - this._localData.length;
                    if (countToRemove > 0)
                        this.disposeOfRows(this._localData.length, countToRemove);
                }
                else if (this.isSingleItem) {
                    let rowData = this.realToVirtualRowData(list, this._localData[0]);
                    this._localData[0] = this.clone(rowData);
                    this.updateDisplayRow(this.rowIndexToDisplayIndex(0), rowData);
                }
            }
            else if (this._localData.length > 0) {
                this.disposeOfRows(0, this._localData.length);
                this._localData = [];
            }

            this.updateGhostLabel();
        }

        super.onOptionValueChanged(key, data);
    }

    contentRowCount() {
        return  this.el._rowCount - (this.showHeaders ? 1 : 0) - 1;
    }

    applyToItems(rowIndex: number, callback: (item, index) => void, count?: number) {
        let displayIndex = this.rowIndexToDisplayIndex(rowIndex);
        if (count === undefined)
            count = this.contentRowCount() - rowIndex;

        for (let r = displayIndex; r < displayIndex + count; r++) {
            let rowCells = this.el.getRow(r);
            for (let c = 0; c < rowCells.length; c++) {
                let cell = rowCells[c];
                if (cell.item)
                    callback(cell.item, this.displayRowToRowIndex(r), c);
            }
        }
    }

    testValue(item: IItem<U>, silent, rowIndex: number=null, columnName=null) {
        return this._listFilter.testValue(this.getPropertyValue("valueFilter"), item.value, rowIndex, columnName, silent);
    }

    getControls() {
        return this.controls;
    }

    disposeOfRows(rowIndex, count) {

        let itemsToRemove = [];
        this.applyToItems(rowIndex, (item, index) => {
            itemsToRemove.push(item);
        }, count);

        let displayIndex = this.rowIndexToDisplayIndex(rowIndex);
        this.el.removeRow(displayIndex, count);

        this.adjustItemBaseKeys(rowIndex, -count);

        for (let i = 0; i < itemsToRemove.length; i++) {
            let item = itemsToRemove[i];
            this.removeControlFromList(item);
            this.onListItemRemoved(item);
            if (item.dispose)
                item.dispose();
            else {
                throw "Item has not been disposed of properly.";
            }
        }
    }

    removeControlFromList(ctrl) {
        let found = false;
        for (let u = 0; u < this.controls.length; u++) {
            if (this.controls[u] === ctrl) {
                this.controls.splice(u, 1);
                found = true;
                break;
            }
        }
        if (found === false)
            throw 'For some reason the control was not found in the control list. Must be a bug somewhere.';
    }

    clone(object) {
        return JSON.parse(JSON.stringify(object));
    }

    onI18nChanged() {
        let ghostText = this.getPropertyValue("ghostText");
        if (ghostText !== null && this.$ghostTextLabel)
            this.$ghostTextLabel.innerText = this.translate(ghostText);


        let addButtonText = this.getPropertyValue("addButton");
        if (addButtonText !== null && this.addButton)
            this.addButton.innerText = this.translate(addButtonText);


        for (let columnInfo of this._columnInfoList) {
            let element = this.el.querySelector<HTMLElement>(`.silky-option-list-header[data-index="${columnInfo.index }"]`);
            if (element)
                element.innerText = this.translate(columnInfo.label);
        }
    }
}

export type SelectableOptionListControlProperties<T> = OptionListControlProperties<T> & {
    fullRowSelect: boolean;
}

export class SelectableOptionListControl<P extends SelectableOptionListControlProperties<T>, T=InferType<P>> extends OptionListControl<P, typeof SelectableLayoutGrid, T> {
    constructor(params: P) {
        super(params, SelectableLayoutGrid);

        this._el.fullRowSelect = this.getPropertyValue('fullRowSelect');
    }

    protected override registerProperties(properties: P): void {
        super.registerProperties(properties);

        this.registerSimpleProperty("fullRowSelect", false);
    }

    selectNextAvaliableItem(from: number): void {
        let cell = this.el.getCell(0, this.rowIndexToDisplayIndex(from >= this._localData.length ? this._localData.length - 1 : from));
        this.el.selectCell(cell);
    }

    setFocus(rowIndex: number = undefined) {
        if (rowIndex === undefined && this.el.hasFocus)
            return true;

        if (this.contentRowCount() > 0) {
            let cells = this.el.getRow(rowIndex === undefined ? this.rowIndexToDisplayIndex(0) : this.rowIndexToDisplayIndex(rowIndex));
            if (cells) {
                for (let i = 0; i < cells.length; i++) {
                    let cell = cells[i];
                    let cIndex = cell.data.column;
                    if (this._columnInfoList[cIndex].selectable)
                        this.el.selectCell(cells[i]);
                }
            }
        }

        return this.el.hasFocus;
    }

    setSelectedRowIndices(rowIndices: number[]) {
        let itemCount = this.contentRowCount();
        for (let r = 0; r < rowIndices.length; r++) {
            let rowIndex = rowIndices[r];
            if (rowIndex >= itemCount)
                rowIndex = itemCount - 1;

            let cells = this.el.getRow(this.rowIndexToDisplayIndex(rowIndex));
            if (cells) {
                for (let i = 0; i < cells.length; i++) {
                    this.el.selectCell(cells[i]);
                }
            }
        }
    }

    getSelectedRowIndices(): number[] {
        let indices = [];
        let _s = [];
        let count = this.el.selectedCellCount();
        for (let i = 0; i < count; i++) {
            let cell = this.el.getSelectedCell(i);
            let rowIndex = this.displayRowToRowIndex(cell.data.row);
            if (_s[rowIndex] === undefined) {
                _s[rowIndex] = 1;
                indices.push(rowIndex);
            }
            else {
                _s[rowIndex] += 1;
            }
        }
        return indices;
    }
}

export type SelectableOptionListControlType<T> = InstanceType<typeof SelectableOptionListControl<SelectableOptionListControlProperties<T>>>;

export default OptionListControl;
