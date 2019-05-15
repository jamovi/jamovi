
'use strict';

const $ = require('jquery');
const _ = require('underscore');
const FormatDef = require('./formatdef');
const SelectableLayoutGrid = require('./selectablelayoutgrid');
const DragNDrop = require('./dragndrop');
const ControlContainer = require('./controlcontainer').container;
const LayoutGrid = require('./layoutgrid').Grid;
const EnumPropertyFilter = require('./enumpropertyfilter');
const SuperClass = require('../common/superclass');
const RequestDataSupport = require('./requestdatasupport');

const LayoutSupplierView = function(params) {

    DragNDrop.extendTo(this);
    ControlContainer.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.setList = function(value) {

        let newItems = [];
        for (let i = 0; i < value.length; i++) {
            let item = value[i];
            for (let j = 0; j < this._items.length; j++) {
                if (this._items[j].value.equalTo(item.value)) {
                    this._items[j].properties = item.properties;
                    item = this._items[j];
                    break;
                }
            }
            item.index = i;
            if (_.isUndefined(item.used))
                item.used = this.numberUsed(item);
            if (_.isUndefined(item.properties))
                item.properties = {};

            newItems.push(item);
        }

        this._items = newItems;


        if (_.isUndefined(this.supplierGrid) === false) {
            this.supplierGrid.suspendLayout();
            this.renderItemList();
            this.filterSuppliersList();
            this.supplierGrid.resumeLayout();
        }

        this.trigger('value_changed');
    };

    this.getList = function() {
        return this._items;
    };

    this.value = function() {
        return this.getList();
    };

    this.setValue = function(value) {
        this.setList(value);
    };

    this._override("onDataChanged", (baseFunction, data) => {
        if (data.dataType !== "columns")
            return;

        if (data.dataInfo.nameChanged || data.dataInfo.measureTypeChanged || data.dataInfo.dataTypeChanged || data.dataInfo.countChanged)
            this.update();
    });

    this.update = function() {
        this.trigger('update');
    };

    this.onPopulate = function() {
    };

    this.registerComplexProperty('value', this.getList, this.setList, 'value_changed');
    this.registerSimpleProperty('persistentItems', false);
    this.registerSimpleProperty('label', null);
    this.registerSimpleProperty('margin', 'normal', new EnumPropertyFilter(['small', 'normal', 'large', 'none'], 'normal'));
    this.registerSimpleProperty('format', null);
    this.registerSimpleProperty('higherOrders', false);

    this._persistentItems = this.getPropertyValue('persistentItems');
    this._higherOrder = this.getPropertyValue('higherOrders');

    this.$el.addClass('silky-options-supplier-group');
    this.$el.addClass('silky-control-margin-' + this.getPropertyValue('margin'));

    this._items = [];
    this._targets = {};
    this._targetCount = 0;
    this._targetFocusMethods = {};

    this.onContainerRendering = function(context) {
        let baseLayout = new LayoutGrid();
        let label = this.getPropertyValue('label');
        if (label !== null)
            baseLayout.addCell(0, 0, true, $('<div style="white-space: nowrap;" class="silky-options-supplier-group-header">' + label + '</div>'));

        this.supplierGrid = new SelectableLayoutGrid();
        this.supplierGrid.$el.addClass('silky-layout-grid multi-item silky-variable-supplier');
        this.supplierGrid.stretchEndCells = false;
        this.supplierGrid._animateCells = true;
        this.supplierGrid.setMinimumHeight(200);
        this.supplierGrid.setMaximumHeight(200);
        this.supplierGrid.setAutoSizeHeight(false);
        this.supplierGrid.allocateSpaceForScrollbars = false;
        this.ignoreTransform = true;
        let cell = baseLayout.addCell(0, label !== null ? 1 : 0, false, this.supplierGrid);
        this.ignoreTransform = false;
        cell.setStretchFactor(1);
        cell.dockContentHeight = true;

        this.setPickupSourceElement(this.supplierGrid.$el);

        this.ignoreTransform = true;
        cell = this.addCell(0, 0, false, baseLayout);
        cell.setStretchFactor(0.5);
        cell.dockContentHeight = true;
        cell.spanAllRows = true;
        this.ignoreTransform = false;

        if (this._items.length > 0) {
            this.supplierGrid.suspendLayout();
            this.renderItemList();
            this.filterSuppliersList();
            this.supplierGrid.resumeLayout();
        }

        this.onPopulate();
    };

    this.rowTransform = function(row, column) {
        return row;
    };

    this.columnTransform = function(row, column) {
        if ( ! this.ignoreTransform)
            return column + 1;

        return column;
    };

    this.gridEntryPosition = {
        row: 0,
        column: 1
    };

    this.getColumnIndexFromName = function(name) {
        if (name === 'aux')
            return 0;

        if (name === 'main')
            return 1;

        return -1;
    };

    this.getPickupItems = function() {
        return this.getSelectedItems();
    };

    this.catchDroppedItems = function(source, items) {

    };

    this.filterItemsForDrop = function(items) {
        let itemsToDrop = [];
        for (let i = 0; i < items.length; i++) {
            itemsToDrop.push(items[i]);
        }
        return itemsToDrop;
    };

    this.inspectDraggedItems = function(source, items) {

    };

    this.dropTargetElement = function() {
        return this.supplierGrid.$el;
    };

    this.getItem = function(index) {
        return this._items[index];
    };

    this.getSelectionCount = function() {
        return this.supplierGrid.selectedCellCount();
    };

    this.getSelectedItems = function() {
        let items = [];
        let selectionCount = this.supplierGrid.selectedCellCount();
        for (let i = 0; i < selectionCount; i++)
            items.push(this.getItem(this.supplierGrid.getSelectedCell(i).data.row));

        return items;
    };

    this.pullItem = function(formatted, use) {
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            if (item.value.equalTo(formatted)) {
                if (_.isUndefined(use) || use === true)
                    item.used += 1;
                return item;
            }
        }
        return null;
    };

    this.pushItem = function(formatted) {
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            if (item.value.equalTo(formatted)) {
                if (item.used > 0)
                    item.used -= 1;
                break;
            }
        }
    };

    this.getItemFromValue = function(formattedValue) {
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            if (item.value.equalTo(formattedValue))
                return item;
        }
        return null;
    };

    this.numberUsed = function(item) {
        let count = 0;
        for (let tid in this._targets) {
            let target = this._targets[tid];
            if (target.itemCount)
                count += target.itemCount(item);
            else {
                throw 'Target is missing an itemCount function';
            }
        }

        return count;
    };

    this.removeTarget = function(target) {
        let id = '_' + target._dropId;
        if ((id in this._targets) === false)
            return;

        this._targetCount -= 1;

        this.unregisterDropTargets(target);
        if (target.unregisterDropTargets || target.dropTargetElement) {
            if (target.unregisterDropTargets)
                target.unregisterDropTargets(this);
            for (let tid in this._targets) {
                if (target.unregisterDropTargets)
                    target.unregisterDropTargets(this._targets[tid]);
                if (target.dropTargetElement && this._targets[tid].unregisterDropTargets)
                    this._targets[tid].unregisterDropTargets(target);
            }
        }

        let gotFocusMethod = this._targetFocusMethods[id];
        target.off('layoutgrid.gotFocus', gotFocusMethod, this);
        delete this._targetFocusMethods[id];
        delete this._targets[id];
    };

    this.addTarget = function(target) {

        let id = '_' + target._dropId;
        if (id in this._targets)
            return false;

        this._targetCount += 1;

        this.registerDropTargets(target);
        if (target.registerDropTargets || target.dropTargetElement) {
            if (target.registerDropTargets)
                target.registerDropTargets(this);
            for (let tid in this._targets) {
                if (target.registerDropTargets)
                    target.registerDropTargets(this._targets[tid]);
                if (target.dropTargetElement && this._targets[tid].registerDropTargets)
                    this._targets[tid].registerDropTargets(target);
            }
        }

        this._targets[id] = target;
        let gotFocusMethod = () => {
            let $activeButton =  this._targets[id].unblockActionButtons();
            this.supplierGrid.clearSelection();
            for (let tid in this._targets) {
                this._targets[tid].blockActionButtons($activeButton, target);
            }
        };

        this._targetFocusMethods[id] = gotFocusMethod;
        target.on('layoutgrid.gotFocus', gotFocusMethod, this);

        return true;
    };

    this.isMultiTarget = function() {
        return this._targetCount > 1;
    };

    this.selectNextAvaliableItem = function(from) {
        let cell = null;
        for (let r = from; r < this._items.length; r++) {
            cell = this.supplierGrid.getCell(0, r);
            if (cell !== null && cell.visible()) {
                this.supplierGrid.selectCell(cell);
                return;
            }
        }
        for (let r1 = from; r1 >= 0; r1--) {
            cell = this.supplierGrid.getCell(0, r1);
            if (cell !== null && cell.visible()) {
                this.supplierGrid.selectCell(cell);
                return;
            }
        }
    };

    this.renderItemList = function() {
        this.supplierGrid.suspendLayout();
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            this['render_' + item.value.format.name](item, i);
        }

        while (this._items.length < this.supplierGrid._rowCount) {
            this.supplierGrid.removeRow(this._items.length);
        }
        this.supplierGrid.resumeLayout();
    };

    this.render_term = function(item, row) {
        let $item = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-term"></div>');
        $item.append('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + item.value.toString() + '</div>');

        let c1 = this.supplierGrid.getCell(0, row);

        if (c1 === null) {
            c1 = this.supplierGrid.addCell(0, row, false,  $item);
            c1.clickable(true);
        }
        else {
            c1.$content.remove();
            c1.setContent($item);
        }

        c1.setStretchFactor(1);

        item.$el = c1.$el;
    };

    this.render_variable = function(item, row) {

        let $item = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-variable"></div>');

        if (item.properties.permitted === false)
            $item.addClass('silky-grayed-out');

        let variableType = 'none';
        if (item.properties.measureType !== undefined)
            variableType = item.properties.measureType;

        let dataType = 'none';
        if (item.properties.dataType !== undefined)
            dataType = item.properties.dataType;

        item.properties.power = 1;

        $item.append('<div style="display: inline-block;" class="silky-variable-type-img silky-variable-type-' + variableType + ' jmv-data-type-' + dataType + '"></div>');
        $item.append('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + item.value.toString() + '</div>');

        if (this._higherOrder) {
            $item.append(
                            `<div class="power-box">
                                <div class="value" contenteditable="true">1</div>
                                <div class="button-box">
                                    <div class="up button"></div>
                                    <div class="down button"></div>
                                </div>
                            </div>`
                        );
            let $powerItem = $item.find('.power-box');
            $powerItem.on('mousedown', (event) => {
                event.stopPropagation();
                event.preventDefault();
            });
            $powerItem.on('mouseup', (event) => {
                event.stopPropagation();
                event.preventDefault();
            });
            $powerItem.on('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
            });
            let $powerValueItem = $item.find('.power-box .value');
            $powerValueItem.on('blur', (event) => {
                let value = parseInt($powerValueItem.text()) - 1;
                if (value < 1 || value == 'NaN')
                    value = 1;
                else if (value > 5)
                    value = 5;
                $powerValueItem.text(value.toString());
                item.properties.power = value;
            });
            let $upItem = $item.find('.power-box .up');
            $upItem.on('mouseup', (event) => {
                let value = parseInt($powerValueItem.text()) + 1;
                if (value > 5 || value == 'NaN')
                    value = 5;
                $powerValueItem.text(value.toString());
                item.properties.power = value;
            });
            let $downItem = $item.find('.power-box .down');
            $downItem.on('mouseup', (event) => {
                let value = parseInt($powerValueItem.text()) - 1;
                if (value < 1 || value == 'NaN')
                    value = 1;
                $powerValueItem.text(value.toString());
                item.properties.power = value;
            });
        }

        let c1 = this.supplierGrid.getCell(0, row);

        if (c1 === null) {
            c1 = this.supplierGrid.addCell(0, row, false,  $item);
            c1.clickable(true);
        }
        else {
            c1.$content.remove();
            c1.setContent($item);
        }
        c1.off('layoutcell.selectionChanged');
        c1.on('layoutcell.selectionChanged', () => {
            if (c1.isSelected()) {
                $item.find('.power-box').addClass('power-visible');
                let $powerValueItem = $item.find('.power-box .value');
                $powerValueItem.text('1');
                item.properties.power = 1;
            }
            else
                $item.find('.power-box').removeClass('power-visible');
        });

        c1.setStretchFactor(1);

        item.$el = c1.$el;
    };

    this.blockFilterProcess = false;

    this.filterSuppliersList = function() {
        if (this.blockFilterProcess)
            return;

        if (this._persistentItems === false) {
            this.supplierGrid.suspendLayout();
            for (let i = 0; i < this._items.length; i++) {
                let item = this._items[i];
                let rowCells = this.supplierGrid.getRow(i);
                for (let j = 0; j < rowCells.length; j++) {
                    let cell = rowCells[j];
                    this.supplierGrid.setCellVisibility(cell, item.used === 0);
                }
            }
            this.supplierGrid.resumeLayout();
        }
    };
};

SuperClass.create(LayoutSupplierView);

module.exports = LayoutSupplierView;
