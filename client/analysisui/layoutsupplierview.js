
'use strict';

const $ = require('jquery');
const FormatDef = require('./formatdef');
const SelectableLayoutGrid = require('./selectablelayoutgrid');
const DragNDrop = require('./dragndrop');
const ControlContainer = require('./controlcontainer').container;
const LayoutGrid = require('./layoutgrid');
const EnumPropertyFilter = require('./enumpropertyfilter');
const SuperClass = require('../common/superclass');
const RequestDataSupport = require('./requestdatasupport');
const focusLoop = require('../common/focusloop');

const LayoutSupplierView = function(params) {
    DragNDrop.extendTo(this);
    ControlContainer.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.setList = function(value) {

        this.$el.addClass('initialising');

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
            if (item.used === undefined)
                item.used = this.numberUsed(item);
            if (item.properties === undefined)
                item.properties = {};

            newItems.push(item);
        }

        this._items = newItems;

        if (this.supplierGrid !== undefined) {
            this.renderItemList();
            this.filterSuppliersList();
        }

        this.$el.removeClass('initialising');

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

    this._override('onDataChanged', (baseFunction, data) => {
        if (data.dataType !== 'columns')
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

    this.displaySearch = function(value) {
        if (value)
            this.$searchButton.show();
        else
            this.$searchButton.hide();
    };

    this.displayMsg = function(text, time) {
        if (time === undefined)
            time = 3000;
        this.$warning.text(text);
        this.$warning.addClass('active');
        setTimeout(() => {
            this.$warning.removeClass('active');
        }, time);
    };

    this.onContainerRendering = function(context) {
        this.baseLayout = new LayoutGrid();
        this.baseLayout.$el.addClass('jmv-variable-supplier-base');

        this.$warning = $('<div class="msg"></div>');

        this.$warning.on('mouseenter', () => {
            if (this.$warning.hasClass('active'))
                this.$warning.addClass('hovering');
        });

        this.$warning.on('mouseleave', () => {
            this.$warning.removeClass('hovering');
        });

        this.baseLayout.$el.append(this.$warning);

        let labelId = focusLoop.getNextAriaElementId('label');

        let label = this.getPropertyValue('label');
        let nextRow = 0;
        if (label !== null) {
            label = this.translate(label);
            this.baseLayout.addCell(0, nextRow++, $(`<div id="${labelId}" style="white-space: nowrap;" class="silky-options-supplier-group-header">${label}</div>`));
        }

        this.supplierGrid = new SelectableLayoutGrid(this.params, false);
        if (label !== null)
            this.supplierGrid.$el.attr('aria-labelledby', labelId);
        else
            this.supplierGrid.$el.attr('aria-label', _('Available items'));

        this.supplierGrid.$el.addClass('silky-layout-grid multi-item silky-variable-supplier');
        this.supplierGrid.stretchEndCells = false;
        this.supplierGrid._animateCells = true;
        this.supplierGrid.setMinimumHeight(200);
        this.supplierGrid.setMaximumHeight(200);

        this.ignoreTransform = true;
        let cell = this.baseLayout.addCell(0, nextRow, this.supplierGrid);
        this.ignoreTransform = false;
        cell.setStretchFactor(1);
        cell.setVerticalAlign('stretch');

        this.setPickupSourceElement(this.supplierGrid.$el);

        this.ignoreTransform = true;
        cell = this.addCell(0, 0, this.baseLayout);
        cell.setStretchFactor(1);
        cell.setVerticalAlign('stretch');
        cell.setSpanAllRows(true);
        this.ignoreTransform = false;


        //////////////////////////////////
        this.$searchButton = $(`<button class="search" aria-label="${_('Search list items')}"><div class="image"></div></button>`);
        this.supplierGrid.$el.append(this.$searchButton);
        this.$searchButton.hide();

        let $search = $(`<div class="supplier-search"><div class="outer-text"><input type="search" class="text" placeholder="${_('Search')}"></input></div></div>`);
        this.$searchInput = $search.find('input');

        let searchCell = this.supplierGrid.addCell(0, 0, $search, { visible: false });
        searchCell.setStretchFactor(1);
        searchCell.makeSticky();

        this.enableSearch = (value) => {
            this.searchEnabled = value;

            $search.css('margin-top', '');
            searchCell.setVisibility(this.searchEnabled);

            if (value === false) {
                this.$searchInput.val('');
                this.filterSuppliersList(true);
            }
            else {
                setTimeout(() => {
                    this.$searchInput.focus();
                    this.$searchInput.select();
                }, 10);
                
            }
        };

        this.$searchInput.on('input', (event) => {
            if (this.searchingInProgress)
                clearTimeout(this.searchingInProgress);

            this.searchingInProgress = setTimeout(() => {
                this.filterSuppliersList(true);
                setTimeout(() => {
                    this.supplierGrid.$el.scrollTop(0);
                }, 0);
                this.searchingInProgress = null;
            }, 600);
            
        });

        this.$searchInput.on('keydown', (event) => {
            var keypressed = event.keyCode || event.which;
            if (keypressed === 27) // escape key
                this.enableSearch(false);
        });

        this.$searchButton.on('click', (event) => {
            this.enableSearch( ! this.searchEnabled);
        });

        $search.on('mousedown focus', (event) => {
            this.supplierGrid.clearSelection();
        });

        ///////////////////////////////////

        if (this._items.length > 0) {
            this.renderItemList();
            this.filterSuppliersList();
        }

        this.onPopulate();
    };



    this.onContainerRendered = function() {
        setTimeout(() => {
            let cell = this.getCell(2, this._rowCount - 1);
            if (! cell.$content)
                return;

            let current = this.supplierGrid.$el.outerHeight();
            let bottom2 = this.supplierGrid.$el.offset().top + this.supplierGrid.$el.outerHeight();
            let bottom = cell.$content.offset().top + cell.$content.outerHeight();

            let newHeight = this.supplierGrid.$el.outerHeight() + (bottom - bottom2);
            this.supplierGrid.$el.css('height', newHeight + 'px');

            if (bottom2 > bottom) {
                let $bottomList = $(cell.$el.find('.silky-option-list.multi-item')[0]);
                if ($bottomList) {
                    newHeight = $bottomList.outerHeight() + (bottom2 - bottom);
                    $bottomList.css('height', newHeight + 'px');
                }
            }
        }, 0);
    };

    this._override('updateGridProperties', (baseFunction) => {
        this.$el.css('grid-template-rows', 'repeat(' + (this._rowCount)  + ', auto) 1fr');
    });

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
        for (let i = 0; i < selectionCount; i++) {
            let item = this.getItem(this.supplierGrid.getSelectedCell(i).data.row - 1);
            if (item)
                items.push(item);
        }

        return items;
    };

    this.pullItem = function(formatted, use) {
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            if (item.value.equalTo(formatted)) {
                if (use === undefined || use === true)
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
        for (let r = from + 1; r < this._items.length + 1; r++) {
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
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            this['render_' + item.value.format.name](item, i + 1);
        }

        while (this._items.length < this.supplierGrid._rowCount - 1) {
            this.supplierGrid.removeRow(this._items.length + 1);
        }
    };

    this.render_term = function(item, row) {
        let $item = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-term"></div>');
        $item.append('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + item.value.toString() + '</div>');

        let c1 = this.supplierGrid.getCell(0, row);

        if (c1 === null) {
            c1 = this.supplierGrid.addCell(0, row,  $item);
            c1.clickable(true);
        }
        else {
            if (c1.$content)
                c1.$content.remove();
            c1.setContent($item);
        }

        c1.setStretchFactor(1);

        c1.$el.attr('role', 'option');
        c1.$el.attr('aria-selected', false);
        c1.$el.attr('aria-label', item.value.toAriaLabel());

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
            c1 = this.supplierGrid.addCell(0, row,  $item);
            c1.clickable(true);
        }
        else {
            if (c1.$content)
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

        c1.$el.attr('role', 'option');
        c1.$el.attr('aria-selected', false);

        let label = item.value.toAriaLabel();
        if (item.properties.power !== 1)
            label += ` Power ${item.properties.power}`;
        if (variableType !== 'none')
            label += ` ${variableType}`;
        if (dataType !== 'none')
            label += ` ${dataType}`;

        c1.$el.attr('aria-label', label );
 
        item.$el = c1.$el;
    };

    this.blockFilterProcess = false;

    this.filterSuppliersList = function(force) {
        if (this.blockFilterProcess)
            return;

        let searchVal = this.$searchInput.val().trim().toLowerCase();

        if (this._persistentItems === false || force) {
            for (let i = 0; i < this._items.length; i++) {
                let item = this._items[i];
                let visibility = this._persistentItems || item.used === 0;
                if (visibility && searchVal !== '') {
                    let value = item.value.toString().toLowerCase();
                    visibility = value.indexOf(searchVal) !== -1;
                }

                let rowCells = this.supplierGrid.getRow(i + 1);
                for (let j = 0; j < rowCells.length; j++) {
                    let cell = rowCells[j];
                    cell.setVisibility(visibility);
                }
            }
        }
    };
};

SuperClass.create(LayoutSupplierView);

module.exports = LayoutSupplierView;
