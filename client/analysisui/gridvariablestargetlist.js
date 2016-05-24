'use strict';

var $ = require('jquery');
var _ = require('underscore');
var SelectableLayoutGrid = require('./selectablelayoutgrid');
var GridOptionControl = require('./gridoptioncontrol');
var FormatDef = require('./formatdef');

var GridVariablesTargetList = function(option, params) {
    GridOptionControl.extend(this, option, params);

    this.maxItemCount = _.isUndefined(params.maxItemCount) ? -1 : params.maxItemCount;
    this.isSingleItem = this.maxItemCount === 1;
    this.showHeaders = _.isUndefined(params.showColumnHeaders) ? false : params.showColumnHeaders;
    this.gainOnClick = true;
    this._supplier = null;

    this.targetGrid = new SelectableLayoutGrid();
    this.targetGrid.$el.addClass("silky-layout-grid silky-variable-target");
    this.targetGrid.$el.on('dblclick', null, this, function(event) {
        var self = event.data;
        self.onAddButtonClick();
    });
    this.targetGrid.stretchEndCells = false;

    this._localData = [];

    this.setSupplier = function(supplier) {
        this._supplier = supplier;
        var self = this;
        this._supplier.supplierGrid.on('layoutgrid.gotFocus', function() {
            self.gainOnClick = true;
            self.targetGrid.clearSelection();
        });
        this._supplier.supplierGrid.$el.on('dblclick', function() {
            self.onAddButtonClick();
        });
    };

    this.renderTransferButton = function(grid, row, column) {

        this.$button = $('<button type="button" class="silky-option-variable-button"><span class="mif-arrow-right"></span></button>');
        var self = this;
        this.$button.click(function(event) {
            self.onAddButtonClick();
        });

        grid.addCell(column, row, true, this.$button);

        return { height: 1, width: 1 };
    };

    this.onRender = function(grid, row, column) {

        var self = this;
        var id = this.option.getName();
        var label = this.getParam('label');
        if (label === null)
            label = this.getParam('name');
        var hasSupplier = this._supplier !== null;

        grid.addCell(hasSupplier ? column + 1 : column, row, true, $('<div style="white-space: nowrap; ">' + label + '</div>'));

        if (hasSupplier === true)
            this.renderTransferButton(grid, row + 1, column);

        //this.targetGrid = new LayoutGrid({ className: "silky-layout-grid silky-variable-target" });
        this.targetGrid._animateCells = true;
        this.targetGrid.allocateSpaceForScrollbars = false;
        this.targetGrid.setCellBorders();
        this.targetGrid.$el.css("overflow", "auto");
        if (this.isSingleItem)
            this.targetGrid.setFixedHeight(20);
        else
            this.targetGrid.setFixedHeight(100);
        this.targetGrid.setDockWidth(true);
        this.targetGrid.on('layoutgrid.lostFocus layoutgrid.gotFocus', function() {
            self.onSelectionChanged();
        });
        var cell = grid.addLayout("target", column + 1, row + 1, false, this.targetGrid);
        cell.horizontalStretchFactor = 0.5;
        cell.dockContentWidth = true;
        cell.dockContentHeight = true;

        var columns = this.params.columns;
        this._columnInfo = {_list:[]};

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
                    var hCell = this.targetGrid.addCell(i, 0, false,  $('<div style="white-space: nowrap;" class="silky-listview-header">' + columnInfo.label + '</div>'));
                    hCell.horizontalStretchFactor = columnInfo.stretchFactor;//this.cellStrechFactor;
                    hCell.hAlign = 'centre';
                }
            }
        }

        return { height: 2, width: 2 };
    };

    this.onSelectionChanged = function() {
        var gainOnClick = this.targetGrid.hasFocus === false;
        this.gainOnClick = gainOnClick;
        var $span = this.$button.find('span');
        $span.addClass(gainOnClick ? 'mif-arrow-right' : 'mif-arrow-left');
        $span.removeClass(gainOnClick ? 'mif-arrow-left' : 'mif-arrow-right');
    };

    this.renderCell = function(grid, value, columnInfo, dispRow) {
        var c = columnInfo.index;
        var cell = grid.getCell(c, dispRow);

        if (columnInfo.formatName === null)
            columnInfo.formatName = FormatDef.infer(value).name;

        var displayValue = '';
        if (value !== null && columnInfo.formatName !== null) {
            displayValue = 'error';
            var columnFormat = FormatDef[columnInfo.formatName];
            if (columnFormat.isValid(value)) {
                displayValue = columnFormat.toString(value);
                var formattedValue = new FormatDef.constructor(value, columnFormat);
                if (this._supplier !== null)
                    this._supplier.pullItem(formattedValue);
            }
        }

        var $contents = null;
        if (columnInfo.readOnly)
            $contents = $('<div style="white-space: nowrap; ">' + displayValue + '</div>');
        else
            $contents = $('<input class="silky-option-input silky-option-value silky-option-short-text" style="display: inline;" type="text" value="' + displayValue + '"/>');

        if (cell === null) {
            cell = grid.addCell(c, dispRow, false, $contents);
            cell.clickable(columnInfo.readOnly);
        }
        else {
            cell.setContent($contents);
            cell.render();
        }

        cell.horizontalStretchFactor = columnInfo.stretchFactor;
        cell.hAlign = 'left';
        cell.vAlign = 'centre';
    };

    this.updateItem = function(item, grid, dispRow) {
         var self = this;
         var columnInfo = null;

         if (typeof item !== 'object') {
             columnInfo = self._columnInfo._list[0];
             if (_.isUndefined(columnInfo))
                 return;

             this.renderCell(grid, item, columnInfo, dispRow);
         }
        else {
            _.each(item, function(value, key, list) {
                columnInfo = self._columnInfo[key];
                if (_.isUndefined(columnInfo))
                    return;

                self.renderCell(grid, value, columnInfo, dispRow);
            });
        }
    };

    this.validateOption = function() {
        var list = this.option.getValue();
        if (_.isUndefined(list) || list === null)
            this.state = 'Uninitialised';
        else if (Array.isArray(list))
            this.state = 'OK';
        else
            this.state = 'Invalid';
    };

    this.onAddButtonClick = function() {
        var hasMaxItemCount = this.maxItemCount >= 0;
        if (this.gainOnClick) {
            var selectedCount = this._supplier.supplierGrid.selectedCellCount();
            if (selectedCount > 0) {
                this.targetGrid.suspendLayout();
                this.option.beginEdit();
                for (var i = 0; i < selectedCount; i++) {
                    var currentCount = this.option.getLength();
                    var selected = this._supplier.getSelectedItem(i).value;
                    var key = [this.option.getLength()];
                    var data = selected.raw;
                    if (typeof data !== 'object') {
                        var value = this.option.getValue(this.option.getLength() - 1);
                        var emptyProperty = _.isUndefined(value) ? null : this.findEmptyProperty(value, selected.format.name);
                        if (emptyProperty === null) {
                            if (hasMaxItemCount && currentCount >= this.maxItemCount)
                                break;
                            var newItem = this.createEmptyItem();
                            if (newItem !== null) {
                                emptyProperty = this.findEmptyProperty(newItem, selected.format.name, data);
                                data = newItem;
                            }
                        }
                        else
                            key = [this.option.getLength() - 1, emptyProperty];
                    }
                    else if (hasMaxItemCount && currentCount >= this.maxItemCount)
                        break;

                    this.option.insertValueAt( data, key );
                }
                this.option.endEdit();
                this.targetGrid.resumeLayout();
            }
        }
        else if (this.targetGrid.selectedCellCount() > 0) {
            var startRow = -1;
            var length = 0;
            this.targetGrid.suspendLayout();
            this.option.beginEdit();
            while (this.targetGrid.selectedCellCount() > 0) {
                var cell = this.targetGrid.getSelectedCell(0);
                this.option.removeAt([this.displayRowToRowIndex(cell.data.row)]);
            }
            this._supplier.filterSuppliersList();
            this.option.endEdit();
            this.targetGrid.resumeLayout();
        }
    };

    this.rowIndexToDisplayIndex = function(rowIndex) {
        return rowIndex + (this.showHeaders ? 1 : 0);
    };

    this.displayRowToRowIndex = function(dispRow) {
        return dispRow - (this.showHeaders ? 1 : 0);
    };

    this.pushRowsBackToSupplier = function(rowIndex, count) {
        count = _.isUndefined(count) ? 1 : count;
        for (var row = rowIndex; row < rowIndex + count; row++) {
            var rowCells = this.targetGrid.getRow(this.rowIndexToDisplayIndex(row));
            for (var c = 0; c < rowCells.length; c++) {
                var rowCell = rowCells[c];
                var columnInfo = this._columnInfo._list[rowCell.data.column];
                var cellInfo = this.getCellInfo(rowCell);
                var formattedValue = new FormatDef.constructor(cellInfo.value, cellInfo.format);
                this._supplier.pushItem(formattedValue);
            }
        }
    };

    this.getCellInfo = function(cell) {
        var info = { };

        var rowIndex = this.displayRowToRowIndex(cell.data.row);

        info.cell = cell;
        info.columnInfo = this._columnInfo._list[cell.data.column];

        info.value = this._localData[rowIndex];
        if (typeof info.value === 'object')
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


    //outside -> in
    this.onOptionValueInserted = function(keys, data) {

        var dispIndex = this.rowIndexToDisplayIndex(keys[0]);
        this.targetGrid.insertRow(dispIndex, 1);
        var item = this.option.getValue(keys);
        this._localData.splice(keys[0], 0, item);
        this.updateItem(item, this.targetGrid, dispIndex);
        this.targetGrid.render();

        if (this._supplier !== null)
            this._supplier.filterSuppliersList();
    };

    this.onOptionValueRemoved = function(keys, data) {

        var dispIndex = this.rowIndexToDisplayIndex(keys[0]);
        if (this._supplier !== null)
            this.pushRowsBackToSupplier(keys[0], 1);
        this.targetGrid.removeRow(dispIndex);

        this._localData.splice(keys[0], 1);

        if (this._supplier !== null)
            this._supplier.filterSuppliersList();
    };

    this.onOptionValueChanged = function(keys, data) {
        var list = this.option.getValue();
        if (Array.isArray(list)) {
            this.targetGrid.suspendLayout();
            if (this._supplier !== null)
                this.pushRowsBackToSupplier(0, this._localData.length);
            this._localData = [];

            for (var i = 0; i < list.length; i++) {
                var dispIndex = this.rowIndexToDisplayIndex(i);
                this.updateItem(list[i], this.targetGrid, dispIndex);
                this._localData.push(list[i]);
            }

            var countToRemove = this.displayRowToRowIndex(this.targetGrid._rowCount) - this._localData.length;
            this.targetGrid.removeRow(this._localData.length, countToRemove);

            if (this._localData.length > 0)
                this.targetGrid.render();

            this.targetGrid.resumeLayout();

            if (this._supplier !== null)
                this._supplier.filterSuppliersList();
        }
    };
};

module.exports = GridVariablesTargetList;
