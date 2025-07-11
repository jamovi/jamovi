
'use strict';

import SelectableLayoutGrid from './selectablelayoutgrid';
import DragNDrop from './dragndrop';
import type { IItem } from './dragndrop';
import type { IDragDropTarget } from './dragndrop';
import  { ControlContainer, ControlContainerProperties } from './controlcontainer';
import LayoutGrid from './layoutgrid';
import EnumPropertyFilter from './enumpropertyfilter';
import GetRequestDataSupport, { RequestDataSupport } from './requestdatasupport';
import focusLoop from '../common/focusloop';
import type { SupplierTargetList } from './gridtargetcontrol';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import LayoutCell from './layoutcell';
import BorderLayoutGrid from './layoutgridbordersupport';
import Format from './format';
import { Margin } from './controlbase';

export type TransferAction<U> = { name: string, resultFormat: Format<U> };

export type SupplierTarget<U> = IDragDropTarget<U> & { 
    unblockActionButtons: () => HTMLElement; 
    blockActionButtons: (except: HTMLElement, target: IDragDropTarget<U>) => void;
    preprocessItems: <I extends IItem<U>>(items: I[], from: IDragDropTarget<U>, action?, silent?: boolean) => I[];
    getDefaultTransferAction: () =>  { name: string, resultFormat: Format<U> };
    applyTransferActionToItems:  <I extends IItem<U>>(items: I[], action: TransferAction<U>) => I[];
};

export interface ISupplierItem<U> extends IItem<U> {
    index: number;
    used: number
}

export class SupplierLayoutGrid extends BorderLayoutGrid {
    ignoreTransform: boolean = false;
    
    constructor() {
        super();
    }

    override updateCustomGridProperties(): boolean {
        this.style.gridTemplateRows = `repeat(${this._rowCount}, auto) 1fr`;
        return false;
    }

    override getTranformedRow(row: number, column: number): number {
        return row;
    }

    override getTranformedColumn(row: number, column: number): number {
        if ( ! this.ignoreTransform)
            return column + 1;

        return column;
    }

    override getColumnIndexFromName(name: string): number {
        if (name === 'aux')
            return 0;

        if (name === 'main')
            return 1;

        return -1;
    }
}

customElements.define('jmv-suppliergrid', SupplierLayoutGrid);

export type SupplierViewProperties<U> = ControlContainerProperties & {
    value: ISupplierItem<U>[];
    margin: Margin;
    persistentItems: boolean;
    label: string;
    format: Format<any>;
    higherOrders: boolean;
}

type InferType<T> = T extends SupplierViewProperties<infer A> ? A : never;

export class LayoutSupplierView<P extends SupplierViewProperties<U>, U = InferType<P>> extends ControlContainer<P, typeof SupplierLayoutGrid> implements IDragDropTarget<U> {
    
    dragDropManager: DragNDrop<U>;
    _targets: { [key: string]: SupplierTarget<U> };
    _items: ISupplierItem<U>[] = [];
    baseLayout: LayoutGrid;
    supplier: SelectableLayoutGrid;
    $warning: HTMLElement;
    $searchButton: HTMLElement;
    $searchInput: HTMLInputElement;
    dataSupport: RequestDataSupport;
    
    constructor(params: P) {
        super(params, SupplierLayoutGrid);

        this.dragDropManager = new DragNDrop(this);
        this.dataSupport = GetRequestDataSupport(this);

        this._persistentItems = this.getPropertyValue('persistentItems');
        this._higherOrder = this.getPropertyValue('higherOrders');
    
        this.el.classList.add('silky-options-supplier-group');
        this.el.classList.add('silky-control-margin-' + this.getPropertyValue('margin'));
    
        this._targets = {};
        this._targetCount = 0;
        this._targetFocusMethods = {};

        this.gridEntryPosition = {
            row: 0,
            column: 1
        };

        this.blockFilterProcess = false;
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerComplexProperty('value', this.getList, this.setList, 'value_changed');
        this.registerSimpleProperty('persistentItems', false);
        this.registerSimpleProperty('label', null);
        this.registerSimpleProperty('margin', Margin.Normal, new EnumPropertyFilter(Margin, Margin.Normal));
        this.registerSimpleProperty('format', null);
        this.registerSimpleProperty('higherOrders', false);
    }

    setList(value: ISupplierItem<U>[]) {

        this.el.classList.add('initialising');

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

        if (this.supplier !== undefined) {
            this.renderItemList();
            this.filterSuppliersList();
        }

        this.el.classList.remove('initialising');

        this.emit('value_changed');
    }

    getList() {
        return this._items;
    }

    value() {
        return this.getList();
    }

    setValue(value: ISupplierItem<U>[]) {
        this.setList(value);
    }

    onDataChanged(data) {
        if (data.dataType !== 'columns')
            return;

        if (data.dataInfo.nameChanged || data.dataInfo.measureTypeChanged || data.dataInfo.dataTypeChanged || data.dataInfo.countChanged)
            this.update();
    }

    update() {
        this.emit('update');
    }

    onPopulate() {
    }

    displaySearch(value: boolean): void {
        if (value)
            this.$searchButton.style.display = '';
        else
            this.$searchButton.style.display = 'none';
    }

    displayMsg(text: string, time?: number): void {
        if (time === undefined)
            time = 3000;
        this.$warning.innerText = text;
        this.$warning.classList.add('active');
        setTimeout(() => {
            this.$warning.classList.remove('active');
        }, time);
    }

    onContainerRendering(context) {
        this.baseLayout = new LayoutGrid();
        this.baseLayout.classList.add('jmv-variable-supplier-base');

        this.$warning = HTML.parse('<div class="msg"></div>');

        this.$warning.addEventListener('mouseenter', () => {
            if (this.$warning.classList.contains('active'))
                this.$warning.classList.add('hovering');
        });

        this.$warning.addEventListener('mouseleave', () => {
            this.$warning.classList.remove('hovering');
        });

        this.baseLayout.append(this.$warning);

        let labelId = focusLoop.getNextAriaElementId('label');

        let label = this.getPropertyValue('label');
        let nextRow = 0;
        if (label !== null) {
            label = this.translate(label);
            this.baseLayout.addCell(0, nextRow++, HTML.parse(`<div id="${labelId}" style="white-space: nowrap;" class="silky-options-supplier-group-header">${label}</div>`));
        }

        this.supplier = new SelectableLayoutGrid();

        this.supplier.addEventListener('layoutcell.selectionChanged', (event: CustomEvent<{cell: LayoutCell}>) => {
            let cell = event.detail.cell;
            if (cell.isSelected()) {
                let powerBox = cell.content.querySelector<HTMLElement>('.power-box');
                if (powerBox)
                    powerBox.classList.add('power-visible');
                let $powerValueItem = cell.content.querySelector<HTMLElement>('.power-box .value');
                if ($powerValueItem)
                    $powerValueItem.innerText = '1';
                let item: IItem = cell.item as IItem;
                if (item)
                    item.properties.power = 1;
            }
            else {
                let powerBox = cell.content.querySelector<HTMLElement>('.power-box');
                if (powerBox)
                    powerBox.classList.remove('power-visible');
            }
        });

        if (label !== null)
            this.supplier.setAttribute('aria-labelledby', labelId);
        else
            this.supplier.setAttribute('aria-label', _('Available items'));

        this.supplier.classList.add('silky-layout-grid', 'multi-item', 'silky-variable-supplier');
        this.supplier.stretchEndCells = false;
        this.supplier._animateCells = true;

        //this.ignoreTransform = true;
        let cell = this.baseLayout.addCell(0, nextRow, this.supplier);
        //this.ignoreTransform = false;
        cell.setStretchFactor(1);
        cell.setVerticalAlign('stretch');

        this.dragDropManager.setPickupSourceElement(this.supplier);

        this.el.ignoreTransform = true;
        cell = this.el.addCell(0, 0, this.baseLayout);
        cell.setStretchFactor(1);
        cell.setVerticalAlign('stretch');
        cell.setSpanAllRows(true);
        this.el.ignoreTransform = false;


        //////////////////////////////////
        this.$searchButton = HTML.parse(`<button class="search" aria-label="${_('Search list items')}"><div class="image"></div></button>`);
        this.supplier.append(this.$searchButton);
        this.$searchButton.style.display = 'none';

        let $search = HTML.parse(`<div class="supplier-search"><div class="outer-text"><input type="search" class="text" placeholder="${_('Search')}"></input></div></div>`);
        this.$searchInput = $search.querySelector<HTMLInputElement>('input');

        let searchCell = this.supplier.addCell(0, 0, $search, { visible: false });
        searchCell.setStretchFactor(1);
        searchCell.makeSticky();

        this.enableSearch = (value) => {
            this.searchEnabled = value;

            $search.style.marginTop = '';
            searchCell.setVisibility(this.searchEnabled);

            if (value === false) {
                this.$searchInput.value = '';
                this.filterSuppliersList(true);
            }
            else {
                setTimeout(() => {
                    this.$searchInput.focus();
                    this.$searchInput.select();
                }, 10);
                
            }
        };

        this.$searchInput.addEventListener('input', (event) => {
            if (this.searchingInProgress)
                clearTimeout(this.searchingInProgress);

            this.searchingInProgress = setTimeout(() => {
                this.filterSuppliersList(true);
                setTimeout(() => {
                    this.supplier.scrollTop = 0;
                }, 0);
                this.searchingInProgress = null;
            }, 600);
            
        });

        this.$searchInput.addEventListener('keydown', (event) => {
            var keypressed = event.keyCode || event.which;
            if (keypressed === 27) // escape key
                this.enableSearch(false);
        });

        this.$searchButton.addEventListener('click', (event) => {
            this.enableSearch( ! this.searchEnabled);
        });

        $search.addEventListener('mousedown focus', (event) => {
            this.supplier.clearSelection();
        });

        ///////////////////////////////////

        if (this._items.length > 0) {
            this.renderItemList();
            this.filterSuppliersList();
        }

        this.onPopulate();
    }

    override onContainerRendered() {
        setTimeout(() => {
            let cell = this.el.getCell(2, this.el._rowCount - 1);
            if (! cell.content)
                return;

            let gridRect = this.supplier.getBoundingClientRect();
            let contentRect =  cell.content.getBoundingClientRect();
            let bottom2 = gridRect.top + window.scrollY + gridRect.height;
            let bottom = contentRect.top + window.scrollY + contentRect.height;

            let newHeight = gridRect.height + (bottom - bottom2);
            this.supplier.style.height = `${newHeight}px`;

            if (bottom2 > bottom) {
                let $bottomList = cell.querySelector<HTMLElement>('.silky-option-list.multi-item');
                if ($bottomList) {
                    newHeight = $bottomList.getBoundingClientRect().height + (bottom2 - bottom);
                    $bottomList.style.height = newHeight + 'px';
                }
            }
        }, 0);
    }


    getPickupItems() {
        return this.getSelectedItems();
    }

    catchDroppedItems(source, items) {

    }

    filterItemsForDrop(items) {
        let itemsToDrop = [];
        for (let i = 0; i < items.length; i++) {
            itemsToDrop.push(items[i]);
        }
        return itemsToDrop;
    }

    inspectDraggedItems(source, items) {

    }

    dropTargetElement() {
        return this.supplier;
    }

    getItem(index) {
        return this._items[index];
    }

    getSelectionCount() {
        return this.supplier.selectedCellCount();
    }

    getSelectedItems() {
        let items: ISupplierItem<U>[] = [];
        let selectionCount = this.supplier.selectedCellCount();
        for (let i = 0; i < selectionCount; i++) {
            let item = this.getItem(this.supplier.getSelectedCell(i).data.row - 1);
            if (item)
                items.push(item);
        }

        return items;
    }

    pullItem(formatted, use=true) : ISupplierItem<U> | null {
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            if (item.value.equalTo(formatted)) {
                if (use === true)
                    item.used += 1;
                return item;
            }
        }
        return null;
    }

    pushItem(formatted) {
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            if (item.value.equalTo(formatted)) {
                if (item.used > 0)
                    item.used -= 1;
                break;
            }
        }
    }

    getItemFromValue(formattedValue) {
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            if (item.value.equalTo(formattedValue))
                return item;
        }
        return null;
    }

    numberUsed(item: IItem<U>) {
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
    }

    removeTarget(target: SupplierTargetList<U>) {
        let targetDragDropManager = target.dragDropManager;

        let id = '_' + targetDragDropManager._dropId;
        if ((id in this._targets) === false)
            return;

        this._targetCount -= 1;

        this.dragDropManager.unregisterDropTargets(target);
        if (targetDragDropManager.unregisterDropTargets || target.dropTargetElement) {
            if (targetDragDropManager.unregisterDropTargets)
                targetDragDropManager.unregisterDropTargets(this);
            for (let tid in this._targets) {
                if (targetDragDropManager.unregisterDropTargets)
                    targetDragDropManager.unregisterDropTargets(this._targets[tid]);
                if (target.dropTargetElement && this._targets[tid].dragDropManager.unregisterDropTargets)
                    this._targets[tid].dragDropManager.unregisterDropTargets(target);
            }
        }

        let gotFocusMethod = this._targetFocusMethods[id];
        target.el.removeEventListener('layoutgrid.gotFocus', gotFocusMethod);
        delete this._targetFocusMethods[id];
        delete this._targets[id];
    }

    addTarget(target: SupplierTargetList<U>) {

        let targetDragDropManager = target.dragDropManager;
        let id = '_' + targetDragDropManager._dropId;
        if (id in this._targets)
            return false;

        this._targetCount += 1;

        this.dragDropManager.registerDropTargets(target);
        if (targetDragDropManager.registerDropTargets || target.dropTargetElement) {
            if (targetDragDropManager.registerDropTargets)
                targetDragDropManager.registerDropTargets(this);
            for (let tid in this._targets) {
                if (targetDragDropManager.registerDropTargets)
                    targetDragDropManager.registerDropTargets(this._targets[tid]);
                if (target.dropTargetElement && this._targets[tid].dragDropManager.registerDropTargets)
                    this._targets[tid].dragDropManager.registerDropTargets(target);
            }
        }

        this._targets[id] = target;
        let gotFocusMethod = () => {
            let activeButton =  this._targets[id].unblockActionButtons();
            this.supplier.clearSelection();
            for (let tid in this._targets) {
                this._targets[tid].blockActionButtons(activeButton, target);
            }
        };

        this._targetFocusMethods[id] = gotFocusMethod;
        target.el.addEventListener('layoutgrid.gotFocus', gotFocusMethod);

        return true;
    }

    isMultiTarget() {
        return this._targetCount > 1;
    }

    selectNextAvaliableItem(from) {
        let cell = null;
        for (let r = from + 1; r < this._items.length + 1; r++) {
            cell = this.supplier.getCell(0, r);
            if (cell !== null && cell.visible()) {
                this.supplier.selectCell(cell);
                return;
            }
        }
        for (let r1 = from; r1 >= 0; r1--) {
            cell = this.supplier.getCell(0, r1);
            if (cell !== null && cell.visible()) {
                this.supplier.selectCell(cell);
                return;
            }
        }
    }

    renderItemList() {
        for (let i = 0; i < this._items.length; i++) {
            let item = this._items[i];
            this['render_' + item.value.format.name](item, i + 1);
        }

        while (this._items.length < this.supplier._rowCount - 1) {
            this.supplier.removeRow(this._items.length + 1);
        }
    }

    render_term(item: IItem<U>, row: number) {
        let $item = HTML.parse('<div style="white-space: nowrap;" class="silky-list-item silky-format-term"></div>');

        item.el = $item;

        $item.append(HTML.parse('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + item.value.toString() + '</div>'));

        let c1 = this.supplier.getCell(0, row);

        if (c1 === null) {
            c1 = this.supplier.addCell(0, row, item);
            c1.clickable(true);
        }
        else {
            //if (c1.content)
            //    c1.content.remove();
            c1.setContent(item);
        }

        c1.setStretchFactor(1);

        c1.setAttribute('role', 'option');
        c1.setAttribute('aria-selected', 'false');
        c1.setAttribute('aria-label', item.value.toAriaLabel());

        //item.el = c1;
    }

    render_variable(item: IItem<U>, row: number) {

        let $item = HTML.parse('<div style="white-space: nowrap;" class="silky-list-item silky-format-variable"></div>');

        item.el = $item;

        if (item.properties.permitted === false)
            $item.classList.add('silky-grayed-out');

        let variableType = 'none';
        if (item.properties.measureType !== undefined)
            variableType = item.properties.measureType;

        let dataType = 'none';
        if (item.properties.dataType !== undefined)
            dataType = item.properties.dataType;

        item.properties.power = 1;

        $item.append(HTML.parse('<div style="display: inline-block;" class="silky-variable-type-img silky-variable-type-' + variableType + ' jmv-data-type-' + dataType + '"></div>'));
        $item.append(HTML.parse('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + item.value.toString() + '</div>'));

        if (this._higherOrder) {
            $item.append(HTML.parse(
                            `<div class="power-box">
                                <div class="value" contenteditable="true">1</div>
                                <div class="button-box">
                                    <div class="up button"></div>
                                    <div class="down button"></div>
                                </div>
                            </div>`
                        ));
            let $powerItem = $item.querySelector<HTMLElement>('.power-box');
            $powerItem.addEventListener('mousedown', (event) => {
                event.stopPropagation();
                event.preventDefault();
            });
            $powerItem.addEventListener('mouseup', (event) => {
                event.stopPropagation();
                event.preventDefault();
            });
            $powerItem.addEventListener('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
            });
            let $powerValueItem = $item.querySelector<HTMLElement>('.power-box .value');
            $powerValueItem.addEventListener('blur', (event) => {
                let value = parseInt($powerValueItem.innerText) - 1;
                if (value < 1 || Number.isNaN(value))
                    value = 1;
                else if (value > 5)
                    value = 5;
                $powerValueItem.innerText = value.toString();
                item.properties.power = value;
            });
            let $upItem = $item.querySelector<HTMLElement>('.power-box .up');
            $upItem.addEventListener('mouseup', (event) => {
                let value = parseInt($powerValueItem.innerText) + 1;
                if (value > 5 || Number.isNaN(value))
                    value = 5;
                $powerValueItem.innerText = value.toString();
                item.properties.power = value;
            });
            let $downItem = $item.querySelector<HTMLElement>('.power-box .down');
            $downItem.addEventListener('mouseup', (event) => {
                let value = parseInt($powerValueItem.innerText) - 1;
                if (value < 1 || Number.isNaN(value))
                    value = 1;
                $powerValueItem.innerText = value.toString();
                item.properties.power = value;
            });
        }

        let c1 = this.supplier.getCell(0, row);

        if (c1 === null) {
            c1 = this.supplier.addCell(0, row, item);
            c1.clickable(true);
        }
        else {
            //if (c1.content)
            //    c1.content.remove();
            c1.setContent(item);
        }
        /*c1.removeAllListeners('layoutcell.selectionChanged');
        c1.addEventListener('layoutcell.selectionChanged', () => {
            if (c1.isSelected()) {
                let powerBox = c1.content.querySelector<HTMLElement>('.power-box');
                if (powerBox)
                    powerBox.classList.add('power-visible');
                let $powerValueItem = $item.querySelector<HTMLElement>('.power-box .value');
                if ($powerValueItem)
                    $powerValueItem.innerText = '1';
                item.properties.power = 1;
            }
            else {
                let powerBox = $item.querySelector<HTMLElement>('.power-box');
                if (powerBox)
                    powerBox.classList.remove('power-visible');
            }
        });*/

        c1.setStretchFactor(1);

        c1.setAttribute('role', 'option');
        c1.setAttribute('aria-selected', 'false');

        let label = item.value.toAriaLabel();
        if (item.properties.power !== 1)
            label += ` Power ${item.properties.power}`;
        if (variableType !== 'none')
            label += ` ${variableType}`;
        if (dataType !== 'none')
            label += ` ${dataType}`;

        c1.setAttribute('aria-label', label );
 
        //item.el = c1;
    }

    filterSuppliersList(force=false) {
        if (this.blockFilterProcess)
            return;

        let searchVal = this.$searchInput.value.trim().toLowerCase();

        if (this._persistentItems === false || force) {
            for (let i = 0; i < this._items.length; i++) {
                let item = this._items[i];
                let visibility = this._persistentItems || item.used === 0;
                if (visibility && searchVal !== '') {
                    let value = item.value.toString().toLowerCase();
                    visibility = value.indexOf(searchVal) !== -1;
                }

                let rowCells = this.supplier.getRow(i + 1);
                for (let j = 0; j < rowCells.length; j++) {
                    let cell = rowCells[j];
                    cell.setVisibility(visibility);
                }
            }
        }
    }
}

export default LayoutSupplierView;
