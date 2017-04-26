'use strict';

const $ = require('jquery');
const _ = require('underscore');
const OptionListControl = require('./optionlistcontrol');
const GridControl = require('./gridcontrol');
const FormatDef = require('./formatdef');
const DragNDrop = require('./dragndrop');
const EnumPropertyFilter = require('./enumpropertyfilter');
const SuperClass = require('../common/superclass');
const Backbone = require('backbone');
const ControlContainer = require('./controlcontainer').container;

const TargetListSupport = function(supplier) {
    DragNDrop.extendTo(this);

    this._supplier = supplier;

    this.registerSimpleProperty("itemDropBehaviour", "insert", new EnumPropertyFilter(["overwrite", "insert", "emptyspace"], "insert"));

    this._findValueWithKey = function(data, key) {
        let value = data;
        for (let i = 0; i < key.length; i++)
            value = value[key[i]];

        return value;
    };

    this.getPickupItems = function() {
        let items = [];
        for (let i = 0; i < this.selectedCellCount(); i++) {
            let cell = this.getSelectedCell(i);
            if (cell.item && cell.item._isInheritedFrom(GridTargetContainer))
                continue;
            let cellInfo = this.getCellInfo(cell);
            if (cellInfo.value !== null && cellInfo.value !== undefined) {
                let formattedValue = new FormatDef.constructor(cellInfo.value, cellInfo.format);
                let pickupItem = { value: formattedValue, cellInfo: cellInfo, $el: cell.$el };
                let item = this._supplier.getItemFromValue(formattedValue);
                if (item !== null)
                    pickupItem.properties = item.properties;
                items.push(pickupItem);
            }
        }
        return items;
    };

    this.onDragDropStart = function() {
        this.getOption().beginEdit();
        this.beginPropertyEdit();
    };

    this.onDragDropEnd = function() {
        this.endPropertyEdit();
        this.getOption().endEdit();
    };

    this.onItemsDropping = function(items, intoSelf) {
        let list = [];
        while (items.length > 0)
            list.push(items.shift());

        for (let i = 0; i < list.length; i++) {
            let cellInfo = list[i].cellInfo;
            if (cellInfo.removed === false) {

                if (this.removeFromOption(cellInfo)) {
                    for (let j = i + 1; j < list.length; j++) {
                        if (list[j].cellInfo.listIndex > cellInfo.listIndex) {
                            list[j].cellInfo.listIndex -= 1;
                            list[j].cellInfo.valueIndex[list[j].cellInfo.valueIndex.length] -= 1;
                        }
                        else if (list[j].cellInfo.listIndex === cellInfo.listIndex) {
                            list.splice(j, 1);
                            j -= 1;
                        }
                    }
                }

                //only drop the compatible formats
                let formats = cellInfo.format.allFormats();
                for (let sf = 0; sf < formats.length; sf++) {
                    let formattedValue = new FormatDef.constructor(this._findValueWithKey(cellInfo.value, formats[sf].key), formats[sf].format);
                    let pickupItem = { value: formattedValue, cellInfo: cellInfo, $el: cellInfo.cell.$el };
                    let item = this._supplier.getItemFromValue(formattedValue);
                    if (item !== null) {
                        pickupItem.properties = item.properties;
                        items.push(pickupItem);
                    }
                }
            }
        }
    };

    this.checkDropBehaviour = function() {
        let dropBehaviour = this.getPropertyValue("itemDropBehaviour");

        let hasMaxItemCount = this.maxItemCount >= 0;
        if (hasMaxItemCount && this.getOption().getLength(this.getValueKey()) >= this.maxItemCount)
            dropBehaviour = "overwrite";

        return dropBehaviour;
    };

    // Catching methods
    this.catchDroppedItems = function(source, items, xpos, ypos) {
        let dropBehaviour = this.checkDropBehaviour();

        let cell = this.cellFromPosition(xpos, ypos);
        let pos = null;
        let destFormat = null;
        let onCell = false;
        if (dropBehaviour !== "emptyspace" && cell !== null) {
            let cellInfo = this.getCellInfo(cell);
            pos = this.getRelativeKey(cellInfo.valueIndex);
            destFormat = cellInfo.format;
            onCell = cellInfo.isValueCell;
        }
        let insert = dropBehaviour === "insert";

        let itemsList = items;
        let overflowStartIndex = -1;
        if (this.isSingleItem && itemsList.length > 1) {
            itemsList = [items[0]];
            overflowStartIndex = 1;
        }

        for (let i = 0; i < itemsList.length; i++) {
            if (onCell) {
                let subkeys = destFormat.allFormats(itemsList[i].value.format);
                for (let x = 0; x < subkeys.length; x++) {
                    let key = pos.concat(subkeys[x].key);
                    let item = itemsList[i++];
                    if (this.addRawToOption(item.value.raw, key, insert, item.value.format) === false) {
                        overflowStartIndex = i;
                        break;
                    }
                    insert = false;
                    if (i >= itemsList.length)
                        break;
                }
            }
            else {
                if (this.addRawToOption(itemsList[i].value.raw, null, false, itemsList[i].value.format) === false) {
                    overflowStartIndex = i;
                    break;
                }
            }
            pos = null;
            destFormat = null;
            insert = false;
            onCell = false;
        }

        if (overflowStartIndex > -1)
            this.trigger('dropoverflow', source, items.slice(overflowStartIndex));
    };

    this.filterItemsForDrop = function(items, intoSelf, xpos, ypos) {
        return this.preprocessItems(items, intoSelf);
    };

    this._$hoverCell = null;

    this.onDraggingLeave = function() {
        if (this._$hoverCell !== null) {
            this._$hoverCell.removeClass("item-hovering");
            this._$hoverCell.removeClass("item-overwrite-on-drop");
            this._$hoverCell.removeClass("item-insert-on-drop");
            this._$hoverCell.removeClass("item-emptyspace-on-drop");
            this._$hoverCell = null;
        }
    };

    this.hasSubDropTarget = function(xpos, ypos) {
        let cell =  this.cellFromPosition(xpos, ypos);
        let subDroppable = null;
        if (cell !== null && cell.item !== null && cell.item._dropId !== undefined)
            subDroppable = cell.item;
        return subDroppable;
    };

    this.onDraggingOver = function(xpos, ypos) {
        let dropBehaviour = this.checkDropBehaviour();
        if (this._$hoverCell !== null) {
            this._$hoverCell.removeClass("item-hovering");
            this._$hoverCell.removeClass("item-overwrite-on-drop");
            this._$hoverCell.removeClass("item-insert-on-drop");
            this._$hoverCell.removeClass("item-emptyspace-on-drop");
            this._$hoverCell = null;
        }

        let cell =  this.cellFromPosition(xpos, ypos);
        let cellInfo = null;
        if (cell !== null)
            cellInfo = this.getCellInfo(cell);

        if (cellInfo !== null) {

            let hasMaxItemCount = this.maxItemCount >= 0;
            if (cellInfo.isValueCell === false && hasMaxItemCount && this.getOption().getLength(this.getValueKey()) >= this.maxItemCount)
                return;

            if (cellInfo.isValueCell === false)
                dropBehaviour = 'insert';

            this._$hoverCell = cell.$content;
            this._$hoverCell.addClass("item-hovering");
            this._$hoverCell.addClass("item-" + dropBehaviour + "-on-drop");
        }
    };

    this.inspectDraggedItems = function(source, items) {

    };

    this.dropTargetElement = function() {
        let parent = this.getPropertyValue("_parentControl");
        let $dropArea = this.$el;
        while (parent !== null) {
            let isTargetChain = false;
            if (parent.hasProperty("targetArea") === true && parent.getPropertyValue("targetArea") === true)
                $dropArea = parent.$el;
            else
                break;

            parent = parent.getPropertyValue("_parentControl");
        }
        return $dropArea;
    };

    this.preprocessItems = function(items, intoSelf) {
        let data = { items: items, intoSelf: intoSelf };
        this.trigger("preprocess", data);

        let testedItems = [];
        for (let i = 0; i < data.items.length; i++) {
            if (this.testValue(data.items[i])) {
                testedItems.push(data.items[i]);
            }
        }
        return testedItems;
    };

    this.itemCount = function(item) {
        let count = 0;
        for (let i = 0; i < this._cells.length; i++) {
            let cellInfo = this.getCellInfo(this._cells[i]);
            if (cellInfo.value !== null && cellInfo.value !== undefined) {
                let subFormatInfo = cellInfo.format.allFormats();
                for (let sf = 0; sf < subFormatInfo.length; sf++) {
                    if (item.value.equalTo(new FormatDef.constructor(this._findValueWithKey(cellInfo.value, subFormatInfo[sf].key), subFormatInfo[sf].format)))
                        count += 1;
                }
            }
        }
        return count;
    };
};
SuperClass.create(TargetListSupport);

const GridTargetContainer = function(params) {
    GridControl.extendTo(this, params);
    Object.assign(this, Backbone.Events);

    this.registerSimpleProperty("label", null);
    this.registerSimpleProperty("margin", "normal", new EnumPropertyFilter(["small", "normal", "large", "none"], "normal"));
    this.registerSimpleProperty("style", "list", new EnumPropertyFilter(["list", "inline"], "list"));

    this.gainOnClick = true;
    this._supplier = null;
    this._actionsBlocked = false;

    this.targetGrids = [];

    let containerParams = {
        _parentControl: this,
        controls: this.getPropertyValue('controls'),
        style: this.getPropertyValue('style'),
        stretchFactor: 0.5
    };

    this.container = new ControlContainer(containerParams);
    this.controls = [];

    this.targetGrid = null;

    this.removeListBox = function(listbox) {
        let isTarget = listbox.hasProperty('isTarget') && listbox.getPropertyValue('isTarget');
        if (isTarget) {

            for (let i = 0; i < this.targetGrids.length; i++) {
                if (this.targetGrids[i] === listbox) {
                    this.targetGrids.splice(i, 1);
                    break;
                }
            }

            if (this.targetGrid === listbox)
                this.targetGrid = this.targetGrids.length > 0 ? this.targetGrids[0] : null;

            delete listbox.blockActionButtons;
            delete listbox.unblockActionButtons;

            if (this._supplier !== null) {
                this.pushRowsBackToSupplier(listbox, 0, listbox._localData.length);
                this._supplier.filterSuppliersList();
                this._supplier.removeTarget(listbox);
            }
            listbox.unregisterDropTargets(listbox);

            if (listbox.disposeDragDrop)
                listbox.disposeDragDrop(listbox.$el);

            listbox.$el.removeClass("silky-target-list");

            listbox.off();
            listbox.$el.off();
        }
    };


    this.addListBox = function(listbox) {
        listbox.setCellBorders(listbox._columnInfo._list.length > 1 ? "columns" : null);

        listbox._override("onListItemAdded", (baseFunction, item, index) => {

            this.searchForListControls(item);

            return baseFunction.call(listbox, item, index);
        });

        listbox._override("onListItemRemoved", (baseFunction, item) => {

            this.searchForListControls(item, true);

            return baseFunction.call(listbox, item);
        });

        let isTarget = listbox.hasProperty('isTarget') && listbox.getPropertyValue('isTarget');
        if (isTarget) {

            this.targetGrid = listbox; //new OptionListControl(params);
            this.targetGrids.push(listbox);

            listbox.blockActionButtons = ($except) => {
                this.blockActionButtons($except);
            };

            listbox.unblockActionButtons = () => {
                return this.unblockActionButtons();
            };

            TargetListSupport.extendTo(listbox, this._supplier);
            listbox.setPickupSourceElement(listbox.$el);

            listbox.$el.addClass("silky-target-list");

            listbox.on('dropoverflow', (source, overflowItems) => {
                let found = false;
                for (let i = 0; i < this.targetGrids.length; i++) {
                    let overflowTarget = this.targetGrids[i];
                    if (found) {
                        source.dropIntoTarget(overflowTarget, overflowItems, 0, 0);
                        break;
                    }
                    else if (overflowTarget === listbox)
                        found = true;
                }
            });

            listbox.on('changing', (event) => {
                this.trigger('changing', event);
            });

            listbox.on('layoutgrid.lostFocus layoutgrid.gotFocus', () => {
                if (listbox.hasFocus) {
                    this.targetGrid = listbox;
                }
                this.onSelectionChanged(listbox);
            });

            this._targetDoubleClickDetect = 0;
            listbox.$el.on('click', null, this, (event) => {
                this._targetDoubleClickDetect += 1;
                if (this._targetDoubleClickDetect === 1) {
                    setTimeout(() => {
                        if (this._targetDoubleClickDetect > 1)
                            this.onAddButtonClick();
                        this._targetDoubleClickDetect = 0;
                    }, 300);
                }
            });

            //overrideing functions in the target grid
            listbox._override('onOptionValueInserted', (baseFunction, keys, data) => {
                if (keys.length !== 1)
                    return;

                if (this._supplier !== null)
                    this.pushRowsBackToSupplier(listbox, 0, listbox._localData.length);

                baseFunction.call(listbox, keys, data);

                this.updateSupplierItems(listbox);
            });

            //overrideing functions in the target grid
            listbox._override('onOptionValueRemoved', (baseFunction, keys, data) => {
                if (keys.length !== 1)
                    return;

                if (this._supplier !== null)
                    this.pushRowsBackToSupplier(listbox, keys[0], 1);

                baseFunction.call(listbox, keys, data);

                if (this._supplier !== null)
                    this._supplier.filterSuppliersList();
            });

            //overrideing functions in the target grid
            listbox._override('onOptionValueChanged', (baseFunction, key, data) => {
                if (this._supplier !== null)
                    this.pushRowsBackToSupplier(listbox, 0, listbox._localData.length);

                baseFunction.call(listbox, key, data);

                this.updateSupplierItems(listbox);
            });

            if (this._supplier !== null) {
                this._supplier.addTarget(listbox);
                this.updateSupplierItems(listbox);
            }
            listbox.registerDropTargets(listbox);
        }
    };

    //this.selectedGrid = null;

    this.setSupplier = function(supplier) {
        if (this._supplier !== null) {
            this._supplier.supplierGrid.off('layoutgrid.gotFocus', this._onGridGotFocus, this);
            this._supplier.supplierGrid.$el.off('click', null, this._doubleClickDetect);

            for (let i = 0; i < this.targetGrids.length; i++) {
                let targetGrid = this.targetGrids[i];
                targetGrid._supplier = null;
                this._supplier.removeTarget(targetGrid);
                this.pushRowsBackToSupplier(targetGrid, 0, targetGrid._localData.length);
            }
        }

        this._supplier = supplier;

        if (this._supplier !== null) {
            this._supplier.supplierGrid.on('layoutgrid.gotFocus', this._onGridGotFocus, this);
            this._supplierDoubleClickDetect = 0;
            this._supplier.supplierGrid.$el.on('click', null, this, this._doubleClickDetect);

            for (let i = 0; i < this.targetGrids.length; i++) {
                let targetGrid = this.targetGrids[i];
                targetGrid._supplier = supplier;
                this._supplier.addTarget(targetGrid);
                this.updateSupplierItems(targetGrid);
            }
        }
    };

    this._override('onDisposed', (baseFunction) => {
        if (baseFunction !== null)
            baseFunction.call(this);

        this.setSupplier(null);
        while (this.targetGrids.length > 0)
            this.removeListBox(this.targetGrids[0]);

        this.container.dispose();
    });

    this.onSelectionChanged = function(listbox) {
        if (this.$button && listbox === this.targetGrid) {
            let gainOnClick = listbox.hasFocus === false;
            this.gainOnClick = gainOnClick;
            let $span = this.$button.find('span');
            $span.addClass(gainOnClick ? 'mif-arrow-right' : 'mif-arrow-left');
            $span.removeClass(gainOnClick ? 'mif-arrow-left' : 'mif-arrow-right');
        }
    };

    this._onGridGotFocus = function() {
        this.gainOnClick = true;
        for (let a = 0; a < this.targetGrids.length; a++) {
            let targetlist = this.targetGrids[a];
            targetlist.clearSelection();
        }
        this.unblockActionButtons();
    };

    this.getSupplierItems = function() {
        let items = this._supplier.getSelectedItems();
        if (this.targetGrid.isSingleItem)
            items = [items[0]];
        return this.targetGrid.preprocessItems(items, false);
    };

    this.addRawToOption = function(item, key, insert) {
        if (this.targetGrid === null)
            return false;

        return this.targetGrid.addRawToOption(item.value.raw, key, insert, item.value.format);
    };

    this.updateSupplierItems = function(list) {
        if (this._supplier !== null) {
            for (let i = 0; i < list._cells.length; i++) {
                let cellInfo = list.getCellInfo(list._cells[i]);
                if (cellInfo.value !== null && cellInfo.value !== undefined) {
                    let subFormatInfo = cellInfo.format.allFormats();
                    for (let sf = 0; sf < subFormatInfo.length; sf++)
                        this._supplier.pullItem(new FormatDef.constructor(this._findValueWithKey(cellInfo.value, subFormatInfo[sf].key), subFormatInfo[sf].format));
                }
            }

            this._supplier.filterSuppliersList();
        }
    };

    this.onAddButtonClick = function() {
        if (this.targetGrid === null)
            return;

        this._supplier.blockFilterProcess = true;
        this.targetGrid.suspendLayout();

        this.targetGrid.option.beginEdit();
        this.targetGrid.beginPropertyEdit();
        let postProcessSelectionIndex = null;
        let postProcessList = null;
        if (this.gainOnClick) {
            let selectedItems = this.getSupplierItems();
            let selectedCount = selectedItems.length;
            if (selectedCount > 0) {
                for (let i = 0; i < selectedCount; i++) {
                    let selectedItem = selectedItems[i];
                    if (postProcessSelectionIndex === null || postProcessSelectionIndex > selectedItem.index) {
                        postProcessSelectionIndex = selectedItem.index;
                        if (this._supplier.getPropertyValue("persistentItems"))
                            postProcessSelectionIndex += 1;
                    }

                    if (this.addRawToOption(selectedItem, null, false) === false)
                        break;
                }
                postProcessList = this._supplier;
            }
        }
        else if (this.targetGrid.selectedCellCount() > 0) {
            let startRow = -1;
            let length = 0;
            let selectionCount = this.targetGrid.selectedCellCount();
            let index = 0;
            while (this.targetGrid.selectedCellCount() > index) {
                let cell = this.targetGrid.getSelectedCell(index);

                let rowIndex = this.targetGrid.displayRowToRowIndex(cell.data.row);
                if (postProcessSelectionIndex === null || postProcessSelectionIndex > rowIndex)
                    postProcessSelectionIndex = rowIndex;

                if (this.targetGrid.removeFromOption(this.targetGrid.getCellInfo(cell)) === false)
                    index += 1;
            }
            postProcessList = this.targetGrid;
        }

        this.targetGrid.endPropertyEdit();
        this.targetGrid.option.endEdit();

        this.targetGrid.resumeLayout();
        this._supplier.blockFilterProcess = false;
        this._supplier.filterSuppliersList();

        if (postProcessSelectionIndex !== null)
            postProcessList.selectNextAvaliableItem(postProcessSelectionIndex);
    };

    this.blockActionButtons = function($except) {

        let fullBlock = $except !== this.$button;

        if (fullBlock) {
            this.$button.prop('disabled', true);
            this._actionsBlocked = true;
        }

        for (let a = 0; a < this.targetGrids.length; a++) {
            let targetlist = this.targetGrids[a];
            if (fullBlock || targetlist !== this.targetGrid)
                targetlist.clearSelection();
        }


    };

    this.unblockActionButtons = function() {
        if (this.$button)
            this.$button.prop('disabled', false);
        this._actionsBlocked = false;
        return this.$button;
    };

    this.pushRowsBackToSupplier = function(list, rowIndex, count) {
        count = count === undefined ? 1 : count;
        for (let row = rowIndex; row < rowIndex + count; row++) {
            let rowCells = list.getRow(list.rowIndexToDisplayIndex(row));
            for (let c = 0; c < rowCells.length; c++) {
                let rowCell = rowCells[c];
                let columnInfo = list._columnInfo._list[rowCell.data.column];
                let cellInfo = list.getCellInfo(rowCell);
                if (cellInfo.value !== null && cellInfo.value !== undefined) {
                    let subFormatInfo = cellInfo.format.allFormats();
                    for (let sf = 0; sf < subFormatInfo.length; sf++)
                        this._supplier.pushItem(new FormatDef.constructor(this._findValueWithKey(cellInfo.value, subFormatInfo[sf].key), subFormatInfo[sf].format));
                }
            }
        }
    };

    this._doubleClickDetect = function(event) {
        let self = event.data;
        if (self._supplier.isMultiTarget())
            return;

        self._supplierDoubleClickDetect += 1;
        if (self._supplierDoubleClickDetect === 1) {
            setTimeout(function () {
                if (self._supplierDoubleClickDetect > 1)
                    self.onAddButtonClick();
                self._supplierDoubleClickDetect = 0;
            }, 300);
        }
    };

    this._override("onPropertyChanged", (baseFunction, name) => {

        if (baseFunction !== null)
            baseFunction.call(this, name);

        if (name === "label" && this.$label) {
            let label = this.getPropertyValue('label');
            this.$label.text(label);
        }
    });

    this._findValueWithKey = function(data, key) {
        let value = data;
        for (let i = 0; i < key.length; i++)
            value = value[key[i]];

        return value;
    };


    this.renderContainer = function(context) {
        this.container.renderContainer(context);
        this.controls = this.container.controls;
        this.searchForListControls(this.container);

        let label = this.getPropertyValue('label');
        if (label === null) {
            if (this.controls.length > 0) {
                let ctrl = this.controls[0];
                if (ctrl.hasProperty('label') && ctrl.hasDisplayLabel && ctrl.hasDisplayLabel() === false) {
                    let ctrlLabel = ctrl.getPropertyValue('label');
                    if (ctrlLabel !== '')
                        this.setPropertyValue('label', ctrlLabel);
                }
            }
        }
    };

    this.searchForListControls = function(container, removing) {
        if (container._isInheritedFrom(OptionListControl)) {
            if (removing)
                this.removeListBox(container);
            else
                this.addListBox(container);
        }

        if (container.getControls) {
            let ctrls = container.getControls();
            for (let i = 0; i < ctrls.length; i++)
                this.searchForListControls(ctrls[i], removing);
        }
    };

    this.getControls = function() {
        return this.controls;
    };

    this.onRenderToGrid = function(grid, row, column) {

        let label = this.getPropertyValue('label');
        if (label !== null) {
            this.$label = $('<div style="white-space: nowrap;" class="silky-target-list-header silky-control-margin-' + this.getPropertyValue("margin") + '">' + label + '</div>');
            grid.addCell(column, row, true, this.$label);
        }

        if (grid.addTarget) {
            this.$button = $('<button type="button" class="silky-option-variable-button"><span class="mif-arrow-right"></span></button>');
            this.$button.click((event) => {
                if (this._actionsBlocked === false)
                    this.onAddButtonClick();
            });
            grid.addCell('aux', row + 1, true, this.$button);

            this.setSupplier(grid);
        }

        let info = this.container.renderToGrid(grid, row + 1, column);
        info.cell.dockContentHeight = true;

        return { height: 2, width: 2 };
    };
};

SuperClass.create(GridTargetContainer);

module.exports = GridTargetContainer;
