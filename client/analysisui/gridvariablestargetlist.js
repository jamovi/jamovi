'use strict';

var $ = require('jquery');
var _ = require('underscore');
var OptionListControl = require('./optionlistcontrol');
var GridOptionControl = require('./gridoptioncontrol');
var FormatDef = require('./formatdef');
var DragNDrop = require('./dragndrop');

var GridVariablesTargetList = function(params) {
    GridOptionControl.extend(this, params);
    DragNDrop.extendTo(this);

    this.registerSimpleProperty("maxItemCount", -1);

    this.gainOnClick = true;
    this._supplier = null;
    this._actionsBlocked = false;

    this.targetGrid = new OptionListControl(params);
    this.targetGrid.$el.addClass("silky-variable-target");
    this.targetGrid.$el.on('dblclick', null, this, function(event) {
        var self = event.data;
        self.onAddButtonClick();
    });

    this.onPropertyChanged = function(name) {
        if (name === "maxItemCount") {
            var value = this.getPropertyValue(name);
            this.targetGrid.setPropertyValue(name, value);
        }
    };

    // Drag/Drop methods
    this.setPickupSourceElement(this.targetGrid.$el);

    this.getPickupItems = function() {
        var items = [];
        for (var i = 0; i < this.targetGrid.selectedCellCount(); i++) {
            var cell = this.targetGrid.getSelectedCell(i);
            var cellInfo = this.targetGrid.getCellInfo(cell);
            items.push({ value: new FormatDef.constructor(cellInfo.value, cellInfo.format), cellInfo: cellInfo, $el: cell.$el });
        }
        return items;
    };

    this.onItemsDropping = function(items) {
        if (items === null || items.length === 0)
            return;

        this.beginPropertyEdit();
        this.option.beginEdit();
        for (var i = 0; i < items.length; i++) {
            var cellInfo = items[i].cellInfo;
            if (this.targetGrid.removeFromOption(cellInfo)) {
                for (var j = i + 1; j < items.length; j++) {
                    if (items[j].cellInfo.listIndex > cellInfo.listIndex)
                        items[j].cellInfo.listIndex -= 1;
                    else if (items[j].cellInfo.listIndex === cellInfo.listIndex) {
                        items.splice(j, 1);
                        j -= 1;
                    }
                }
            }
        }
        this.option.endEdit();
        this.endPropertyEdit();
    };

    // Catching methods
    this.catchDroppedItems = function(source, items) {
        if (items === null || items.length === 0)
            return;

        this.beginPropertyEdit();
        this.option.beginEdit();
        for (var i = 0; i < items.length; i++)
            this.targetGrid.addRawToOption(items[i].value.raw, [this.option.getLength()], items[i].value.format);
        this.option.endEdit();
        this.endPropertyEdit();
    };

    this.filterItemsForDrop = function(items) {
        var itemsToDrop = [];
        for (var i = 0; i < items.length; i++) {
            itemsToDrop.push(items[i]);
            if (this.targetGrid.isSingleItem)
                break;
        }
        return itemsToDrop;
    };

    this.inspectDraggedItems = function(source, items) {

    };

    this.dropTargetElement = function() {
        return this.targetGrid.$el;
    };

    this.setSupplier = function(supplier) {
        this._supplier = supplier;
        var self = this;
        this._supplier.supplierGrid.on('layoutgrid.gotFocus', function() {
            self.gainOnClick = true;
            self.targetGrid.clearSelection();
            self.unblockActionButtons();
        });
        this._supplier.supplierGrid.$el.on('dblclick', function() {
            if (self._supplier.isMultiTarget() === false)
                self.onAddButtonClick();
        });
    };

    this.blockActionButtons = function() {
        this.$button.prop('disabled', true);
        this.targetGrid.clearSelection();
        this._actionsBlocked = true;
    };

    this.unblockActionButtons = function() {
        this.$button.prop('disabled', false);
        this._actionsBlocked = false;
    };

    this.renderTransferButton = function(grid, row, column) {

        this.$button = $('<button type="button" class="silky-option-variable-button"><span class="mif-arrow-right"></span></button>');
        var self = this;
        this.$button.click(function(event) {
            if (self._actionsBlocked === false)
                self.onAddButtonClick();
        });

        grid.addCell(column, row, true, this.$button);

        return { height: 1, width: 1 };
    };

    this.onRenderToGrid = function(grid, row, column) {

        this.targetGrid.setOption(this.option);

        if (grid.addTarget) {
            this.setSupplier(grid);
            grid.addTarget(this);
        }

        var self = this;
        var id = this.option.getName();
        var label = this.getPropertyValue('label');
        var hasSupplier = this._supplier !== null;

        if (label !== null)
            grid.addCell(hasSupplier ? column + 1 : column, row, true, $('<div style="white-space: nowrap;" class="silky-options-h3">' + label + '</div>'));

        if (hasSupplier === true)
            this.renderTransferButton(grid, row + 1, column);

        this.targetGrid.setAutoSizeHeight(false);

        this.targetGrid.on('layoutgrid.lostFocus layoutgrid.gotFocus', function() {
            self.onSelectionChanged();
        });
        var cell = grid.addLayout(column + 1, row + 1, false, this.targetGrid);
        cell.setStretchFactor(0.5);
        if (this.targetGrid.isSingleItem === false)
            cell.dockContentHeight = true;

        return { height: 2, width: 2 };
    };

    this.onSelectionChanged = function() {
        var gainOnClick = this.targetGrid.hasFocus === false;
        this.gainOnClick = gainOnClick;
        var $span = this.$button.find('span');
        $span.addClass(gainOnClick ? 'mif-arrow-right' : 'mif-arrow-left');
        $span.removeClass(gainOnClick ? 'mif-arrow-left' : 'mif-arrow-right');
    };

    var self = this;
    this.targetGrid.getSupplierItem = function(localItem) {
        return self._supplier.pullItem(localItem);
    };

    this.onAddButtonClick = function() {
        this._supplier.blockFilterProcess = true;
        this.targetGrid.suspendLayout();

        this.option.beginEdit();
        this.beginPropertyEdit();
        var postProcessSelectionIndex = 0;
        var postProcessList = null;
        if (this.gainOnClick) {
            var selectedCount = this._supplier.supplierGrid.selectedCellCount();
            if (selectedCount > 0) {
                for (var i = 0; i < selectedCount; i++) {
                    var selectedItem = this._supplier.getSelectedItem(i);
                    if (selectedCount === 1)
                        postProcessSelectionIndex = selectedItem.index;
                    var selectedValue = selectedItem.value;
                    var key = [this.option.getLength()];
                    var data = selectedValue.raw;
                    if (this.targetGrid.addRawToOption(data, key, selectedValue.format) === false)
                        break;
                }
                postProcessList = this._supplier;
            }
        }
        else if (this.targetGrid.selectedCellCount() > 0) {
            var startRow = -1;
            var length = 0;
            var selectionCount = this.targetGrid.selectedCellCount();
            var index = 0;
            while (this.targetGrid.selectedCellCount() > index) {
                var cell = this.targetGrid.getSelectedCell(index);
                if (selectionCount === 1)
                    postProcessSelectionIndex = this.targetGrid.displayRowToRowIndex(cell.data.row);

                if (this.targetGrid.removeFromOption(this.targetGrid.getCellInfo(cell)) === false)
                    index += 1;
            }
            postProcessList = this.targetGrid;
        }

        this.endPropertyEdit();
        this.option.endEdit();

        this.targetGrid.resumeLayout();
        this._supplier.blockFilterProcess = false;
        this._supplier.filterSuppliersList();

        postProcessList.selectNextAvaliableItem(postProcessSelectionIndex);
    };

    this.pushRowsBackToSupplier = function(rowIndex, count) {
        count = _.isUndefined(count) ? 1 : count;
        for (var row = rowIndex; row < rowIndex + count; row++) {
            var rowCells = this.targetGrid.getRow(this.targetGrid.rowIndexToDisplayIndex(row));
            for (var c = 0; c < rowCells.length; c++) {
                var rowCell = rowCells[c];
                var columnInfo = this.targetGrid._columnInfo._list[rowCell.data.column];
                var cellInfo = this.targetGrid.getCellInfo(rowCell);
                var formattedValue = new FormatDef.constructor(cellInfo.value, cellInfo.format);
                this._supplier.pushItem(formattedValue);
            }
        }
    };

    //overrideing functions in the target grid
    this.targetGrid._override('onOptionValueInserted', function(baseFunction, keys, data) {
        baseFunction.call(self.targetGrid, keys, data);

        if (self._supplier !== null)
            self._supplier.filterSuppliersList();
    });

    //overrideing functions in the target grid
    this.targetGrid._override('onOptionValueRemoved', function(baseFunction, keys, data) {
        if (self._supplier !== null)
            self.pushRowsBackToSupplier(keys[0], 1);

        baseFunction.call(self.targetGrid, keys, data);

        if (self._supplier !== null)
            self._supplier.filterSuppliersList();
    });

    //overrideing functions in the target grid
    this.targetGrid._override('onOptionValueChanged', function(baseFunction, keys, data) {
        if (self._supplier !== null)
            self.pushRowsBackToSupplier(0, this._localData.length);

        baseFunction.call(self.targetGrid, keys, data);

        if (self._supplier !== null)
            self._supplier.filterSuppliersList();
    });

};

module.exports = GridVariablesTargetList;
