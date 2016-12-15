'use strict';

var $ = require('jquery');
var _ = require('underscore');
var SelectableLayoutGrid = require('./selectablelayoutgrid');
var OptionControl = require('./optioncontrol');
var FormatDef = require('./formatdef');
var EnumPropertyFilter = require('./enumpropertyfilter');
var SuperClass = require('../common/superclass');

var OptionListControl = function(params) {
    OptionControl.extendTo(this, params);
    SelectableLayoutGrid.extendTo(this);

    this.registerSimpleProperty("columns", null);
    this.registerSimpleProperty("maxItemCount", -1);
    this.registerSimpleProperty("showColumnHeaders", false);
    this.registerSimpleProperty("fullRowSelect", false);
    this.registerSimpleProperty("removeAction", "delete_row", new EnumPropertyFilter(["delete_row", "clear_cell"], "delete_row"));
    this.registerSimpleProperty("height", "normal", new EnumPropertyFilter(["smallest", "small", "normal", "large", "largest"], "normal"));
    this.registerSimpleProperty("rowDataAsArray", false);

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

    this.initialise = function() {

        var columns = this.getPropertyValue("columns");
        this._columnInfo = { _list:[] };

        if (Array.isArray(columns)) {
            for (var i = 0; i < columns.length; i++) {

                var columnInfo = { type: "label", selectable: true, stretchFactor: 1, label: columns[i].name };

                _.extend(columnInfo, columns[i]);

                columnInfo.index = i;

                var name = columnInfo.name;

                if (_.isUndefined(name))
                    throw 'columns must have a name property.';

                if (_.isUndefined(this._columnInfo[name]) === false)
                    throw "Column names must be unique. The column '" + name + "' has been duplicated.";

                this._columnInfo[name] = columnInfo;
                this._columnInfo._list.push(columnInfo);

                var row = 0;
                if (this.showHeaders) {
                    var hCell = this.addCell(i, row, false,  $('<div style="white-space: nowrap;" class="silky-option-list-header">' + columnInfo.label + '</div>'));
                    hCell.setStretchFactor(columnInfo.stretchFactor);
                    hCell.hAlign = 'centre';
                    hCell.vAlign = 'top';
                    row += 1;
                }
                var fillerCell = this.addCell(i, row, false,  $('<div style="white-space: nowrap;" class="list-item-ctrl silky-option-list-filler"> </div>'));
                fillerCell.setStretchFactor(columnInfo.stretchFactor);
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
            if (item !== null && item.render)
                item.render();
        }
    };

    this.updateValueCell = function(columnInfo, dispRow, value) {
        var dispColumn = columnInfo.index;
        if (dispRow === this._rowCount - 1)
            this.insertRow(dispRow, 1);
        var cell = this.getCell(dispColumn, dispRow);

        if (cell === null) {
            let format = columnInfo.format;
            var params = JSON.parse(JSON.stringify(columnInfo));
            if (format !== undefined)
                params.format = format;

            params.valuekey = [this.displayRowToRowIndex(dispRow)];
            if (this._columnInfo._list.length > 1)
                params.valuekey.push(this.rowDataAsArray ? columnInfo.index : columnInfo.name);

            var ctrl = this.createItem(value, params);
            if (params.format === undefined)
                columnInfo.format = ctrl.getPropertyValue('format');

            if (columnInfo.format === null)
                throw "The listitem control '" + columnInfo.type  + "' does not specify a format type.";

            cell = this.addCell(dispColumn, dispRow, false, ctrl);
            cell.clickable(columnInfo.selectable);

            cell.setStretchFactor(columnInfo.stretchFactor);
            cell.hAlign = 'left';
            cell.vAlign = 'centre';
        }
    };

    this.createItem = function(data, params) {

        var ctrl = this._context.createSubControl(params);
        var self = this;
        ctrl.getDataRenderProperties = function(data, format, index) {
            var properties = { root: null, sub: null };
            var localItem = new FormatDef.constructor(data, format);
            if (self.getSupplierItem)
                properties = self.getSupplierItem(localItem);

            return properties;
        };
        ctrl.setOption(this.option);
        ctrl.render();
        return ctrl;
    };

    this.updateDisplayRow = function(dispRow, value) {
         var columnInfo = null;

         if (this._columnInfo._list.length === 1) {
             columnInfo = this._columnInfo._list[0];
             if (_.isUndefined(columnInfo) === false)
                 this.updateValueCell(columnInfo, dispRow, value);
         }
        else {
            var self = this;
            if (this.rowDataAsArray) {
                var columnInfoList = self._columnInfo._list;
                for (let i = 0; i < value.length; i++) {
                    if (i >= columnInfoList.length)
                        break;
                    self.updateValueCell(columnInfoList[i], dispRow, value[i]);
                }
            }
            else {
                _.each(value, function(value, key, list) {
                    columnInfo = self._columnInfo[key];
                    if (_.isUndefined(columnInfo) === false)
                        self.updateValueCell(columnInfo, dispRow, value);
                });
            }
        }
    };

    this.validateOption = function() {
        var list = this.option.getValue();
        if (_.isUndefined(list) || list === null)
            this.state = 'Uninitialised';
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
        else if (this.removeAction === "delete_row") {
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
        var rowData = this.option.getValue(keys[0]);

        this._localData.splice(keys[0], 0, this.clone(rowData));
        this.updateDisplayRow(dispRow, rowData);
        this.resumeLayout();

    };

    this.onOptionValueRemoved = function(keys, data) {

        var dispRow = this.rowIndexToDisplayIndex(keys[0]);
        this.removeRow(dispRow);
        this._localData.splice(keys[0], 1);

    };

    this.onOptionValueChanged = function(keys, data) {
        var list = this.option.getValue();

        this.suspendLayout();

        if (list !== null) {
            var oldLocalCount = this._localData.length;
            this._localData = [];
            if (Array.isArray(list)) {
                for (var i = 0; i < list.length; i++) {
                    this.updateDisplayRow(this.rowIndexToDisplayIndex(i), list[i]);
                    this._localData.push(this.clone(list[i]));
                }
                var countToRemove = this.displayRowToRowIndex(oldLocalCount) - this._localData.length;
                if (countToRemove > 0)
                    this.removeRow(this.rowIndexToDisplayIndex(this._localData.length), countToRemove);
            }
            else if (this.isSingleItem) {
                this._localData[0] = this.clone(list);
                this.updateDisplayRow(this.rowIndexToDisplayIndex(0), list);
            }
        }
        else if (this._localData.length > 0) {
            this.removeRow(this.rowIndexToDisplayIndex(0), this._localData.length);
            this._localData = [];
        }

        this.resumeLayout();

    };

    this.clone = function(object) {
        return JSON.parse(JSON.stringify(object));
    };

    this.initialise();
};

SuperClass.create(OptionListControl);

module.exports = OptionListControl;
