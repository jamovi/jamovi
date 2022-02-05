'use strict';

const $ = require('jquery');
const SelectableLayoutGrid = require('./selectablelayoutgrid');
const OptionControl = require('./optioncontrol');
const TitledGridControl = require('./titledgridcontrol');
const FormatDef = require('./formatdef');
let DefaultControls;
const EnumPropertyFilter = require('./enumpropertyfilter');
const SuperClass = require('../common/superclass');
const Backbone = require('backbone');
const deepRenderToGrid = require('./controlcontainer').renderContainerItem;
const TemplateItemControl = require('./templateitemcontrol');
const TargetListValueFilter = require('./targetlistvaluefilter');
const HiddenScrollBarSupport = require('./hiddenscrollbarsupport');

const OptionListControl = function(params) {
    if (!DefaultControls)
        DefaultControls = require('./defaultcontrols');

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

    OptionControl.extendTo(this, params);
    TitledGridControl.extendTo(this, params);
    SelectableLayoutGrid.extendTo(this);

    Object.assign(this, Backbone.Events);

    this.registerSimpleProperty("columns", null);
    this.registerSimpleProperty("maxItemCount", -1);
    this.registerSimpleProperty("showColumnHeaders", false);
    this.registerSimpleProperty("fullRowSelect", false);
    this.registerSimpleProperty("removeAction", "deleterow", new EnumPropertyFilter(["deleterow", "clearcell"], "deleterow"));
    this.registerSimpleProperty("height", "normal", new EnumPropertyFilter(["smallest", "small", "normal", "large", "largest", "auto"], "normal"));
    this.registerSimpleProperty("rowDataAsArray", false);
    this.registerSimpleProperty("stripedRows", false);
    this.registerSimpleProperty("addButton", null);
    this.registerSimpleProperty("ghostText", null);
    this.registerSimpleProperty("isTarget", false);
    this.registerSimpleProperty("valueFilter", "none", new EnumPropertyFilter(["none", "unique", "uniquePerRow", "uniquePerColumn"], "none"));


    this.maxItemCount = this.getPropertyValue('maxItemCount');
    this.showHeaders = this.getPropertyValue('showColumnHeaders');
    this.fullRowSelect = this.getPropertyValue('fullRowSelect');
    this.removeAction = this.getPropertyValue('removeAction');
    this.rowDataAsArray = this.getPropertyValue('rowDataAsArray');

    this.isSingleItem = this.maxItemCount === 1;
    this.stretchEndCells = true;
    this._animateCells = true;
    this._localData = [];
    this.controls = [];

    this._listFilter = new TargetListValueFilter();

    let heightType = this.getPropertyValue('height');
    this.$el.addClass(heightType + "-size");
    this.$el.addClass('silky-control-margin-' + this.getPropertyValue("margin"));
    this.$el.addClass("silky-option-list");
    if (this.isSingleItem)
        this.$el.addClass('single-item');
    else
        this.$el.addClass('multi-item');

    this.hasDisplayLabel = function() {
        return false;
    };

    this._override('onPropertyChanged', (baseFunction, name) => {
        baseFunction.call(this, name);
        if (name === "maxItemCount") {
            this.maxItemCount = this.getPropertyValue('maxItemCount');
            this.isSingleItem = this.maxItemCount === 1;
            this.$el.removeClass('single-item');
            this.$el.removeClass('multi-item');
            if (this.isSingleItem)
                this.$el.addClass('single-item');
            else
                this.$el.addClass('multi-item');
        }
    });

    this.initialize = function() {

        let addButton = this.getPropertyValue("addButton");
        if (addButton !== null && navigator.platform === 'MacIntel')
            HiddenScrollBarSupport.extendTo(this);

        let columns = this.getPropertyValue("columns");
        this._columnInfo = { _list:[] };
        this._realColumnInfoList = [];
        let isTarget = this.getPropertyValue("isTarget");
        if (Array.isArray(columns)) {

            let addButtonClick = () => {
                this.setValue(this.createNewRow(), [this._localData.length]);
                setTimeout( () => {
                    this.setFocus(this._localData.length - 1);
                }, 0);
            };

            for (let i = 0; i < columns.length; i++) {

                let columnInfo = { selectable: true, stretchFactor: 1, label: columns[i].name };

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
                this._columnInfo._list.push(columnInfo);

                if ( ! columnInfo.isVirtual) {
                    columnInfo.isVirtual = false;
                    this._realColumnInfoList.push(columnInfo);
                }

                let row = 0;
                if (this.showHeaders) {
                    let hCell = this.addCell(i, row,  $('<div style="white-space: nowrap;" class="silky-option-list-header" data-index="' + columnInfo.index + '">' + this.translate(columnInfo.label) + '</div>'));
                    hCell.setStretchFactor(columnInfo.stretchFactor);
                    hCell.makeSticky();
                    hCell.setHorizontalAlign(columnInfo.headerAlign === undefined ? 'left' : columnInfo.headerAlign);
                    hCell.setVerticalAlign('center');
                    hCell.$el.addClass('silky-option-list-header-cell');
                    hCell.setDimensionMinMax(columnInfo.minWidth, columnInfo.maxWidth, columnInfo.minHeight, columnInfo.maxHeight);
                    row += 1;
                }
                let $filler = $('<div style="white-space: nowrap;" class="list-item-ctrl"></div>');
                let fillerInUse = false;
                let fillerZindex = '111';
                if (i === 0) {
                    let ghostText = this.getPropertyValue("ghostText");
                    if (ghostText !== null) {
                        this.$ghostTextLabel = $('<div class="column-ghost-label">' + this.translate(ghostText) + '</div>');
                        $filler.append(this.$ghostTextLabel);
                        fillerInUse = true;
                        fillerZindex = '10';
                    }


                    if (addButton !== null) {
                        this.$addButton = $('<div class="column-add-button"><div class="list-add-button"><span class="mif-plus"></span></div>' + this.translate(addButton) + '</div>');
                        this.$addButton.click(addButtonClick);
                        $filler.append(this.$addButton);
                        fillerInUse = true;
                    }
                }
                this.fillerCell = this.addCell(i, row, $filler);
                this.fillerCell.$el.addClass('silky-option-list-filler');
                this.fillerCell.makeSticky({ bottom: '0px', 'z-index': fillerZindex });
                if (fillerInUse)
                    this.fillerCell.$el.addClass('in-use');
                this.fillerCell.setStretchFactor(columnInfo.stretchFactor);
                this.fillerCell.setDimensionMinMax(columnInfo.minWidth, columnInfo.maxWidth);
            }
        }

    };

    this.hasColumnWithFormat = function(format) {
        for (let i = 0; i < this._columnInfo._list.length; i++) {
            if (this._columnInfo._list[i].format.name === format.name) {
                return true;
            }
        }
        return false;
    };

    this._context = null;
    this.setControlManager = function(context) {
        this._context = context;
    };

    this.cloneObject = function(template) {
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
    };

    this.updateValueCell = function(columnInfo, dispRow, value) {
        let dispColumn = columnInfo.index;
        if (dispRow === this._rowCount - 1)
            this.insertRow(dispRow, 1);
        let cell = this.getCell(dispColumn, dispRow);

        if (cell === null) {

            let isVirtual = columnInfo.isVirtual;
            let params = { type: DefaultControls.Label };

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
            TemplateItemControl.extendTo(ctrl);
            this.controls.push(ctrl);

            ctrl.setPropertyValue("useSingleCell", true);
            ctrl.setPropertyValue("verticalAlignment", "center");

            cell = deepRenderToGrid(ctrl, this._context, this, dispRow, dispColumn).cell;
            this.onListItemAdded(ctrl, this.displayRowToRowIndex(dispRow));

            let hadAddButton = this.getPropertyValue("addButton") !== null;
            if (hadAddButton) {
                if (columnInfo === this._columnInfo._list[this._columnInfo._list.length - 1]) {
                    let $closeButton = $('<div class="list-item-delete-button"><span class="mif-cross"></span></div>');
                    $closeButton.click((event) => {
                        let selectedIndices = this.getSelectedRowIndices();
                        this.getOption().removeAt(ctrl.getItemKey());
                        this.setSelectedRowIndices(selectedIndices);
                    });
                    $closeButton.on("mousedown", null, this, (event) => {
                        event.stopPropagation();
                        event.preventDefault();
                    });
                    ctrl.$el.prepend($closeButton);
                }
            }

            cell.clickable(columnInfo.selectable);
            if (this.getPropertyValue('stripedRows')) {
                if (this.showHeaders)
                    cell.$el.addClass((this.displayRowToRowIndex(dispRow) % 2 === 0) ? "even-list-row" : "odd-list-row");
                else
                    cell.$el.addClass((this.displayRowToRowIndex(dispRow) % 2 === 0) ? "odd-list-row" : "even-list-row");
            }
        }
        else if (columnInfo.isVirtual && cell.item.setValue)
            cell.item.setValue(value);

        let rowIndex = this.displayRowToRowIndex(dispRow);
        this._listFilter.addValue(new FormatDef.constructor(value, columnInfo.format), rowIndex, columnInfo.name);
    };

    this.onListItemAdded = function(item, index) {
        let data = { item: item, index: index };
        this.trigger("listItemAdded", data);
    };

    this.onListItemRemoved = function(item) {
        let data = { item: item };
        this.trigger("listItemRemoved", data);
    };

    this.updateDisplayRow = function(dispRow, value, onlyVirtual) {
         let columnInfo = null;

         if (this._columnInfo._list.length === 1) {
             columnInfo = this._columnInfo._list[0];
             if (columnInfo !== undefined && (!onlyVirtual || columnInfo.isVirtual))
                 this.updateValueCell(columnInfo, dispRow, value);
         }
        else {
            if (this.rowDataAsArray) {
                let columnInfoList = this._columnInfo._list;
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
    };


    this._override("getValue", (baseFunction, keys) => {
        if (this._realColumnInfoList.length === this._columnInfo._list.length)
            return baseFunction.call(this, keys);
        else
            return this._localData;
    });

    this._override("setValue", (baseFunction, value, key, insert) => {
        if (this._realColumnInfoList.length === this._columnInfo._list.length)
            baseFunction.call(this, value, key, insert);
        else if (key === undefined || key.length === 0) {
            this.beginPropertyEdit();
            baseFunction.call(this, this.virtualDataToReal(value), key, insert);
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
                baseFunction.call(this, value, realKey, insert);
            }
            else {
                this.beginPropertyEdit();
                baseFunction.call(this, this.virtualToRealRowData(value), key, insert);
                this._localData[key[0]] = value;
                this.updateDisplayRow(this.rowIndexToDisplayIndex(key[0]), value, true);
                this.endPropertyEdit();
            }
        }
    });

    this.selectNextAvaliableItem = function(from) {
        let cell = this.getCell(0, this.rowIndexToDisplayIndex(from >= this._localData.length ? this._localData.length - 1 : from));
        this.selectCell(cell);
    };

    this.rowIndexToDisplayIndex = function(rowIndex) {
        if (rowIndex < 0)
            return rowIndex;
        return rowIndex + (this.showHeaders ? 1 : 0);
    };

    this.displayRowToRowIndex = function(dispRow) {
        return dispRow - (this.showHeaders ? 1 : 0);
    };

    this.getCellInfo = function(cell) {
        let info = { };

        let rowIndex = this.displayRowToRowIndex(cell.data.row);

        info.validInfo = true;
        info.removed = false;
        info.cell = cell;
        info.columnInfo = this._columnInfo._list[cell.data.column];
        info.listIndex = rowIndex;

        let offsetKey = [rowIndex];
        if (this.maxItemCount === 1)
            offsetKey = [];
        info.valueIndex = this.getFullKey(offsetKey);

        info.value = this._localData[rowIndex];
        info.isValueCell = info.value !== undefined;

        if (typeof info.value === 'object' && Array.isArray(info.value) === false && this._columnInfo._list.length > 1) {
            info.value = info.value[this.rowDataAsArray ? info.columnInfo.index : info.columnInfo.name];
            info.rowForm = "object";
            info.valueIndex.push(this.rowDataAsArray ? info.columnInfo.index : info.columnInfo.name);
        }
        else
            info.rowForm = "primitive";

        if (info.columnInfo.format === null) {
            info.format = FormatDef.infer(info.value);
            info.columnInfo.format = info.format;
        }
        else
            info.format = info.columnInfo.format;

        return info;
    };


    this.findEmptyProperty = function(item, format, value) {

        let columns = this._columnInfo._list;

        for (let i = 0; i < columns.length; i++) {

            let valueKey = [columns[i].name];
            if (this.rowDataAsArray)
                valueKey = [columns[i].index];
            if (this._columnInfo._list.length === 1)
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
    };

    this._findValueWithKey = function(data, key) {
        let value = data;
        for (let i = 0; i < key.length; i++)
            value = value[key[i]];

        return value;
    };

    this._setValueWithKey = function(data, key, value) {
        let item = data;
        for (let i = 0; i < key.length; i++) {
            if (i === key.length - 1)
                item[key[i]] = value;
            else
                item = item[key[i]];
        }

        return item;
    };

    this.createNewRow = function() {
        let itemPrototype = {};
        if (this.rowDataAsArray)
            itemPrototype = [];

        let columns = this._columnInfo._list;

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

        return itemPrototype;
    };


    this.clearFromOption = function(cellInfo) {
        let key = null;
        if (this.isSingleItem)
            key = [];
        else if (cellInfo.rowForm === "primitive")
            key = [cellInfo.listIndex];
        else
            key = [cellInfo.listIndex, this.rowDataAsArray ? cellInfo.columnInfo.index : cellInfo.columnInfo.name];

        this.setValue(null, key, false);
    };

    this.removeFromOption = function(cellInfo) {
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
    };

    this.hasSpace = function(format) {
        let hasMaxItemCount = this.maxItemCount >= 0;
        let option = this.getOption();
        let currentCount = option.getLength(this.getValueKey());

        let cellKey = null;
        let lastRow = option.getLength(this.getValueKey()) - 1;
        for (let r = 0; r <= lastRow; r++) {
            let value = this.getSourceValue([r]);
            let emptyKey = r === undefined ? null : this.findEmptyProperty(value, format).key;
            if (emptyKey !== null) {
                cellKey = [r].concat(emptyKey);
                break;
            }
        }

        if (cellKey === null)
            cellKey = [option.getLength(this.getValueKey())];

        if (hasMaxItemCount && cellKey[0] > this.maxItemCount - 1)
            return false;

        return true;
    };

    this.addRawToOption = function(data, cellKey, insert, format) {
        let hasMaxItemCount = this.maxItemCount >= 0;
        let option = this.getOption();
        let currentCount = option.getLength(this.getValueKey());
        let overrideValue = cellKey === null || insert === false;

        if (cellKey === null) {
            let lastRow = option.getLength(this.getValueKey()) - 1;
            let emptyKey = null;
            for (let r = 0; r <= lastRow; r++) {
                let value = this.getSourceValue([r]);
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
            let columnCount = this._columnInfo._list.length;

            let arrayOfObjects = columnCount > 1 && this.rowDataAsArray === false;
            let arrayOfArrays = columnCount > 1 && this.rowDataAsArray === true;
            let multiDimensional = arrayOfObjects || arrayOfArrays;

            if (multiDimensional === false)
                cellKey = [];
        }

        this.setValue(data, cellKey, overrideValue === false);

        return true;
    };

    this.isRowEmpty = function(rowIndex) {
        if (this.isSingleItem) {
            let value = this.getSourceValue();
            if (value === null || value === undefined)
                return true;
        }
        else {
            if (rowIndex >= this.getOption().getLength(this.getValueKey()))
                return true;

            let value = this.getSourceValue([rowIndex]);
            if (value === null || value === undefined)
                return true;
        }

        return false;
    };

    this.formatFromCellKey = function(key) {

        let columnCount = this._columnInfo._list.length;

        let arrayOfObjects = columnCount > 1 && this.rowDataAsArray === false;
        let arrayOfArrays = columnCount > 1 && this.rowDataAsArray === true;
        let multiDimensional = arrayOfObjects || arrayOfArrays;

        let columnFormat = null;

        if (key.length === 0) {
            if (this.maxItemCount === 1 && multiDimensional === false)
                columnFormat = this._columnInfo._list[0].format;
            else
                return null;
        }
        else if (key.length === 1) {
            if (multiDimensional === false)
                columnFormat = this._columnInfo._list[0].format;
            else if (this.maxItemCount === 1) {
                if (arrayOfArrays)
                    columnFormat = this._columnInfo._list[key[0]].format;
                else
                    columnFormat = this._columnInfo[key[0]].format;
            }
            else
                return null;
        }
        else if (key.length > 1) {
            if (arrayOfArrays)
                columnFormat = this._columnInfo._list[key[1]].format;
            else
                columnFormat = this._columnInfo[key[1]].format;
        }

        if (((key.length === 0 || key.length === 1) && (multiDimensional === false || this.maxItemCount === 1)) || (key.length === 2 && multiDimensional === true))
            return columnFormat;

        return columnFormat.getFormat(key.slice(multiDimensional ? 2 : 1));
    };

    //outside -> in
    this.onOptionValueInserted = function(keys, data) {

        if (keys.length !== 1)
            return;

        let dispRow = this.rowIndexToDisplayIndex(keys[0]);

        this.adjustItemBaseKeys(keys[0], 1);

        this.insertRow(dispRow, 1);
        this._listFilter.insertRow(dispRow, 1);
        let rowData = this.realToVirtualRowData(this.getSourceValue([keys[0]]));

        this._localData.splice(keys[0], 0, this.clone(rowData));
        this.updateDisplayRow(dispRow, rowData);
        this.updateGhostLabel();
    };

    this.adjustItemBaseKeys = function(index, by) {
        this.applyToItems(index, (item, index) => {
            if (item.setPropertyValue) {
                let cellRelPath = item.getPropertyValue('itemKey').slice();
                cellRelPath[0] += by;
                item.setPropertyValue('itemKey', cellRelPath);
            }
        });
    };

    this.onOptionValueRemoved = function(keys, data) {
        if (keys.length === 1) {
            this.disposeOfRows(keys[0], 1);
            this._localData.splice(keys[0], 1);
            this.updateGhostLabel();

            this._listFilter.removeRow(keys[0]);
        }
    };

    this.updateGhostLabel = function() {
        if (this.$ghostTextLabel) {
            if (this._localData.length === 0)
                this.$ghostTextLabel.removeClass('hidden-ghost-label');
            else
                this.$ghostTextLabel.addClass('hidden-ghost-label');
            this.$ghostTextLabel.trigger("contentchanged");
        }
    };

    this.virtualDataToReal = function(data) {
        let rData = [];
        for (let i = 0; i < data.length; i++)
            rData.push(this.virtualToRealRowData(data[i]));

        return rData;
    };

    this.realToVirtualRowData = function(rowData, oldRow) {
        if (this._realColumnInfoList.length === this._columnInfo._list.length)
            return rowData;

        let obj = { };
        if (this._realColumnInfoList.length === 1) {
            for (let i = 0; i < this._columnInfo._list.length; i++) {
                let columnInfo = this._columnInfo._list[i];
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
    };

    this.virtualToRealRowData = function(rowData) {
        if (this._realColumnInfoList.length === this._columnInfo._list.length)
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

        return obj;
    };

    this.onOptionValueChanged = function(key, data) {
        if (key.length > 1)
            return;

        this._listFilter.clear();

        let list = [];
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
    };

    this.contentRowCount = function() {
        return  this._rowCount - (this.showHeaders ? 1 : 0) - 1;
    };

    this.setFocus = function(rowIndex) {
        if (rowIndex === undefined && this.hasFocus)
            return true;

        if (this.contentRowCount() > 0) {
            let cells = this.getRow(rowIndex === undefined ? this.rowIndexToDisplayIndex(0) : this.rowIndexToDisplayIndex(rowIndex));
            if (cells) {
                for (let i = 0; i < cells.length; i++) {
                    let cell = cells[i];
                    let cIndex = cell.data.column;
                    if (this._columnInfo._list[cIndex].selectable)
                        this.selectCell(cells[i]);
                }
            }
        }

        return this.hasFocus;
    };

    this.setSelectedRowIndices = function(rowIndices) {
        let itemCount = this.contentRowCount();
        for (let r = 0; r < rowIndices.length; r++) {
            let rowIndex = rowIndices[r];
            if (rowIndex >= itemCount)
                rowIndex = itemCount - 1;

            let cells = this.getRow(this.rowIndexToDisplayIndex(rowIndex));
            if (cells) {
                for (let i = 0; i < cells.length; i++) {
                    this.selectCell(cells[i]);
                }
            }
        }
    };

    this.getSelectedRowIndices = function() {
        let indices = [];
        let _s = [];
        let count = this.selectedCellCount();
        for (let i = 0; i < count; i++) {
            let cell = this.getSelectedCell(i);
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
    };

    this.applyToItems = function(rowIndex, count, callback) {
        let displayIndex = this.rowIndexToDisplayIndex(rowIndex);
        if (callback === undefined) {
            callback = count;
            count = this.contentRowCount() - rowIndex;
        }

        for (let r = displayIndex; r < displayIndex + count; r++) {
            let rowCells = this.getRow(r);
            for (let c = 0; c < rowCells.length; c++) {
                let cell = rowCells[c];
                if (cell.item)
                    callback(cell.item, this.displayRowToRowIndex(r), c);
            }
        }
    };

    this.testValue = function(item, rowIndex, columnName) {
        return this._listFilter.testValue(this.getPropertyValue("valueFilter"), item.value, rowIndex, columnName);
    };


    this.getControls = function() {
        return this.controls;
    };

    this.disposeOfRows = function(rowIndex, count) {

        let itemsToRemove = [];
        this.applyToItems(rowIndex, count, (item, index) => {
            itemsToRemove.push(item);
        });

        let displayIndex = this.rowIndexToDisplayIndex(rowIndex);
        this.removeRow(displayIndex, count);

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
    };

    this.removeControlFromList = function(ctrl) {
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
    };

    this.clone = function(object) {
        return JSON.parse(JSON.stringify(object));
    };

    this.onI18nChanged = function() {
        let ghostText = this.getPropertyValue("ghostText");
        if (ghostText !== null && this.$ghostTextLabel)
            this.$ghostTextLabel.text(this.translate(ghostText));


        let addButton = this.getPropertyValue("addButton");
        if (addButton !== null && this.$addButton)
            this.$addButton.text(this.translate(addButton));


        for (let columnInfo of this._columnInfo._list)
            this.$el.find(`.silky-option-list-header[data-index=${columnInfo.index }]`).text(this.translate(columnInfo.label));
    };

    this.initialize();
};

SuperClass.create(OptionListControl);

module.exports = OptionListControl;
