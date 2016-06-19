'use strict';

var $ = require('jquery');
var _ = require('underscore');
var SelectableLayoutGrid = require('./selectablelayoutgrid');
var OptionControl = require('./optioncontrol');
var FormatDef = require('./formatdef');
var Overridable = require('./overridable');

var OptionListControl = function(option, params) {
    OptionControl.extendTo(this, option, params);
    SelectableLayoutGrid.extendTo(this);
    Overridable.extendTo(this);

    this.registerSimpleProperty("columns", null);
    this.registerSimpleProperty("maxItemCount", -1);
    this.registerSimpleProperty("showColumnHeaders", false);

    this.maxItemCount = this.getPropertyValue('maxItemCount');
    this.showHeaders = this.getPropertyValue('showColumnHeaders');

    this.isSingleItem = this.maxItemCount === 1;

    this.$el.addClass("silky-option-list");
    this.stretchEndCells = false;
    this._animateCells = true;
    this.allocateSpaceForScrollbars = false;

    if (this.isSingleItem)
        this.$el.addClass('single-item');
    else
        this.$el.addClass('multi-item');

    this._localData = [];

    this.initialise = function() {

        var columns = this.getPropertyValue("columns");
        this._columnInfo = { _list:[] };

        if (Array.isArray(columns)) {
            for (var i = 0; i < columns.length; i++) {

                var columnInfo = { readOnly: true, formatName: null, stretchFactor: 1, label: columns[i].name };

                _.extend(columnInfo, columns[i]);

                columnInfo.index = i;

                var name = columnInfo.name;

                if (_.isUndefined(name))
                    throw 'columns must have a name property.';

                if (_.isUndefined(this._columnInfo[name]) === false)
                    throw "Column names must be unique. The column '" + name + "' has been duplicated.";

                this._columnInfo[name] = columnInfo;
                this._columnInfo._list.push(columnInfo);

                if (this.showHeaders) {
                    var hCell = this.addCell(i, 0, false,  $('<div style="white-space: nowrap;" class="silky-option-list-header">' + columnInfo.label + '</div>'));
                    hCell.setStretchFactor(columnInfo.stretchFactor);
                    hCell.hAlign = 'centre';
                }
            }
        }
    };

    this.updateValueCell = function(columnInfo, dispRow, value) {
        var dispColumn = columnInfo.index;
        var cell = this.getCell(dispColumn, dispRow);

        if (columnInfo.formatName === null)
            columnInfo.formatName = FormatDef.infer(value).name;

        var supplierItem = null;
        var displayValue = '';
        var localItem = null;
        if (value !== null && columnInfo.formatName !== null) {
            displayValue = 'error';
            var columnFormat = FormatDef[columnInfo.formatName];
            if (columnFormat.isValid(value)) {
                displayValue = columnFormat.toString(value);
                localItem = new FormatDef.constructor(value, columnFormat);
                if (this.getSupplierItem)
                    supplierItem = this.getSupplierItem(localItem);
            }
        }

        var $contents = null;
        var renderFunction = this['renderItem_' + columnInfo.formatName];
        if (localItem !== null && _.isUndefined(renderFunction) === false)
            $contents = renderFunction.call(this, displayValue, columnInfo.readOnly, localItem, supplierItem);
        else
            $contents = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-' + columnInfo.formatName + '">' + displayValue + '</div>');

        if (cell === null) {
            cell = this.addCell(dispColumn, dispRow, false, $contents);
            cell.clickable(columnInfo.readOnly);
        }
        else
            cell.setContent($contents);

        cell.setStretchFactor(columnInfo.stretchFactor);
        cell.hAlign = 'left';
        cell.vAlign = 'centre';
    };

    this.renderItem_variable = function(displayValue, readOnly, localItem, supplierItem) {
        var imageClasses = 'silky-variable-type-img';
        if (_.isUndefined(supplierItem) === false && supplierItem !== null && _.isUndefined(supplierItem.properties.type) === false)
            imageClasses = imageClasses + ' silky-variable-type-' + supplierItem.properties.type;

        var $item = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-variable"></div>');
        $item.append('<div style="display: inline-block; overflow: hidden;" class="' + imageClasses + '"></div>');
        $item.append('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + displayValue + '</div>');

        return $item;
    };

    this.updateDisplayRow = function(dispRow, value) {
         var columnInfo = null;

         if (typeof value !== 'object' || (this._columnInfo._list.length === 1 && FormatDef[this._columnInfo._list[0].formatName].isValid(value))) {
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

        info.value = this._localData[rowIndex];
        if (typeof info.value === 'object' && Array.isArray(info.value) === false)
            info.value = info.value[info.columnInfo.name];

        if (info.columnInfo.formatName === null) {
            info.format = FormatDef.infer(info.value);
            info.columnInfo.formatName = info.format.name;
        }
        else
            info.format = FormatDef[info.columnInfo.formatName];

        return info;
    };

    this.findEmptyProperty = function(item, formatName, value) {

        var columns = this._columnInfo._list;

        for (var i = 0; i < columns.length; i++) {

            var name = columns[i].name;

            if (columns[i].formatName === formatName && item[name] === null) {
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

    this.removeFromOption = function(index) {
        if (this.isSingleItem && index !== 0)
            throw 'Index out of list index range.';

        if (this.isSingleItem)
            this.option.setValue(null);
        else
            this.option.removeAt([index]);
    };

    this.addRawToOption = function(data, key, format) {
        var hasMaxItemCount = this.maxItemCount >= 0;
        var currentCount = this.option.getLength();
        if (typeof data !== 'object') {
            var lastRow = this.option.getLength() - 1;
            var emptyProperty = null;
            if (lastRow >= 0) {
                var value = this.option.getValue(lastRow);
                emptyProperty = _.isUndefined(value) ? null : this.findEmptyProperty(value, format.name);
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
                key = [lastRow, emptyProperty];
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

        this._localData.splice(keys[0], 0, rowData);
        this.updateDisplayRow(dispRow, rowData);
        this.resumeLayout();

    };

    this.onOptionValueRemoved = function(keys, data) {

        var dispRow = this.rowIndexToDisplayIndex(keys[0]);
        this.removeRow(dispRow);
        this._localData.splice(keys[0], 1);

    };

    this.onOptionValueChanged = function(keys, data) {
        this.suspendLayout();

        this._localData = [];

        var list = this.option.getValue();
        if (list !== null) {
            if (Array.isArray(list)) {
                for (var i = 0; i < list.length; i++) {
                    this.updateDisplayRow(this.rowIndexToDisplayIndex(i), list[i]);
                    this._localData.push(list[i]);
                }
                var countToRemove = this.displayRowToRowIndex(this._rowCount) - this._localData.length;
                this.removeRow(this.rowIndexToDisplayIndex(this._localData.length), countToRemove);
            }
            else if (this.isSingleItem) {
                this._localData[0] = list;
                this.updateDisplayRow(this.rowIndexToDisplayIndex(0), list);
            }
        }
        else
            this.removeRow(this.rowIndexToDisplayIndex(0), this._rowCount);

        this.resumeLayout();

    };

    this.initialise();
};

OptionListControl.extendTo = function(target, option, params) {
    OptionListControl.call(target, option, params);
};

module.exports = OptionListControl;
