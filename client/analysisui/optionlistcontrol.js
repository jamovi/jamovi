'use strict';

var $ = require('jquery');
var _ = require('underscore');
var SelectableLayoutGrid = require('./selectablelayoutgrid');
var OptionControl = require('./optioncontrol');
var FormatDef = require('./formatdef');
var DefaultControls;
var EnumPropertyFilter = require('./enumpropertyfilter');
var SuperClass = require('../common/superclass');

var OptionListControl = function(params) {
    DefaultControls = require('./defaultcontrols');
    OptionControl.extendTo(this, params);
    SelectableLayoutGrid.extendTo(this);

    this.registerSimpleProperty("columns", null);
    this.registerSimpleProperty("maxItemCount", -1);
    this.registerSimpleProperty("showColumnHeaders", false);
    this.registerSimpleProperty("fullRowSelect", false);
    this.registerSimpleProperty("removeAction", "deleterow", new EnumPropertyFilter(["deleterow", "clearcell"], "deleterow"));
    this.registerSimpleProperty("height", "normal", new EnumPropertyFilter(["smallest", "small", "normal", "large", "largest"], "normal"));
    this.registerSimpleProperty("rowDataAsArray", false);
    this.registerSimpleProperty("stripedRows", false);


    this.maxItemCount = this.getPropertyValue('maxItemCount');
    this.showHeaders = this.getPropertyValue('showColumnHeaders');
    this.fullRowSelect = this.getPropertyValue('fullRowSelect');
    this.removeAction = this.getPropertyValue('removeAction');
    this.rowDataAsArray = this.getPropertyValue('rowDataAsArray');

    this.$el.addClass(this.getPropertyValue('height') + "-size");
    this.$el.addClass('silky-control-margin-' + this.getPropertyValue("margin"));

    this.isSingleItem = this.maxItemCount === 1;

    this.$el.addClass("silky-option-list");
    this.stretchEndCells = true;
    this._animateCells = true;
    this.allocateSpaceForScrollbars = false;

    if (this.isSingleItem)
        this.$el.addClass('single-item');
    else
        this.$el.addClass('multi-item');

    this._localData = [];

    this.onPropertyChanged = function(name) {
        if (name === "maxItemCount") {
            this.maxItemCount = this.getPropertyValue('maxItemCount');
        }
    };

    this.initialize = function() {

        var columns = this.getPropertyValue("columns");
        this._columnInfo = { _list:[] };
        this._realColumnInfoList = [];

        if (Array.isArray(columns)) {
            for (var i = 0; i < columns.length; i++) {

                var columnInfo = { type: DefaultControls.ListItem.Label, selectable: true, stretchFactor: 1, label: columns[i].name };

                _.extend(columnInfo, columns[i]);

                columnInfo.index = i;

                var name = columnInfo.name;

                if (_.isUndefined(name))
                    throw 'columns must have a name property.';

                if (_.isUndefined(this._columnInfo[name]) === false)
                    throw "Column names must be unique. The column '" + name + "' has been duplicated.";

                this._columnInfo[name] = columnInfo;
                this._columnInfo._list.push(columnInfo);

                if ( ! columnInfo.isVirtual) {
                    columnInfo.isVirtual = false;
                    this._realColumnInfoList.push(columnInfo);
                }

                var row = 0;
                if (this.showHeaders) {
                    var hCell = this.addCell(i, row, false,  $('<div style="white-space: nowrap;" class="silky-option-list-header">' + columnInfo.label + '</div>'));
                    hCell.setStretchFactor(columnInfo.stretchFactor);
                    hCell.setHorizontalAlign(columnInfo.headerAlign === undefined ? 'left' : columnInfo.headerAlign);
                    hCell.setVerticalAlign('center');
                    hCell.minimumWidth = columnInfo.minWidth;
                    hCell.maximumWidth = columnInfo.maxWidth;
                    hCell.minimumHeight = columnInfo.maxHeight;
                    hCell.maximumHeight = columnInfo.minHeight;
                    row += 1;
                }
                var fillerCell = this.addCell(i, row, false,  $('<div style="white-space: nowrap;" class="list-item-ctrl silky-option-list-filler"> </div>'));
                fillerCell.setStretchFactor(columnInfo.stretchFactor);
                fillerCell.minimumWidth = columnInfo.minWidth;
                fillerCell.maximumWidth = columnInfo.maxWidth;
            }
        }

    };

    this._context = null;
    this.setControlManager = function(context) {
        this._context = context;
    };

    this.refreshItems = function() {
        for (let i = 0; i < this._cells.length; i++) {
            var item = this._cells[i].item;
            let cellInfo = this.getCellInfo(this._cells[i]);
            if (item !== null && item.render) {
                if (cellInfo.columnInfo.isVirtual)
                    item.render(cellInfo.value);
                else
                    item.render();
            }
        }
    };

    this.updateValueCell = function(columnInfo, dispRow, value) {
        var dispColumn = columnInfo.index;
        if (dispRow === this._rowCount - 1)
            this.insertRow(dispRow, 1);
        var cell = this.getCell(dispColumn, dispRow);

        if (cell === null) {
            let format = columnInfo.format;
            let type = columnInfo.type;
            var params = JSON.parse(JSON.stringify(columnInfo));
            params.type = type;
            if (format !== undefined)
                params.format = format;

            params.valuekey = [this.displayRowToRowIndex(dispRow)];
            if (this._realColumnInfoList.length > 1)
                params.valuekey.push(this.rowDataAsArray ? columnInfo.index : columnInfo.name);

            var ctrl = this.createItem(value, params);
            if (params.format === undefined)
                columnInfo.format = ctrl.getPropertyValue('format');

            if (columnInfo.format === null)
                throw "The listitem control '" + columnInfo.type  + "' does not specify a format type.";

            cell = this.addCell(dispColumn, dispRow, false, ctrl);
            cell.minimumWidth = ctrl.getPropertyValue('minWidth');
            cell.maximumWidth = ctrl.getPropertyValue('maxWidth');
            cell.minimumHeight = ctrl.getPropertyValue('maxHeight');
            cell.maximumHeight = ctrl.getPropertyValue('minHeight');
            cell.clickable(columnInfo.selectable);
            if (this.getPropertyValue('stripedRows')) {
                if (this.showHeaders)
                    cell.$el.addClass((this.displayRowToRowIndex(dispRow) % 2 === 0) ? "even-list-row" : "odd-list-row");
                else
                    cell.$el.addClass((this.displayRowToRowIndex(dispRow) % 2 === 0) ? "odd-list-row" : "even-list-row");
            }

            cell.setHorizontalAlign(ctrl.getPropertyValue('horizontalAlignment'));
            cell.setVerticalAlign(ctrl.getPropertyValue('verticalAlignment'));
            cell.setStretchFactor(columnInfo.stretchFactor);

        }
        else if (columnInfo.isVirtual)
            cell.item.render(value);
    };

    this.createItem = function(data, params) {

        var ctrl = this._context.createSubControl(params);
        var self = this;
        ctrl.getDataRenderProperties = function(rdata, format, index) {
            var properties = { root: null, sub: null };
            var localItem = new FormatDef.constructor(data, format);
            if (self.getSupplierItem)
                properties = self.getSupplierItem(localItem);

            return properties;
        };
        if (params.isVirtual === false)
            ctrl.setOption(this.option);
        else
            ctrl.setParent(this);

        ctrl.render(data);
        return ctrl;
    };

    this.updateDisplayRow = function(dispRow, value, onlyVirtual) {
         var columnInfo = null;

         if (this._columnInfo._list.length === 1) {
             columnInfo = this._columnInfo._list[0];
             if (_.isUndefined(columnInfo) === false && (!onlyVirtual || columnInfo.isVirtual))
                 this.updateValueCell(columnInfo, dispRow, value);
         }
        else {
            var self = this;
            if (this.rowDataAsArray) {
                var columnInfoList = self._columnInfo._list;
                for (let i = 0; i < value.length; i++) {
                    if (i >= columnInfoList.length)
                        break;

                    if (!onlyVirtual || columnInfoList[i].isVirtual)
                        self.updateValueCell(columnInfoList[i], dispRow, value[i]);
                }
            }
            else {
                _.each(value, function(value, key, list) {
                    columnInfo = self._columnInfo[key];
                    if (_.isUndefined(columnInfo) === false && (!onlyVirtual || columnInfo.isVirtual))
                        self.updateValueCell(columnInfo, dispRow, value);
                });
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


    this.validateOption = function() {
        var list = this.option.getValue();
        if (_.isUndefined(list) || list === null)
            this.state = 'Uninitialized';
        else
            this.state = 'OK';
    };

    this.selectNextAvaliableItem = function(from) {
        var cell = this.getCell(0, this.rowIndexToDisplayIndex(from >= this._localData.length ? this._localData.length - 1 : from));
        this.selectCell(cell);
    };

    this.rowIndexToDisplayIndex = function(rowIndex) {
        return rowIndex + (this.showHeaders ? 1 : 0);
    };

    this.displayRowToRowIndex = function(dispRow) {
        return dispRow - (this.showHeaders ? 1 : 0);
    };

    this.getCellInfo = function(cell) {
        var info = { };

        var rowIndex = this.displayRowToRowIndex(cell.data.row);

        info.validInfo = true;
        info.removed = false;
        info.cell = cell;
        info.columnInfo = this._columnInfo._list[cell.data.column];
        info.listIndex = rowIndex;
        info.valueIndex = [rowIndex];

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

        var columns = this._columnInfo._list;

        for (var i = 0; i < columns.length; i++) {

            var baseKey = [columns[i].name];
            if (this.rowDataAsArray)
                baseKey = [columns[i].index];
            if (this._columnInfo._list.length === 1)
                baseKey = [];

            var columnFormat = columns[i].format;
            var formats = columnFormat.allFormats(format);
            for (let y = 0; y < formats.length; y++) {
                let key = baseKey.concat(formats[y].key);
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
        var itemPrototype = {};
        if (this.rowDataAsArray)
            itemPrototype = [];

        var columns = this._columnInfo._list;

        if (columns.length === 1)
            return null;

        for (var i = 0; i < columns.length; i++) {
            var key = null;
            if (this.rowDataAsArray)
                key = columns[i].index;
            else
                key = columns[i].name;

            itemPrototype[key] = null;
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
            cellInfo.removed = false;
            this.option.removeAt([cellInfo.listIndex]);
        }
        else {
            this.clearFromOption(cellInfo);
            return false; //not removed but column has been nulled nulled.
        }

        return true;
    };

    this.addRawToOption = function(data, cellKey, insert, format) {
        var hasMaxItemCount = this.maxItemCount >= 0;
        var currentCount = this.option.getLength();
        var overrideValue = cellKey === null || insert === false;

        if (cellKey === null) {
            var lastRow = this.option.getLength() - 1;
            var emptyKey = null;
            for (var r = 0; r <= lastRow; r++) {
                var value = this.option.getValue(r);
                emptyKey = _.isUndefined(r) ? null : this.findEmptyProperty(value, format).key;
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
            cellKey = [this.option.getLength()];

        if (overrideValue === false || this.isRowEmpty(cellKey[0])) {
            var newRow = this.createNewRow();
            if (newRow !== null) {
                if (cellKey.length === 1)
                    this.findEmptyProperty(newRow, format, data);
                else
                    this._setValueWithKey(newRow, cellKey.slice(1), data);
                data = newRow;
            }
            cellKey = [cellKey[0]];
        }

        if (this.isSingleItem === false && hasMaxItemCount && (cellKey[0] > this.maxItemCount - 1 || (overrideValue === false && this.option.getLength() === this.maxItemCount)))
            return false;

        if (this.option.valueInited() === false || this.isSingleItem) {
            cellKey = [];
            if (this.isSingleItem === false)
                data = [data];
        }

        this.setValue(data, cellKey, overrideValue === false);

        return true;
    };

    this.isRowEmpty = function(rowIndex) {
        if (rowIndex >= this.option.getLength())
            return true;

        let value = this.option.getValue([rowIndex]);
        if (value === null || value === undefined)
            return true;

        return false;
    };

    this.formatFromCellKey = function(key) {

        var columnCount = this._columnInfo._list.length;

        var arrayOfObjects = columnCount > 1 && this.rowDataAsArray === false;
        var arrayOfArrays = columnCount > 1 && this.rowDataAsArray === true;
        var multiDimensional = arrayOfObjects || arrayOfArrays;

        if (key.length === 0)
            return null;

        let columnFormat = null;

        if (key.length === 1) {
            if (multiDimensional === false)
                columnFormat = this._columnInfo._list[0].format;
            else
                return null;
        }
        else if (key.length > 1) {
            if (arrayOfArrays)
                columnFormat = this._columnInfo._list[key[1]].format;
            else
                columnFormat = this._columnInfo[key[1]].format;
        }

        if ((key.length === 1 && multiDimensional === false) || (key.length === 2 && multiDimensional === true))
            return columnFormat;

        return columnFormat.getFormat(key.slice(multiDimensional ? 2 : 1));
    };

    //outside -> in
    this.onOptionValueInserted = function(keys, data) {

        this.suspendLayout();
        var dispRow = this.rowIndexToDisplayIndex(keys[0]);
        this.insertRow(dispRow, 1);
        var rowData = this.realToVirtualRowData(this.option.getValue(keys[0]));

        this._localData.splice(keys[0], 0, this.clone(rowData));
        this.updateDisplayRow(dispRow, rowData);
        this.resumeLayout();

    };

    this.onOptionValueRemoved = function(keys, data) {

        this.disposeOfRows(keys[0], 1);
        this._localData.splice(keys[0], 1);

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

    this.onOptionValueChanged = function(keys, data) {
        var list = this.option.getValue();

        this.suspendLayout();

        if (list !== null) {
            var oldLocalCount = this._localData.length;
            let oldLocal = this._localData;
            this._localData = [];
            if (Array.isArray(list)) {
                for (var i = 0; i < list.length; i++) {
                    let rowData = this.realToVirtualRowData(list[i], oldLocal[i]);
                    this.updateDisplayRow(this.rowIndexToDisplayIndex(i), rowData);
                    this._localData.push(this.clone(rowData));
                }
                var countToRemove = oldLocalCount - this._localData.length;
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

        this.resumeLayout();

    };

    this.disposeOfRows = function(rowIndex, count) {

        let displayIndex = this.rowIndexToDisplayIndex(rowIndex);

        for (let r = displayIndex; r < displayIndex + count; r++) {
            let rowCells = this.getRow(r);
            for (let c = 0; c < rowCells.length; c++) {
                let cell = rowCells[c];
                if (cell.item && cell.item.dispose)
                    cell.item.dispose();
            }
        }

        this.removeRow(displayIndex, count);
    };

    this.clone = function(object) {
        return JSON.parse(JSON.stringify(object));
    };

    this.initialize();
};

SuperClass.create(OptionListControl);

module.exports = OptionListControl;
