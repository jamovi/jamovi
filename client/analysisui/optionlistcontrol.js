'use strict';

var $ = require('jquery');
var _ = require('underscore');
var SelectableLayoutGrid = require('./selectablelayoutgrid');
var OptionControl = require('./optioncontrol');
var FormatDef = require('./formatdef');
var Overridable = require('./overridable');
var EnumPropertyFilter = require('./enumpropertyfilter');

var OptionListControl = function(params) {
    OptionControl.extendTo(this, params);
    SelectableLayoutGrid.extendTo(this);
    Overridable.extendTo(this);

    this.registerSimpleProperty("columns", null);
    this.registerSimpleProperty("maxItemCount", -1);
    this.registerSimpleProperty("showColumnHeaders", false);
    this.registerSimpleProperty("fullRowSelect", false);
    this.registerSimpleProperty("removeAction", "delete_row", new EnumPropertyFilter(["delete_row", "clear_cell"], "delete_row"));
    this.registerSimpleProperty("height", "normal", new EnumPropertyFilter(["smallest", "small", "normal", "large", "largest"], "normal"));

    this.maxItemCount = this.getPropertyValue('maxItemCount');
    this.showHeaders = this.getPropertyValue('showColumnHeaders');
    this.fullRowSelect = this.getPropertyValue('fullRowSelect');
    this.removeAction = this.getPropertyValue('removeAction');

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

                var columnInfo = { type: "label", selectable: true, format: null, stretchFactor: 1, label: columns[i].name };

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
                var fillerCell = this.addCell(i, row, false,  $('<div style="white-space: nowrap;" class="silky-option-list-filler"> </div>'));
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
            var params = JSON.parse(JSON.stringify(columnInfo));
            params.valuekey = [this.displayRowToRowIndex(dispRow)];
            if (this._columnInfo._list.length > 1)
                params.valuekey.push(columnInfo.name);

            params.format = columnInfo.format;
            var ctrl =  this.createItem(value, params);

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
            var properties = null;
            var localItem = new FormatDef.constructor(data, format);
            if (self.getSupplierItem) {
                var supplierItem = self.getSupplierItem(localItem);
                if (_.isUndefined(supplierItem) === false && supplierItem !== null)
                    properties = supplierItem.properties;
            }
            return properties;
        };
        ctrl.setOption(this.option);
        ctrl.render();
        return ctrl;
    };

    this.updateDisplayRow = function(dispRow, value) {
         var columnInfo = null;

         if (typeof value !== 'object' || (this._columnInfo._list.length === 1 && this._columnInfo._list[0].format.isValid(value))) {
             columnInfo = this._columnInfo._list[0];
             if (_.isUndefined(columnInfo) === false)
                 this.updateValueCell(columnInfo, dispRow, value);
         }
        else {
            var self = this;
            _.each(value, function(value, key, list) {
                columnInfo = self._columnInfo[key];
                if (_.isUndefined(columnInfo) === false)
                    self.updateValueCell(columnInfo, dispRow, value);
            });
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

        info.cell = cell;
        info.columnInfo = this._columnInfo._list[cell.data.column];
        info.listIndex = rowIndex;
        info.valueIndex = [rowIndex];

        info.value = this._localData[rowIndex];
        if (typeof info.value === 'object' && Array.isArray(info.value) === false) {
            info.value = info.value[info.columnInfo.name];
            info.rowForm = "object";
            info.valueIndex.push(info.columnInfo.name);
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

    this.findEmptyProperty = function(item, formatName, value) {

        var columns = this._columnInfo._list;

        for (var i = 0; i < columns.length; i++) {

            var name = columns[i].name;

            if (columns[i].format.name === formatName && item[name] === null) {
                if (_.isUndefined(value) === false)
                    item[name] = value;
                return name;
            }
        }

        return null;
    };

    this.createEmptyItem = function() {
        var itemPrototype = {};
        var columns = this._columnInfo._list;

        if (columns.length === 1)
            return null;

        for (var i = 0; i < columns.length; i++) {
            var name = columns[i].name;
            itemPrototype[name] = null;
        }

        return itemPrototype;
    };


    this.clearFromOption = function(cellInfo) {
        if (this.isSingleItem)
            this.option.setValue(null);
        else if (cellInfo.rowForm === "primitive")
            this.option.setValue(null, [cellInfo.listIndex]);
        else
            this.option.setValue(null, [cellInfo.listIndex, cellInfo.columnInfo.name]);
    };

    this.removeFromOption = function(cellInfo) {
        if (this.isSingleItem && cellInfo.listIndex !== 0)
            throw 'Index out of list index range.';

        if (this.isSingleItem)
            this.option.setValue(null);
        else if (this.removeAction === "delete_row")
            this.option.removeAt([cellInfo.listIndex]);
        else {
            this.clearFromOption(cellInfo);
            return false; //not removed but column has been nulled nulled.
        }

        return true;
    };

    this.addRawToOption = function(data, key, format) {
        var hasMaxItemCount = this.maxItemCount >= 0;
        var currentCount = this.option.getLength();
        if (typeof data !== 'object') {
            var lastRow = this.option.getLength() - 1;
            var emptyProperty = null;
            var entryRow = lastRow;
            for (var r = 0; r <= lastRow; r++) {
                var value = this.option.getValue(r);
                emptyProperty = _.isUndefined(r) ? null : this.findEmptyProperty(value, format.name);
                if (emptyProperty !== null) {
                    entryRow = r;
                    break;
                }
            }

            if (emptyProperty === null) {
                if (this.isSingleItem === false && hasMaxItemCount && currentCount >= this.maxItemCount)
                    return false;
                var newItem = this.createEmptyItem();
                if (newItem !== null) {
                    emptyProperty = this.findEmptyProperty(newItem, format.name, data);
                    data = newItem;
                }
            }
            else
                key = [entryRow, emptyProperty];
        }
        else if (hasMaxItemCount && currentCount >= this.maxItemCount)
            return false;

        if (this.option.valueInited() === false || this.isSingleItem)
            this.option.setValue(this.isSingleItem ? data : [data]);
        else
            this.option.insertValueAt( data, key );

        return true;
    };

    //outside -> in
    this.onOptionValueInserted = function(keys, data) {

        this.suspendLayout();
        var dispRow = this.rowIndexToDisplayIndex(keys[0]);
        this.insertRow(dispRow, 1);
        var rowData = this.option.getValue(keys);

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

OptionListControl.extendTo = function(target, params) {
    OptionListControl.call(target, params);
};

module.exports = OptionListControl;
