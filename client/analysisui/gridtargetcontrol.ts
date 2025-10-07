'use strict';

import $ from 'jquery';  // for backwards compatibility

import OptionListControl, { ICellInfo, SelectableOptionListControl, SelectableOptionListControlProperties } from './optionlistcontrol';
import GridControl, { GridControlProperties } from './gridcontrol';
import { FormatDef, FormattedValue } from './formatdef';
import DragNDrop from './dragndrop';
import EnumPropertyFilter from './enumpropertyfilter';
import { ControlContainer, ControlContainerProperties, LayoutStyle } from './controlcontainer';

import Toolbar from '../common/toolbar/toolbar';
import ToolbarButton from '../common/toolbar/toolbarbutton';
import ToolbarGroup from '../common/toolbar/toolbargroup';
import { LayoutSupplierView, SupplierViewProperties } from './layoutsupplierview';
import type { SupplierTarget, TransferAction } from './layoutsupplierview';
import type { IPickupItem, IDragDropTarget, IItem } from './dragndrop'
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import type LayoutGrid from './layoutgrid';
import { Margin } from './controlbase';
import { IControlProvider } from './optionsview';

import A11y from '../common/focusloop';

type OptionListControlType<U> = InstanceType<typeof OptionListControl<TargetListControlProperties<U>>>;

export type SupplierTargetList<U> = SelectableOptionListControl<TargetListControlProperties<U>> & SupplierTarget<U>;

enum ItemDropBehaviour {
    Overwrite = 'overwrite',
    Insert = 'insert',
    Emptyspace = 'emptyspace'
}

type TargetListControlProperties<U> = SelectableOptionListControlProperties<U> & {
    itemDropBehaviour: ItemDropBehaviour

    dropoverflow: (source, overflowItems) => void;
    preprocess: (data) => void;
}

const TargetListSupport = function<U>(list: SelectableOptionListControl<TargetListControlProperties<U>>, parent: GridTargetContainer<U>) : SupplierTargetList<U> {

    let checkDropBehaviour = () => {
        let dropBehaviour = list.getPropertyValue('itemDropBehaviour');

        let hasMaxItemCount = list.maxItemCount >= 0;
        if (hasMaxItemCount && list.getOption().getLength(list.getValueKey()) >= list.maxItemCount)
            dropBehaviour = ItemDropBehaviour.Overwrite;

        return dropBehaviour;
    };

    let _$hoverCell: HTMLElement = null;

    list.registerSimpleProperty('itemDropBehaviour', ItemDropBehaviour.Insert, new EnumPropertyFilter(ItemDropBehaviour, ItemDropBehaviour.Insert));

    let dragDropTarget : SupplierTarget<U> = {

        dragDropManager: undefined,

        getPickupItems: () : IPickupItem<U>[] => {
            let items: IPickupItem<U>[] = [];
            for (let i = 0; i < list.el.selectedCellCount(); i++) {
                let cell = list.el.getSelectedCell(i);
                if (cell.item && cell.item instanceof GridTargetContainer)
                    continue;
                let cellInfo = list.getCellInfo(cell);
                if (cellInfo.value !== null && cellInfo.value !== undefined) {
                    let formattedValue = new FormattedValue(cellInfo.value, cellInfo.format);
                    let pickupItem: IPickupItem<U> = { value: formattedValue, cellInfo: cellInfo, el: cell, properties: undefined };
                    let item = parent._supplier.getItemFromValue(formattedValue);
                    if (item !== null)
                        pickupItem.properties = item.properties;
                    items.push(pickupItem);
                }
            }
            return items;
        },

        onDragDropStart: () => {
            list.getOption().beginEdit();
            list.beginPropertyEdit();
        },

        onDragDropEnd: () => {
            list.endPropertyEdit();
            list.getOption().endEdit();
        },

        onItemsDropping: (items: IPickupItem<U>[], intoSelf) => {
            let copy: IPickupItem<U>[] = [];
            while (items.length > 0)
                copy.push(items.shift());

            for (let i = 0; i < copy.length; i++) {
                let cellInfo = copy[i].cellInfo;
                if (cellInfo.removed === false) {

                    if (list.removeFromOption(cellInfo)) {
                        for (let j = i + 1; j < copy.length; j++) {
                            if (copy[j].cellInfo.listIndex > cellInfo.listIndex) {
                                copy[j].cellInfo.listIndex -= 1;
                                copy[j].cellInfo.valueIndex[copy[j].cellInfo.valueIndex.length] -= 1;
                            }
                            else if (copy[j].cellInfo.listIndex === cellInfo.listIndex) {
                                copy.splice(j, 1);
                                j -= 1;
                            }
                        }
                    }

                    //only drop the compatible formats
                    let formats = cellInfo.format.allFormats();
                    for (let sf = 0; sf < formats.length; sf++) {
                        let formattedValue = new FormattedValue(parent._findValueWithKey(cellInfo.value, formats[sf].key), formats[sf].format);
                        let pickupItem = { value: formattedValue, cellInfo: cellInfo, el: cellInfo.cell.el, properties: undefined };
                        let item = parent._supplier.getItemFromValue(formattedValue);
                        if (item !== null) {
                            pickupItem.properties = item.properties;
                        }
                        items.push(pickupItem);
                    }
                }
            }
        },

        // Catching methods
        catchDroppedItems: (source: any, items: IPickupItem<U>[], xpos: number, ypos: number) => {
            let dropBehaviour = checkDropBehaviour();

            let cell = list.el.cellFromPosition(xpos, ypos);
            let pos = null;
            let destFormat = null;
            let onCell = false;
            if (dropBehaviour !== ItemDropBehaviour.Emptyspace && cell !== null) {
                let cellInfo = list.getCellInfo(cell);
                pos = list.getRelativeKey(cellInfo.valueIndex);
                destFormat = cellInfo.format;
                onCell = cellInfo.isValueCell;
            }
            let insert = dropBehaviour === ItemDropBehaviour.Insert;

            let itemsList = items;
            let overflowStartIndex = -1;
            if (list.isSingleItem && itemsList.length > 1) {
                itemsList = [items[0]];
                overflowStartIndex = 1;
            }

            for (let i = 0; i < itemsList.length; i++) {
                if (onCell) {
                    let subkeys = destFormat.allFormats(itemsList[i].value.format);
                    for (let x = 0; x < subkeys.length; x++) {
                        let key = pos.concat(subkeys[x].key);
                        let item = itemsList[i++];
                        if (list.addRawToOption(item.value.raw, key, insert, item.value.format) === false) {
                            overflowStartIndex = i;
                            break;
                        }
                        insert = false;
                        if (i >= itemsList.length)
                            break;
                    }
                }
                else {
                    if (list.addRawToOption(itemsList[i].value.raw, null, false, itemsList[i].value.format) === false) {
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
                list.emit('dropoverflow', source, items.slice(overflowStartIndex));
        },

        filterItemsForDrop: undefined, // defined below


        onDraggingLeave: () => {
            if (_$hoverCell !== null) {
                _$hoverCell.classList.remove('item-hovering');
                _$hoverCell.classList.remove('item-overwrite-on-drop');
                _$hoverCell.classList.remove('item-insert-on-drop');
                _$hoverCell.classList.remove('item-emptyspace-on-drop');
                _$hoverCell = null;
            }
        },

        hasSubDropTarget: (xpos: number, ypos: number) : IDragDropTarget<U> => {
            let cell =  list.el.cellFromPosition(xpos, ypos);
            let subDroppable = null;
            if (cell !== null && cell.item !== null && cell.item.dragDropManager !== undefined)
                subDroppable = cell.item;
            return subDroppable;
        },

        onDraggingOver: (xpos: number, ypos: number) => {
            let dropBehaviour = checkDropBehaviour();
            if (_$hoverCell !== null) {
                _$hoverCell.classList.remove('item-hovering');
                _$hoverCell.classList.remove('item-overwrite-on-drop');
                _$hoverCell.classList.remove('item-insert-on-drop');
                _$hoverCell.classList.remove('item-emptyspace-on-drop');
                _$hoverCell = null;
            }

            let cell =  list.el.cellFromPosition(xpos, ypos);
            let cellInfo: ICellInfo<U> = null;
            if (cell !== null)
                cellInfo = list.getCellInfo(cell);

            if (cellInfo !== null) {

                let hasMaxItemCount = list.maxItemCount >= 0;
                if (cellInfo.isValueCell === false && hasMaxItemCount && list.getOption().getLength(list.getValueKey()) >= list.maxItemCount)
                    return;

                if (cellInfo.isValueCell === false)
                    dropBehaviour = ItemDropBehaviour.Insert;

                _$hoverCell = cell.content;
                _$hoverCell.classList.add('item-hovering');
                _$hoverCell.classList.add('item-' + dropBehaviour + '-on-drop');
            }
        },

        inspectDraggedItems: (source, items: IPickupItem<U>[]) => {

        },

        dropTargetElement: () : HTMLElement => {
            let parent = list._parentControl;
            let dropArea = list.el;
            while (parent !== null) {
                let isTargetChain = false;
                if (parent.hasProperty('targetArea') === true && parent.getPropertyValue('targetArea') === true)
                    dropArea = parent.el;
                else
                    break;

                parent = parent._parentControl;
            }
            return dropArea;
        },

        preprocessItems: undefined,  // defined below;

        itemCount: (item: IItem<U>) : number => {
            let count = 0;
            for (let i = 0; i < list.el._cells.length; i++) {
                let cellInfo = list.getCellInfo(list.el._cells[i]);
                if (cellInfo.value !== null && cellInfo.value !== undefined) {
                    let subFormatInfo = cellInfo.format.allFormats();
                    for (let sf = 0; sf < subFormatInfo.length; sf++) {
                        if (item.value.equalTo(new FormattedValue(parent._findValueWithKey(cellInfo.value, subFormatInfo[sf].key), subFormatInfo[sf].format)))
                            count += 1;
                    }
                }
            }
            return count;
        },

        blockActionButtons: ($except, target) => {
            parent.blockActionButtons($except, target);
        },

        unblockActionButtons: () => {
            return parent.unblockActionButtons();
        },

        getDefaultTransferAction: (): TransferAction<U> => {
            throw 'this function has not been attached';
        },

        applyTransferActionToItems: <I extends IItem<U>>(items: I[], action: TransferAction<U>): I[] => {
            throw 'this function has not been attached';
        }
    }

    let supplierTarget = Object.assign(list, dragDropTarget);

    supplierTarget.dragDropManager = new DragNDrop(supplierTarget);
    supplierTarget.preprocessItems = <I extends IItem<U>>(items: I[], from: IDragDropTarget<U>, action=undefined, silent=false): I[] => {

            let intoSelf = from === supplierTarget;
            if (from === parent._supplier) {
                if (action === undefined)
                    action = supplierTarget.getDefaultTransferAction();

                items = supplierTarget.applyTransferActionToItems(items, action);
            }

            let data = { items: items, intoSelf: intoSelf, action: action };
            supplierTarget.emit('preprocess', data);

            let testedItems: I[] = [];
            for (let i = 0; i < data.items.length; i++) {
                let permitted = data.items[i].properties === undefined || data.items[i].properties.permitted === undefined || data.items[i].properties.permitted === true;
                if (intoSelf || (supplierTarget.testValue(data.items[i], silent) && permitted)) {
                    testedItems.push(data.items[i]);
                }
            }
            return testedItems;
    };
    supplierTarget.filterItemsForDrop = (items: IPickupItem<U>[], from: IDragDropTarget<U>, xpos: number, ypos: number): IPickupItem<U>[] => {
        return supplierTarget.preprocessItems(items, from);
    };

    return supplierTarget;
}

function isPossibleSupplierTargetList<U>(obj: any): obj is SelectableOptionListControl<TargetListControlProperties<U>> {
    return obj !== null && obj instanceof SelectableOptionListControl && obj.hasProperty('isTarget') && obj.getPropertyValue('isTarget');
}

function isSupplierTargetList<U>(obj: any): obj is SupplierTargetList<U> {
    return obj && obj.dragDropManager && obj.dragDropManager instanceof DragNDrop;
}

enum DropOverflow {
    Discard = 'discard',
    TryNext = 'tryNext'
}

enum TransferActionType {
    None = 'none',
    Interactions = 'interactions',
    Maineffects = 'maineffects',
    All2way = 'all2way',
    All3way = 'all3way',
    All4way = 'all4way',
    All5way = 'all5way',
    Interaction = 'interaction'
}

export type GridTargetContainerProperties = GridControlProperties & {
    label: string;
    margin: Margin;
    style: LayoutStyle;
    dropOverflow: DropOverflow;
    transferAction: TransferActionType;

    changing: (event: any) => void;
}

type LayoutSupplierViewType<U> = InstanceType<typeof LayoutSupplierView<SupplierViewProperties<U>>>;

export class GridTargetContainer<U> extends GridControl<GridTargetContainerProperties> {

    targetGrids: SupplierTargetList<U>[] = [];
    targetGrid: SupplierTargetList<U>;
    _supplier: LayoutSupplierViewType<U> = null;
    gainOnClick: boolean = true;
    _actionsBlocked = false;
    _actionStarted = 0;
    container: InstanceType<typeof ControlContainer>;
    controls: any[] = [];
    label: HTMLElement;
    buttons: HTMLElement;
    /**
     * @deprecated Should not be used. Rather use `(property) Control.label: HTMLElement`.
     */
    $buttons: any;
    toolbar : Toolbar;
    _targetDoubleClickDetect = 0;
    _targetDoubleClickDetectObj = null;
    _supplierDoubleClickDetect = 0;
    _normalAction: TransferAction<U>;
    labelId: string;
    _supplierDoubleClickDetectObj: EventTarget;

    /**
     * @deprecated Should not be used. Rather use `(property) Control.label: HTMLElement`.
     */
    $label: any;

    constructor(params: GridTargetContainerProperties, parent) {
        super(params, parent);

        let containerParams: ControlContainerProperties = {
            controls: this.getPropertyValue('controls'),
            style: this.getPropertyValue('style'),
            stretchFactor: 1
        };

        this.container = new ControlContainer(containerParams, this);

        this.targetGrid = null;

        this.targetGridSelectionChanged = this.targetGridSelectionChanged.bind(this);
        this._onGridGotFocus = this._onGridGotFocus.bind(this);
        this._onSupplierSelectionChanged = this._onSupplierSelectionChanged.bind(this);
        this._doubleClickDetect = this._doubleClickDetect.bind(this);
    }



    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('label', null);
        this.registerSimpleProperty('margin', Margin.Normal, new EnumPropertyFilter(Margin, Margin.Normal));
        this.registerSimpleProperty('style', LayoutStyle.List, new EnumPropertyFilter(LayoutStyle, LayoutStyle.List));
        this.registerSimpleProperty('dropOverflow', DropOverflow.TryNext, new EnumPropertyFilter(DropOverflow, DropOverflow.TryNext));
        this.registerSimpleProperty('transferAction', TransferActionType.None, new EnumPropertyFilter(TransferActionType, TransferActionType.None));
    }

    override onPropertyChanged(name) {

        super.onPropertyChanged(name);

        if (name === 'label' && this.label) {
            let label = this.getTranslatedProperty('label');
            this.label.innerText = label;
        }
    }

    setTargetGrid(targetGrid: SupplierTargetList<U>) {
        if (this.targetGrid)
            this.targetGrid.el.removeEventListener('layoutgrid.selectionChanged', this.targetGridSelectionChanged);

        this.targetGrid = targetGrid;

        if (this.targetGrid)
            this.targetGrid.el.addEventListener('layoutgrid.selectionChanged', this.targetGridSelectionChanged);
    }

    _onSupplierSelectionChanged() {
        if (this._actionStarted === 0)
            this.setButtonsMode(this.gainOnClick); // update aria tags
    }

    targetGridSelectionChanged() {
        if (this._actionStarted === 0)
            this.setButtonsMode(this.gainOnClick); // update aria tags
    }

    removeListBox<P extends SelectableOptionListControlProperties<U>>(listbox: SelectableOptionListControl<P, U>) {
        if (isSupplierTargetList<U>(listbox)) {
            for (let i = 0; i < this.targetGrids.length; i++) {
                if (this.targetGrids[i] === listbox) {
                    this.targetGrids.splice(i, 1);
                    break;
                }
            }

            if (this.targetGrid === listbox)
                this.setTargetGrid(this.targetGrids.length > 0 ? this.targetGrids[0] : null);

            delete listbox.blockActionButtons;
            delete listbox.unblockActionButtons;

            if (this._supplier !== null) {
                this.pushRowsBackToSupplier(listbox, 0, listbox._localData.length);
                this._supplier.filterSuppliersList();
                this._supplier.removeTarget(listbox);
            }

            listbox.dragDropManager.unregisterDropTargets(listbox);

            listbox.dragDropManager.disposeDragDrop(listbox.el);

            listbox.el.classList.remove('silky-target-list');

            listbox.removeAllListeners();
            //listbox.el.off();
        }
    }

    findTargetListControl(container) {
        if (container instanceof SelectableOptionListControl) {
            let selectableContainer = container; //container as SelectableOptionListControlType<U>;
            let isTarget = selectableContainer.hasProperty('isTarget') && selectableContainer.getPropertyValue('isTarget');
            if (isTarget)
                return container;
        }

        if (container.getControls) {
            let ctrls = container.getControls();
            for (let i = 0; i < ctrls.length; i++) {
                let target = this.findTargetListControl(ctrls[i]);
                if (target)
                    return target;
            }
        }

        return null;
    }

    addListBox(listbox: SelectableOptionListControl<SelectableOptionListControlProperties<U>>) {
        
        listbox.el.setCellBorders(listbox._columnInfoList.length > 1 ? 'columns' : null);

        listbox.on('listItemAdded', (data) => {
            let {item, index} = data;
            this.searchForListControls(item);
        });

        listbox.on('listItemRemoved', (data) => {
            let {item} = data;
            this.searchForListControls(item, true);
        });

        if (isPossibleSupplierTargetList(listbox) === false) {
            if (this.targetGrid === null) {
                listbox.setFocus();
            }

            listbox.el.addEventListener('layoutgrid.selectionChanged', () => {
                if (listbox.el.hasFocus) {
                    let cell = listbox.el.getSelectedCell(0);
                    if (cell && cell.item) {
                        this.setTargetGrid(this.findTargetListControl(cell.item));
                        if (this.gainOnClick === false) {
                            if (this.targetGrid.setFocus() === false) {
                                for (let a = 0; a < this.targetGrids.length; a++) {
                                    let targetlist = this.targetGrids[a];
                                    targetlist.el.clearSelection();
                                }
                            }
                        }
                    }
                }
            });
        }
        else {
            TargetListSupport<U>(listbox , this);

            if (isSupplierTargetList<U>(listbox)) {

                if (this.targetGrid === null)
                    this.setTargetGrid(listbox);
                this.targetGrids.push(listbox);

                listbox.getSiblingCount = () => {
                    return this.targetGrids.length - 1;
                };

                listbox.getDefaultTransferAction = () => {
                    return this.getDefaultTransferAction();
                };

                listbox.applyTransferActionToItems = (items, action: TransferAction<U>) => {
                    return this.applyTransferActionToItems(items, action);
                };

                listbox.dragDropManager.setPickupSourceElement(listbox.el);

                listbox.el.classList.add('silky-target-list');

                let dropOverflow = this.getPropertyValue('dropOverflow');
                if (dropOverflow !== DropOverflow.Discard) {
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
                }

                listbox.on('changing', (event) => {
                    this.emit('changing', event);
                });

                listbox.el.addEventListener('layoutgrid.gotFocus', () => {
                    if (listbox.el.hasFocus) {
                        this.setTargetGrid(listbox);
                    }
                    this.onSelectionChanged(listbox);
                });
                listbox.el.addEventListener('layoutgrid.lostFocus', () => {
                    if (listbox.el.hasFocus) {
                        this.setTargetGrid(listbox);
                    }
                    this.onSelectionChanged(listbox);
                });

                this._targetDoubleClickDetect = 0;
                this._targetDoubleClickDetectObj = null;
                listbox.el.addEventListener('click', (event) => {
                    this.setTargetGrid(listbox);
                    if (this._targetDoubleClickDetectObj !== event.target)
                        this._targetDoubleClickDetect = 0;
                    this._targetDoubleClickDetect += 1;
                    this._targetDoubleClickDetectObj = event.target;
                    if (this._targetDoubleClickDetect === 1) {
                        setTimeout(() => {
                            if (this._targetDoubleClickDetect > 1)
                                this.onAddButtonClick();
                            this._targetDoubleClickDetect = 0;
                        }, 300);
                    }
                });

                //overrideing functions in the target grid
                listbox.on('optionValueInserting', (event) => {
                    let key = event.key;
                    if (key.length !== 1) {
                        event.cancel = true;
                        return;
                    }

                    if (this._supplier !== null)
                        this.pushRowsBackToSupplier(listbox, 0, listbox._localData.length);
                });

                listbox.on('optionValueInserted', ({ key, data }) => {
                    if (key.length !== 1)
                        return;

                    this.updateSupplierItems(listbox);
                });

                //overrideing functions in the target grid
                listbox.on('optionValueRemoving', (event) => {
                    let key = event.key;
                    if (key.length !== 1) {
                        event.cancel = true;
                        return;
                    }

                    if (this._supplier !== null)
                        this.pushRowsBackToSupplier(listbox, key[0], 1);
                });

                listbox.on('optionValueRemoved', (event) => {
                    let key = event.key;
                    if (key.length !== 1)
                        return;

                    if (this._supplier !== null)
                        this._supplier.filterSuppliersList();
                });

                //overrideing functions in the target grid
                listbox.on('optionValueChanging', ({ key, data }) => {
                    if (this._supplier !== null)
                        this.pushRowsBackToSupplier(listbox, 0, listbox._localData.length);
                });

                listbox.on('optionValueChanged', ({ key, data }) => {
                    this.updateSupplierItems(listbox);
                });

                if (this._supplier !== null) {
                    this._supplier.addTarget(listbox);
                    this.updateSupplierItems(listbox);
                }
                listbox.dragDropManager.registerDropTargets(listbox);
            }
        }
    }

    setSupplier(supplier: LayoutSupplierViewType<U>) {
        if (this._supplier !== null) {
            this._supplier.supplier.removeEventListener('layoutgrid.selectionChanged', this._onSupplierSelectionChanged);
            this._supplier.supplier.removeEventListener('layoutgrid.gotFocus', this._onGridGotFocus);
            this._supplier.supplier.removeEventListener('click', this._doubleClickDetect);

            for (let i = 0; i < this.targetGrids.length; i++) {
                let targetGrid = this.targetGrids[i];
                this._supplier.removeTarget(targetGrid);
                this.pushRowsBackToSupplier(targetGrid, 0, targetGrid._localData.length);
            }
        }

        this._supplier = supplier;

        if (this._supplier !== null) {
            this._supplier.supplier.addEventListener('layoutgrid.selectionChanged', this._onSupplierSelectionChanged);
            this._supplier.supplier.addEventListener('layoutgrid.gotFocus', this._onGridGotFocus);
            this._supplierDoubleClickDetect = 0;
            this._supplier.supplier.addEventListener('click', this._doubleClickDetect);

            for (let i = 0; i < this.targetGrids.length; i++) {
                let targetGrid = this.targetGrids[i];
                this._supplier.addTarget(targetGrid);
                this.updateSupplierItems(targetGrid);
            }
        }
    }

    override onDisposed() {
        super.onDisposed();

        this.setSupplier(null);
        while (this.targetGrids.length > 0)
            this.removeListBox(this.targetGrids[0]);

        this.container.dispose();
    }

    onSelectionChanged(listbox: OptionListControlType<U>) {
        if (this.buttons && listbox === this.targetGrid) {
            let gainOnClick = this.targetGrid.el.hasFocus === false;
            this.setButtonsMode(gainOnClick);
        }
    }

    toStringList(raw) {
        if (raw.length === 1)
            return raw[0].toString();

        let list = raw[0].toString();
        if (raw.length > 2) {
            for (let i = 1; i < raw.length - 1; i++) {
                list = s_('{list}, {nextItem}', { list: list, nextItem: raw[i].toString() });
            }
        }
        let last = raw[raw.length - 1].toString();
        return s_('{list} and {lastItem}', {list: list, lastItem: last});
    }

    setButtonsMode(gainOnClick) {
        this.gainOnClick = gainOnClick;
        const dir = window.getComputedStyle(this.buttons).direction;
        if (dir === 'rtl') {
            this.buttons.classList.add(gainOnClick ? 'arrow-left' : 'arrow-right');
            this.buttons.classList.remove(gainOnClick ? 'arrow-right' : 'arrow-left');
        }
        else {
            this.buttons.classList.add(gainOnClick ? 'arrow-right' : 'arrow-left');
            this.buttons.classList.remove(gainOnClick ? 'arrow-left' : 'arrow-right');
        }
        let label = this.getTranslatedProperty('label');
        if (this.gainOnClick) {
            let action = this.getDefaultTransferAction();
            let selectedItems = this.getSupplierItems(action, true);
            if (selectedItems.length === 0)
                this.buttons.querySelector<HTMLElement>('.jmv-variable-transfer').setAttribute('aria-label', s_('Add items to {0}', [label])); 
            else if (selectedItems.length === 1) 
                this.buttons.querySelector<HTMLElement>('.jmv-variable-transfer').setAttribute('aria-label', s_('Add item {1} to {0}', [label, selectedItems[0].value.toAriaLabel()]));
            else 
                this.buttons.querySelector<HTMLElement>('.jmv-variable-transfer').setAttribute('aria-label', s_('Add {1} items to {0}', [label, selectedItems.length]));            
        }
        else {
            let count = this.targetGrid.el.selectedCellCount();
            if (count === 0)
                this.buttons.querySelector<HTMLElement>('.jmv-variable-transfer').setAttribute('aria-label', s_('Remove items from {0}', [label]));
            else if (count === 1) {
                let cell = this.targetGrid.el.getSelectedCell(0);
                this.buttons.querySelector<HTMLElement>('.jmv-variable-transfer').setAttribute('aria-label', s_('Remove {1} from {0}', [label, cell.item.getAriaLabel()]));
            }
            else
                this.buttons.querySelector<HTMLElement>('.jmv-variable-transfer').setAttribute('aria-label', s_('Remove {1} items from {0}', [label, count]));
        }
    }

    _onGridGotFocus() {
        this.setButtonsMode(true);
        for (let a = 0; a < this.targetGrids.length; a++) {
            let targetlist = this.targetGrids[a];
            targetlist.el.clearSelection();
        }
        this.unblockActionButtons();
    }

    valueTransferConversion?(action: TransferAction<U>, values): any[]

    applyTransferActionToItems(items, action: TransferAction<U>) {
        if (action === undefined || action.resultFormat === null)
            return items;

        let values = this.itemsToValues(items);

        if (this.valueTransferConversion) {
            let newValues = this.valueTransferConversion(action, values);
            if (newValues !== null) {
                return this.valuesToItems(newValues, action.resultFormat);
            }
        }

        switch (action.name) {
            case 'none':
            case 'maineffects':
                return this.convertItems(items, action.resultFormat);
            case 'interaction':
                let interaction = [];
                for (let value of values) {
                    if (Array.isArray(value))
                        interaction = interaction.concat(value);
                    else
                        interaction.push(value);
                }
                return this.valuesToItems([interaction], action.resultFormat);
            case 'all2way':
                return this.valuesToItems(this.getInteractions(values, 2, 2), action.resultFormat);
            case 'all3way':
                return this.valuesToItems(this.getInteractions(values, 3, 3), action.resultFormat);
            case 'all4way':
                return this.valuesToItems(this.getInteractions(values, 4, 4), action.resultFormat);
            case 'all5way':
                return this.valuesToItems(this.getInteractions(values, 5, 5), action.resultFormat);
            case 'interactions':
                return this.valuesToItems(this.getInteractions(values), action.resultFormat);
        }

        return items;
    }

    getInteractions(values, minLength = 1, maxLength = -1) {
        let counts = [0];
        let findPosition = (length) => {
            let pos = 0;
            for (let k = 0; k < length; k++) {
                let count = counts[k];
                if (count === undefined)
                    count = 0;
                pos += count;
            }
            return pos;
        };

        let list = [];
        for (let i = 0; i < values.length; i++) {
            let listLength = list.length;
            let rawVar = values[i];

            for (let j = 0; j < listLength; j++) {
                let f = list[j];
                if (maxLength > 1 && f.length === maxLength)
                    break;

                if (f.includes(rawVar) === false) {
                    let newVar = JSON.parse(JSON.stringify(f));

                    newVar.push(rawVar);

                    list.splice(findPosition(newVar.length), 0, newVar);
                    if (counts[newVar.length - 1] === undefined)
                        counts[newVar.length - 1] = 1;
                    else
                        counts[newVar.length - 1] += 1;

                    listLength += 1;
                }
            }
            list.splice(i, 0, [rawVar]);
            counts[0] += 1;
        }

        if (minLength > 1)
            list.splice(0, findPosition(minLength - 1));

        for (let i = 0; i < list.length; i++)
            list[i] = this._flattenList(list[i]);

        return list;
    }

    _flattenList(list) {
        let flatList = [];
        for (let value of list) {
            if (Array.isArray(value))
                flatList = flatList.concat(this._flattenList(value));
            else
                flatList.push(value);
        }
        return flatList;
    }

    convertItems(items, toFormat) {
        let newItems = [];
        for (let i = 0; i < items.length; i++)
            newItems.push({ value: items[i].value.convert(toFormat, { power: items[i].properties.power }) });

        return newItems;
    }

    valuesToItems(values, format) {
        let list = [];
        for (let i = 0; i < values.length; i++) {
            if (format == FormatDef.variable && Array.isArray(values[i]))
                list.push({ value: new FormattedValue(values[i][0], format), properties: { power: values[i].length } });
            else
                list.push({ value: new FormattedValue(values[i], format) });
        }
        return list;
    }

    itemsToValues(items) {
        let list = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].properties.power > 1) {
                let g = [];
                for (let h = 0; h < items[i].properties.power; h++)
                    g.push(items[i].value.raw);

                list.push(g);
            }
            else
                list.push(items[i].value.raw);
        }
        return list;
    }

    getSupplierItems(action, silent=false) {
        let items = this._supplier.getSelectedItems();

        if (items.length > 0 && this.targetGrid.isSingleItem && this.targetGrids.length === 1)
            items = [items[0]];
        return this.targetGrid.preprocessItems(items, this._supplier, action, silent);
    }

    addRawToOption(item, key, insert) {
        if (this.targetGrid === null)
            return false;

        return this.targetGrid.addRawToOption(item.value.raw, key, insert, item.value.format);
    }

    updateSupplierItems(list: OptionListControlType<U>) {
        if (this._supplier !== null) {
            for (let i = 0; i < list.el._cells.length; i++) {
                let cellInfo = list.getCellInfo(list.el._cells[i]);
                if (cellInfo.value !== null && cellInfo.value !== undefined) {
                    let subFormatInfo = cellInfo.format.allFormats();
                    for (let sf = 0; sf < subFormatInfo.length; sf++)
                        this._supplier.pullItem(new FormattedValue(this._findValueWithKey(cellInfo.value, subFormatInfo[sf].key), subFormatInfo[sf].format));
                }
            }

            this._supplier.filterSuppliersList();
        }
    }

    findListWithSpace(fromList, format=undefined) {
        let foundList = false;
        for (let i = 0; i < this.targetGrids.length; i++) {
            if (foundList && this.targetGrids[i].hasSpace(format))
                return this.targetGrids[i];
            else if (fromList === this.targetGrids[i])
                foundList = true;
        }

        return null;
    }

    onAddButtonClick(action=undefined) {

        if (action === undefined)
            action = this.getDefaultTransferAction();

        if (this.targetGrid === null)
            return;

        this._actionStarted += 1;
        this._supplier.blockFilterProcess = true;

        let postProcessList = null;
        let postProcessSelectionIndex = null;
        this.targetGrid.option.runInEditScope(() => {
            this.targetGrid.runInEditScope(() => {
                let label = this.getTranslatedProperty('label');
                if (this.gainOnClick) {
                    let selectedItems = this.getSupplierItems(action);
                    let selectedCount = selectedItems.length;
                    if (selectedCount > 0) {
                        if (selectedItems.length === 1) 
                            A11y.speakMessage(s_('{vars} added to {list}.', {vars: selectedItems[0].value.toAriaLabel(), list: label}));
                        else 
                            A11y.speakMessage(s_('{vars} items added to {list}.', {vars: selectedCount, list: label}));   

                        for (let i = 0; i < selectedCount; i++) {
                            let selectedItem = selectedItems[i];
                            if (postProcessSelectionIndex === null || postProcessSelectionIndex > selectedItem.index) {
                                postProcessSelectionIndex = selectedItem.index;
                                if (this._supplier.getPropertyValue('persistentItems'))
                                    postProcessSelectionIndex += 1;
                            }

                            let nextTarget = this.targetGrid;
                            while (this.addRawToOption(selectedItem, null, false) === false) {
                                nextTarget = this.findListWithSpace(this.targetGrid);
                                if (nextTarget === null)
                                    break;

                                this.setTargetGrid(nextTarget);
                            }

                            if (nextTarget === null)
                                break;
                        }
                        postProcessList = this._supplier;
                    }
                }
                else if (this.targetGrid.el.selectedCellCount() > 0) {
                    let startRow = -1;
                    let length = 0;
                    let selectionCount = this.targetGrid.el.selectedCellCount();
                    let index = 0;
                    let removedVar = null;
                    while (this.targetGrid.el.selectedCellCount() > index) {
                        let cell = this.targetGrid.el.getSelectedCell(index);
                        removedVar = cell.item.getAriaLabel();
                        let rowIndex = this.targetGrid.displayRowToRowIndex(cell.data.row);
                        if (postProcessSelectionIndex === null || postProcessSelectionIndex > rowIndex)
                            postProcessSelectionIndex = rowIndex;

                        if (this.targetGrid.removeFromOption(this.targetGrid.getCellInfo(cell)) === false)
                            index += 1; 
                    }

                    let removedCount = selectionCount - index;
                    if (removedCount === 1)
                        A11y.speakMessage(s_('{vars} removed from {list}.', {vars: removedVar, list: label}));
                    else
                        A11y.speakMessage(s_('{vars} items removed from {list}.', {vars: removedCount, list: label})); 
                    postProcessList = this.targetGrid;
                }
            });
        });
        
        this._supplier.blockFilterProcess = false;
        this._supplier.filterSuppliersList();

        if (postProcessSelectionIndex !== null)
            postProcessList.selectNextAvaliableItem(postProcessSelectionIndex);

        this._actionStarted -= 1;
    }

    _enableButtons(toolbar, value, disableSupplyOnly=false) {

        for (let i = 0; i < toolbar.items.length; i++) {
            let button = toolbar.items[i];

            if (button.setEnabled) {
                if (value === false || this.checkEnableState(button, disableSupplyOnly) === false)
                    button.setEnabled(false);
                else
                    button.setEnabled(true);
            }

            if (button.items && button.items.length > 0)
                this._enableButtons(button, value, disableSupplyOnly);
        }


    }

    checkEnableState(button, disableSupplyOnly=false) {
        if (disableSupplyOnly) {
            if (button.name === 'transferActions')
                return false;
        }

        let selectedCount = this._supplier.getSelectionCount();

        switch (button.name) {
            case 'interaction':
            case 'all2way':
                return selectedCount >= 2;
            case 'all3way':
                return selectedCount >= 3;
            case 'all4way':
                return selectedCount >= 4;
            case 'all5way':
                return selectedCount >= 5;
        }

        return true;
    }

    containsTarget(target) {
        for (let i = 0; i < this.targetGrids.length; i++) {
            if (this.targetGrids[i] === target)
                return true;
        }

        return false;
    }

    blockActionButtons($except, target) {

        let fullBlock = $except !== this.buttons;

        this._enableButtons(this.toolbar, fullBlock === false, this.containsTarget(target) === false || target !== this._supplier);
        this._actionsBlocked = fullBlock;

        for (let a = 0; a < this.targetGrids.length; a++) {
            let targetlist = this.targetGrids[a];
            if (fullBlock || targetlist !== this.targetGrid)
                targetlist.el.clearSelection();
        }
    }

    unblockActionButtons() {
        if (this.toolbar)
            this._enableButtons(this.toolbar, true);
        this._actionsBlocked = false;
        return this.buttons;
    }

    pushRowsBackToSupplier(list: OptionListControlType<U>, rowIndex, count) {
        count = count === undefined ? 1 : count;
        for (let row = rowIndex; row < rowIndex + count; row++) {
            let rowCells = list.el.getRow(list.rowIndexToDisplayIndex(row));
            for (let c = 0; c < rowCells.length; c++) {
                let rowCell = rowCells[c];
                let columnInfo = list._columnInfoList[rowCell.data.column];
                let cellInfo = list.getCellInfo(rowCell);
                if (cellInfo.value !== null && cellInfo.value !== undefined) {
                    let subFormatInfo = cellInfo.format.allFormats();
                    for (let sf = 0; sf < subFormatInfo.length; sf++)
                        this._supplier.pushItem(new FormattedValue(this._findValueWithKey(cellInfo.value, subFormatInfo[sf].key), subFormatInfo[sf].format));
                }
            }
        }
    }

    _doubleClickDetect(event: MouseEvent) {
        if (this._supplier.isMultiTarget())
            return;

        if (this._supplierDoubleClickDetectObj !== event.target)
            this._supplierDoubleClickDetect = 0;
        this._supplierDoubleClickDetect += 1;
        this._supplierDoubleClickDetectObj = event.target;

        if (this._supplierDoubleClickDetect === 1) {
            setTimeout(function () {
                if (this._supplierDoubleClickDetect > 1)
                    this.onAddButtonClick();
                this._supplierDoubleClickDetect = 0;
            }, 300);
        }
    }

    _findValueWithKey(data, key) {
        let value = data;
        for (let i = 0; i < key.length; i++)
            value = value[key[i]];

        return value;
    }

    renderContainer(context: IControlProvider) {
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
    }

    searchForListControls(container, removing=false) {
        if (container instanceof SelectableOptionListControl) {
            let selectableContainer = container as SelectableOptionListControl<SelectableOptionListControlProperties<U>>;
            if (removing)
                this.removeListBox(selectableContainer);
            else
                this.addListBox(selectableContainer);
        }

        if (container.getControls) {
            let ctrls = container.getControls();
            for (let i = 0; i < ctrls.length; i++)
                this.searchForListControls(ctrls[i], removing);
        }
    }

    getControls() {
        return this.controls;
    }

    getDefaultTransferAction() {
        if (this._normalAction === undefined) {
            let transferAction = this.getPropertyValue('transferAction');
            let transferFormat = null;
            if (transferAction === 'interactions')
                transferFormat = FormatDef.term;

            this._normalAction = { name: transferAction, resultFormat: transferFormat };
        }

        return this._normalAction;
    }

    override onRenderToGrid(grid: LayoutGrid, row, column, owner) {
        let label = this.getPropertyValue('label');
        if (label !== null) {
            label = this.translate(label);
            this.labelId = A11y.getNextAriaElementId('label');
            this.label = HTML.parse(`<div id="${this.labelId}" style="white-space: nowrap;" class="silky-target-list-header silky-control-margin-${this.getPropertyValue('margin')}">${label}</div>`);
            this.$label = $(this.label);
            grid.addCell(column, row, this.label);
            this.container.controls[0].el.setAttribute('aria-labelledby', this.labelId);
        }

        if (owner instanceof LayoutSupplierView) {
            let transferAction = this.getPropertyValue('transferAction');

            let buttons = [
                new ToolbarButton({ title: '', name: 'normal', size: 'small', classes: 'jmv-variable-transfer' })
            ];

            if (transferAction === TransferActionType.Interactions || this.populateTransferActions) {
                let transferActionItems = [
                    new ToolbarButton({ title: s_('Interaction'), name: 'interaction', hasIcon: false, resultFormat: FormatDef.term }),
                    new ToolbarGroup({ title: s_('Interactions'), name: 'interactions', orientation: 'vertical', items: [
                        new ToolbarButton({ title: s_('Main Effects'), name: 'maineffects', hasIcon: false, resultFormat: FormatDef.term }),
                        new ToolbarButton({ title: s_('All {n} way', { n: '2' }), name: 'all2way', hasIcon: false, resultFormat: FormatDef.term }),
                        new ToolbarButton({ title: s_('All {n} way', { n: '3' }), name: 'all3way', hasIcon: false, resultFormat: FormatDef.term }),
                        new ToolbarButton({ title: s_('All {n} way', { n: '4' }), name: 'all4way', hasIcon: false, resultFormat: FormatDef.term }),
                        new ToolbarButton({ title: s_('All {n} way', { n: '5' }), name: 'all5way', hasIcon: false, resultFormat: FormatDef.term })
                    ]})
                ];

                if (this.populateTransferActions)
                    transferActionItems = transferActionItems.concat(this.populateTransferActions());

                buttons.push(new ToolbarButton({
                    title: '',
                    name: 'transferActions',
                    size: 'small',
                    classes: 'jmv-variable-transfer-collection jmv-variable-interaction-transfer',
                    items: transferActionItems
                }));
            }

            this.toolbar = new Toolbar([
                new ToolbarGroup({ orientation: 'vertical', items: buttons, classes: 'jmv-variable-transfer-toolbar' })
            ]);


            this.buttons = this.toolbar.el;
            this.$buttons = $(this.buttons);
            this.buttons.classList.add('arrow-right');
            this.toolbar.on('buttonClicked', (item) => {
                if (this.gainOnClick && this.targetGrids.length > 0 && !this.targetGrid)
                    this.setTargetGrid(this.targetGrids[0]);
                if (this._actionsBlocked === false) {
                    switch (item.name) {
                        case 'normal':
                            this.onAddButtonClick();
                            break;
                        case 'transferActions':
                        case 'interactions':
                            this._enableButtons(item, true);
                            break;
                        default:
                            this.onAddButtonClick({ name: item.name, resultFormat: item.params.resultFormat });
                            break;
                    }
                }
            });

            let buttonsCell = grid.addCell('aux', row + 1, this.buttons);
            buttonsCell.setVerticalAlign('top');

            this.setSupplier(owner);
        }

        let info = this.container.renderToGrid(grid, row + 1, column, owner);
        info.cell.setVerticalAlign('stretch');

        return { height: 2, width: 2 };
    }

    protected populateTransferActions?(): (ToolbarButton | ToolbarGroup)[];
}

export default GridTargetContainer;
