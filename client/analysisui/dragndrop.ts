'use strict';

import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { FormattedValue } from './formatdef';

type TargetInfo<T> =  {
    target: IDragDropTarget<T>, 
    subTargetInfo: TargetInfo<T>,
    endTarget: TargetInfo<T>,
    x: { min: number, max: number },
    y: { min: number, max: number }
};

export interface IItem<T> {
    value: FormattedValue<T>;
    properties: any;
    el: HTMLElement;
}

export interface IPickupItem<T> extends IItem<T> { 
    cellInfo: any 
}

export interface IDragDropTarget<T> { 
    dragDropManager: DragNDrop<T>;
    onDraggingLeave?: () => void;
    onDragDropStart?: () => void;
    onDragDropEnd?: () => void;
    onDraggingOver?: (posX: number, posY: number) => void;
    onItemsDropping?: (items: IPickupItem<T>[], intoSelf: boolean) => void;
    hasSubDropTarget?: (xpos: number, ypos: number) => IDragDropTarget<T>;

    dropTargetElement: () => HTMLElement;
    catchDroppedItems: (source: any, items: IPickupItem<T>[], xpos?: number, ypos?: number) => void;
    filterItemsForDrop: (items: IPickupItem<T>[], from: IDragDropTarget<T>, xpos?: number, ypos?: number) => any[]
    getPickupItems: () => IItem<T>[];
    isValidDropZone?: (posX: number, posY: number) => boolean;
    inspectDraggedItems: (source: any, items: IPickupItem<T>[]) => void;
    itemCount?: (item: IItem<T>) => number;
};

export class DragNDrop<T> {
    static _dropId = 0;

    _el: HTMLElement = null;
    _targetHandles: Map<any, (event) => void> = new Map<any, (event) => void>();

    //_ddParent: any = null;
    _itemsBeingDragged: any = null;
    _isDragging = false;
    _currentTarget: TargetInfo<T> = { 
        target: null, 
        subTargetInfo: null,
        endTarget: null,
        x: { min: 0, max: 0 },
        y: { min: 0, max: 0 }
    };
    _dropId: any;
    _draggingLocked = false;
    _draggingOffset = { x: 0, y: 0 };
    _dropTargets: IDragDropTarget<T>[] = [];

    _owner: IDragDropTarget<T> = null;

    constructor(owner: IDragDropTarget<T>) {

        this._owner = owner;

        this._dropId = DragNDrop._dropId;
        DragNDrop._dropId += 1;

        this._ddMouseDown = this._ddMouseDown.bind(this);
        this._ddTouchStart = this._ddTouchStart.bind(this);
        this._ddMouseUp = this._ddMouseUp.bind(this);
        this._ddMouseMove = this._ddMouseMove.bind(this);
        this._ddTouchEnd = this._ddTouchEnd.bind(this);
        this._ddTouchMove = this._ddTouchMove.bind(this);
        this._mouseEnterDropTarget = this._mouseEnterDropTarget.bind(this);
        this._mouseLeaveDropTarget = this._mouseLeaveDropTarget.bind(this);
    }

    public setPickupSourceElement($source: HTMLElement) {
        $source.addEventListener('mousedown', this._ddMouseDown);
        $source.addEventListener('touchstart', this._ddTouchStart);
    }

    public disposeDragDrop($source: HTMLElement) {
        $source.removeEventListener("mousedown", this._ddMouseDown);
        $source.removeEventListener('touchstart', this._ddTouchStart);
    }

    public dropIntoTarget(target: IDragDropTarget<T>, items, pageX, pageY) {
        let itemsToDrop = target.filterItemsForDrop(items, this._owner, pageX - this._currentTarget.endTarget.x.min, pageY - this._currentTarget.endTarget.y.min);
        if (itemsToDrop !== null && itemsToDrop.length !== 0) {
            if (target.onDragDropStart)
                target.onDragDropStart();
            if (this._owner.onDragDropStart)
                this._owner.onDragDropStart();

            if (this._owner.onItemsDropping)
                this._owner.onItemsDropping(itemsToDrop, this._dropId === target.dragDropManager._dropId);
            target.catchDroppedItems(this, itemsToDrop, pageX - this._currentTarget.endTarget.x.min, pageY - this._currentTarget.endTarget.y.min);

            if (target.onDragDropEnd)
                target.onDragDropEnd();
            if (this._owner.onDragDropEnd)
                this._owner.onDragDropEnd();

            if (target.onDraggingLeave)
                target.onDraggingLeave();
        }
    }

    public registerDropTargets(target: IDragDropTarget<T>) {
        this._dropTargets.push(target);

        let callBack = (event) => { this._mouseEnterDropTarget(event, target); };
        this._targetHandles.set(target, callBack);

        target.dropTargetElement().addEventListener('mouseenter', callBack);
        target.dropTargetElement().addEventListener('mouseleave', this._mouseLeaveDropTarget);
    }

    public unregisterDropTargets(target: IDragDropTarget<T>) {
        const index = this._dropTargets.indexOf(target);
        if (index > -1)
            this._dropTargets.splice(index, 1);

        let callBack = this._targetHandles.get(target);

        target.dropTargetElement().removeEventListener('mouseenter', callBack);
        target.dropTargetElement().removeEventListener('mouseleave', this._mouseLeaveDropTarget);

        this._targetHandles.delete(target);
    }

    private _ddMouseUp(event) {
        this._ddDropItems(event.pageX, event.pageY);
        document.removeEventListener('mousemove', this._ddMouseMove);
    }

    private _ddMouseDown(event) {
        if (this._draggingLocked)
            return;

        let items = this._owner.getPickupItems();
        this._ddPickupItems(items.length === 0 ? null : items);
        let sum = -1;
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let rect = item.el.getBoundingClientRect();
            let offset = { 
                top: rect.top + window.scrollY, 
                left: rect.left + window.scrollX, 
            };
            let dOffsetX = event.pageX - offset.left;
            let dOffsetY = event.pageY - offset.top;
            if (dOffsetX >= 0 && dOffsetY >= 0 && (dOffsetX + dOffsetY < sum || sum === -1)) {
                sum = dOffsetX + dOffsetY;
                this._draggingOffset.x = dOffsetX;
                this._draggingOffset.y = dOffsetY;
            }
        }
        this.setOverTarget(this._owner, event.pageX, event.pageY);

        document.addEventListener('mouseup', this._ddMouseUp, { once: true });
        document.addEventListener('mousemove', this._ddMouseMove);
    }

    private _ddTouchStart(event) {
        if (this._draggingLocked)
            return;

        let touchList = event.changedTouches;
        let pageX = touchList[0].pageX;
        let pageY = touchList[0].pageY;

        let items = this._owner.getPickupItems();
        this._ddPickupItems(items.length === 0 ? null : items);
        let sum = -1;
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            //let offset = item.el.offset();
            let rect = item.el.getBoundingClientRect();
            let offset = { 
                top: rect.top + window.scrollY, 
                left: rect.left + window.scrollX, 
            };
            let dOffsetX = pageX - offset.left;
            let dOffsetY = pageY - offset.top;
            if (dOffsetX >= 0 && dOffsetY >= 0 && (dOffsetX + dOffsetY < sum || sum === -1)) {
                sum = dOffsetX + dOffsetY;
                this._draggingOffset.x = dOffsetX;
                this._draggingOffset.y = dOffsetY;
            }
        }
        this.setOverTarget(this._owner, pageX, pageY);

        document.addEventListener('touchend', this._ddTouchEnd, { once: true });
        document.addEventListener('touchmove', this._ddTouchMove);
    }

    private _ddTouchMove(event) {
        if (this.hasDraggingItems() === false)
            return;

        if (this._isDragging === false) {
            this._el = this.constructDragElement(this._itemsBeingDragged);
            this._el.classList.add('silky-item-dragging');
            document.body.append(this._el);
            this._isDragging = true;
        }

        let touchList = event.changedTouches;
        let pageX = touchList[0].pageX;
        let pageY = touchList[0].pageY;

        // needed because touch doesn't have enter or leave events
        this._determineTarget(pageX, pageY);
        /////////////////////////////////

        let subTarget = this.fireDragging(pageX, pageY);
        if (subTarget !== null)
            this.setOverTarget(this.getTarget(subTarget, pageX, pageY));

        this._el.style.top = (pageY - this._draggingOffset.y).toString() + 'px';
        this._el.style.left = (pageX - this._draggingOffset.x).toString() + 'px';
    }

    private _ddTouchEnd(event) {
        let touchList = event.changedTouches;
        let pageX = touchList[0].pageX;
        let pageY = touchList[0].pageY;
        this._ddDropItems(pageX, pageY);
        document.removeEventListener('touchmove', this._ddTouchMove);
    }

    private _determineTarget(pageX, pageY) {
        if ( ! this._currentTarget || this._stillOverTarget(this._currentTarget.endTarget, pageX, pageY) === false) {
            for (let target of this._dropTargets) {
                let element = target.dropTargetElement();
                let rect = element.getBoundingClientRect();
                let offset = { 
                    top: rect.top + window.scrollY, 
                    left: rect.left + window.scrollX, 
                };
                //let offset = element.offset();
                let x = { min: offset.left, max: offset.left + rect.width };
                let y = { min: offset.top, max: offset.top + rect.height };

                let x_con = pageX >= x.min && pageX <= x.max;
                let y_con = pageY >= y.min && pageY <= y.max;
                let isOver = x_con && y_con;

                if (isOver && (!target.isValidDropZone || target.isValidDropZone(pageX, pageY))) {
                    if (! this._currentTarget || target !== this._currentTarget.endTarget.target) {
                        this.setOverTarget(target, pageX, pageY);
                        break;
                    }
                }
            }
        }
    }

    private _ddMouseMove(event) {
        if (this.hasDraggingItems() === false)
            return;

        if (this._isDragging === false) {
            this._el = this.constructDragElement(this._itemsBeingDragged);
            this._el.classList.add('silky-item-dragging');
            document.body.append(this._el);
            this._isDragging = true;
        }

        let subTarget = this.fireDragging(event.pageX, event.pageY);
        if (subTarget !== null)
            this.setOverTarget(this.getTarget(subTarget, event.pageX, event.pageY));

        this._el.style.top = (event.pageY - this._draggingOffset.y).toString()  + 'px';
        this._el.style.left = (event.pageX - this._draggingOffset.x).toString()  + 'px';
    }

    private fireDragging(pageX, pageY) {
        let targetInfo = this._currentTarget;
        let target: IDragDropTarget<T> = null;
        while (targetInfo !== null) {
            if (this._stillOverTarget(targetInfo, pageX, pageY)) {
                target = targetInfo.target;
                if (target.onDraggingOver)
                    target.onDraggingOver(pageX - targetInfo.x.min, pageY - targetInfo.y.min);
                targetInfo = targetInfo.subTargetInfo;
            }
            else
                targetInfo = null;
        }

        return target;
    }

    private getTarget(target: IDragDropTarget<T>, pageX, pageY) {

        let finalTarget = target;
        if (target !== null && target.hasSubDropTarget) {
            let element = target.dropTargetElement();
            let rect = element.getBoundingClientRect();
            let offset = { 
                top: rect.top + window.scrollY, 
                left: rect.left + window.scrollX, 
            };
            //let offset = element.offset();
            let subTarget = target.hasSubDropTarget(pageX - offset.left, pageY - offset.top);
            if (subTarget !== null && subTarget.hasSubDropTarget) {
                let subtar = subTarget.dragDropManager.getTarget(subTarget, pageX, pageY);
                if (subtar !== null)
                    subTarget = subtar;
            }
            if (subTarget !== null)
                finalTarget = subTarget;
        }

        return finalTarget;
    }

    private _ddPickupItems(items) {
        this._itemsBeingDragged = items;
    }

    private _ddDropItems(pageX, pageY) {
        if (this._isDragging) {
            if (this._stillOverTarget(this._currentTarget.endTarget, pageX, pageY)) {
                let target = this._currentTarget.endTarget.target;
                this.dropIntoTarget(target, this._itemsBeingDragged, pageX, pageY);
            }
            this._el.remove();
            this._isDragging = false;
        }

        this._itemsBeingDragged = null;
    }

    private _stillOverTarget(targetInfo: TargetInfo<T>, pageX, pageY) {
        if (targetInfo.target === null)
            return false;

        let x_con = pageX >= targetInfo.x.min && pageX <= targetInfo.x.max;
        let y_con = pageY >= targetInfo.y.min && pageY <= targetInfo.y.max;
        let isOver = x_con && y_con;

        return isOver && (!targetInfo.target.isValidDropZone || targetInfo.target.isValidDropZone(pageX, pageY));
    }

    private _mouseEnterDropTarget(event, target: IDragDropTarget<T>) {
        this.setOverTarget(target, event.pageX, event.pageY);
    }

    private _mouseLeaveDropTarget(event) {
        let target = this._currentTarget.target;
        if (target && target.dragDropManager._dropId === this._dropId && this._stillOverTarget(this._currentTarget, event.pageX, event.pageY) === false) {
            if (target.onDraggingLeave)
                target.onDraggingLeave();
            this._currentTarget.target = null;
        }
    }

    private setOverTarget(target: IDragDropTarget<T>, pageX=0, pageY=0) {

        if (this._isDragging)
            target.inspectDraggedItems(this, this._itemsBeingDragged);

        let element = target.dropTargetElement();
        let rect = element.getBoundingClientRect();
        let offset = { 
            top: rect.top + window.scrollY, 
            left: rect.left + window.scrollX, 
        };

        let targetInfo = {
            target: target,
            subTargetInfo: null,
            endTarget: null,
            x: { min: offset.left, max: offset.left + rect.width },
            y: { min: offset.top, max: offset.top + rect.height }
        };

        let parentInfo = targetInfo;

        parentInfo.endTarget = targetInfo;

        if (this._currentTarget !== null && this._currentTarget.target && parentInfo.target !== this._currentTarget.target) {
            if (this._currentTarget.target.onDraggingLeave)
                this._currentTarget.target.onDraggingLeave();
        }

        this._currentTarget = parentInfo;
    }

    private constructDragElement(items) {
        let itemsEl = HTML.create('div');
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let itemEl = item.el.cloneNode(true);
            itemEl.style.opacity= '1';
            itemEl.style.visibility = 'visible';
            itemEl.style.width = item.el.offsetWidth + "px";
            let itemOuter = HTML.parse('<div style="position: static;"></div>');
            itemOuter.style.position = 'relative';
            itemOuter.append(itemEl);
            itemEl.style.position = 'static';
            itemsEl.append(itemOuter);
        }
        return itemsEl;
    }

    private hasDraggingItems() {
        return this._itemsBeingDragged !== null;
    }
}

export default DragNDrop;
