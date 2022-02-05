'use strict';

const $ = require('jquery');
const SuperClass = require('../common/superclass');

const DragNDrop = function() {

    this._itemsBeingDragged = null;
    this._$el = null;
    this._ddParent = null;
    this._isDragging = false;
    this._currentTarget = { target: null };
    this._dropId = DragNDrop._dropId;
    DragNDrop._dropId += 1;
    this._draggingLocked = false;
    this._draggingOffset = { x: 0, y: 0 };
    this._dropTargets = [];

    this._ddMouseUp = function(event) {
        let self = event.data;
        self._ddDropItems(event.pageX, event.pageY);
        $(document).off('mousemove', self._ddMouseMove);
    };

    this._ddMouseDown = function(event) {
        let self = event.data;
        if (self._draggingLocked)
            return;

        let items = self.getPickupItems();
        self._ddPickupItems(items.length === 0 ? null : items);
        let sum = -1;
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let offset = item.$el.offset();
            let dOffsetX = event.pageX - offset.left;
            let dOffsetY = event.pageY - offset.top;
            if (dOffsetX >= 0 && dOffsetY >= 0 && (dOffsetX + dOffsetY < sum || sum === -1)) {
                sum = dOffsetX + dOffsetY;
                self._draggingOffset.x = dOffsetX;
                self._draggingOffset.y = dOffsetY;
            }
        }
        self.setOverTarget(self, event.pageX, event.pageY);

        if(event.preventDefault && items.length > 0)
            event.preventDefault();

        $(document).one('mouseup', null, self, self._ddMouseUp);
        $(document).on('mousemove', null, self, self._ddMouseMove);
    };

    this._ddTouchStart = function(event) {
        let self = event.data;
        if (self._draggingLocked)
            return;

        let touchList = event.changedTouches;
        let pageX = touchList[0].pageX;
        let pageY = touchList[0].pageY;

        let items = self.getPickupItems();
        self._ddPickupItems(items.length === 0 ? null : items);
        let sum = -1;
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let offset = item.$el.offset();
            let dOffsetX = pageX - offset.left;
            let dOffsetY = pageY - offset.top;
            if (dOffsetX >= 0 && dOffsetY >= 0 && (dOffsetX + dOffsetY < sum || sum === -1)) {
                sum = dOffsetX + dOffsetY;
                self._draggingOffset.x = dOffsetX;
                self._draggingOffset.y = dOffsetY;
            }
        }
        self.setOverTarget(self, pageX, pageY);

        $(document).one('touchend', null, self, self._ddTouchEnd);
        $(document).on('touchmove', null, self, self._ddTouchMove);
    };

    this._ddTouchMove = function(event) {
        let self = event.data;

        if (self.hasDraggingItems() === false)
            return;

        if (self._isDragging === false) {
            self._$el = self.constructDragElement(self._itemsBeingDragged);
            self._$el.addClass('silky-item-dragging');
            $('body').append(self._$el);
            self._isDragging = true;
        }

        let touchList = event.changedTouches;
        let pageX = touchList[0].pageX;
        let pageY = touchList[0].pageY;

        // needed because touch doesn't have enter or leave events
        self._determineTarget(pageX, pageY);
        /////////////////////////////////

        let subTarget = self.fireDragging(pageX, pageY);
        if (subTarget !== null)
            self.setOverTarget(self.getTarget(subTarget, pageX, pageY));

        self._$el.css({ top: pageY - self._draggingOffset.y, left: pageX - self._draggingOffset.x });
    };

    this._ddTouchEnd = function(event) {
        let self = event.data;
        let touchList = event.changedTouches;
        let pageX = touchList[0].pageX;
        let pageY = touchList[0].pageY;
        self._ddDropItems(pageX, pageY);
        $(document).off('touchmove', self._ddTouchMove);
    };

    this._determineTarget = function(pageX, pageY) {
        if ( ! this._currentTarget || this._stillOverTarget(this._currentTarget.endTarget, pageX, pageY) === false) {
            for (let target of this._dropTargets) {
                let element = target.dropTargetElement();
                let offset = element.offset();
                let x = { min: offset.left, max: offset.left + element.width() };
                let y = { min: offset.top, max: offset.top + element.height() };

                let x_con = pageX >= x.min && pageX <= x.max;
                let y_con = pageY >= y.min && pageY <= y.max;
                let isOver = x_con && y_con;

                if (isOver && (!target.isValidDropZone || target.isValidDropZone(pageX, pageY))) {
                    if (! this._currentTarget || target !== this._currentTarget.endTarget) {
                        this.setOverTarget(target, pageX, pageY);
                        break;
                    }
                }
            }
        }
    };

    this._ddMouseMove = function(event) {
        let self = event.data;

        if (self.hasDraggingItems() === false)
            return;

        if (self._isDragging === false) {
            self._$el = self.constructDragElement(self._itemsBeingDragged);
            self._$el.addClass('silky-item-dragging');
            $('body').append(self._$el);
            self._isDragging = true;
        }

        let subTarget = self.fireDragging(event.pageX, event.pageY);
        if (subTarget !== null)
            self.setOverTarget(self.getTarget(subTarget, event.pageX, event.pageY));

        self._$el.css({ top: event.pageY - self._draggingOffset.y, left: event.pageX - self._draggingOffset.x });
    };

    this.fireDragging = function(pageX, pageY) {
        let targetInfo = this._currentTarget;
        let target = null;
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
    };

    this.getTarget = function(target, pageX, pageY) {

        let finalTarget = target;
        if (target !== null && target.hasSubDropTarget) {
            let element = target.dropTargetElement();
            let offset = element.offset();
            let subTarget = target.hasSubDropTarget(pageX - offset.left, pageY - offset.top);
            if (subTarget !== null && subTarget.hasSubDropTarget) {
                let subtar = subTarget.getTarget(subTarget, pageX, pageY);
                if (subtar !== null)
                    subTarget = subtar;
            }
            if (subTarget !== null)
                finalTarget = subTarget;
        }

        return finalTarget;
    };

    this.setDroppableParent = function(parent) {
        if (this._ddParent !== null)
            this._ddParent.off("targetChanged");

        this._ddParent = parent;

        if (this._ddParent !== null) {
            this._currentTarget = parent._currentTarget;
            this._ddParent.on("targetChanged", (targetInfo) => {
                this._currentTarget = targetInfo;
                this.trigger("targetChanged", targetInfo);
            });
        }
    };

    this._ddPickupItems = function(items) {
        this._itemsBeingDragged = items;
    };

    this.dropIntoTarget = function(target, items, pageX, pageY) {
        let itemsToDrop = target.filterItemsForDrop(items, this, pageX - this._currentTarget.endTarget.x.min, pageY - this._currentTarget.endTarget.y.min);
        if (itemsToDrop !== null && itemsToDrop.length !== 0) {
            if (target.onDragDropStart)
                target.onDragDropStart();
            if (this.onDragDropStart)
                this.onDragDropStart();

            if (this.onItemsDropping)
                this.onItemsDropping(itemsToDrop, this._dropId === target._dropId);
            target.catchDroppedItems(this, itemsToDrop, pageX - this._currentTarget.endTarget.x.min, pageY - this._currentTarget.endTarget.y.min);

            if (target.onDragDropEnd)
                target.onDragDropEnd();
            if (this.onDragDropEnd)
                this.onDragDropEnd();

            if (target.onDraggingLeave)
                target.onDraggingLeave();
        }
    };

    this._ddDropItems = function(pageX, pageY) {
        if (this._isDragging) {
            if (this._stillOverTarget(this._currentTarget.endTarget, pageX, pageY)) {
                let target = this._currentTarget.endTarget.target;
                this.dropIntoTarget(target, this._itemsBeingDragged, pageX, pageY);
            }
            this._$el.remove();
            this._isDragging = false;
        }

        this._itemsBeingDragged = null;
    };

    this._stillOverTarget = function(targetInfo, pageX, pageY) {
        if (targetInfo.target === null)
            return false;

        let x_con = pageX >= targetInfo.x.min && pageX <= targetInfo.x.max;
        let y_con = pageY >= targetInfo.y.min && pageY <= targetInfo.y.max;
        let isOver = x_con && y_con;

        return isOver && (!targetInfo.target.isValidDropZone || targetInfo.target.isValidDropZone(pageX, pageY));
    };

    this.setPickupSourceElement = function($source) {
        $source.mousedown(this, this._ddMouseDown);
        $source.on('touchstart', null, this, this._ddTouchStart);
    };

    this.disposeDragDrop = function($source) {
        $source.off("mousedown", this._ddMouseDown);
        $source.off('touchstart', this._ddMouseDown);
    };

    this.activateDragging = function() {
        this._draggingLocked = false;
    };

    this.deactivateDragging = function() {
        this._draggingLocked = true;
    };

    this._mouseEnterDropTarget = function(event) {
        let self = event.data.context;
        self.setOverTarget(event.data.target, event.pageX, event.pageY);
    };

    this._mouseLeaveDropTarget = function(event) {
        let self = event.data.context;
        let target = self._currentTarget.target;
        if (target && target._dropId === this._dropId && self._stillOverTarget(self._currentTarget, event.pageX, event.pageY) === false) {
            if (target.onDraggingLeave)
                target.onDraggingLeave();
            self._currentTarget.target = null;
        }
    };

    this.registerDropTargets = function(target) {
        this._dropTargets.push(target);

        target.dropTargetElement().on('mouseenter', null, {context: this, target: target}, this._mouseEnterDropTarget);
        target.dropTargetElement().on('mouseleave', null, {context: this, target: target}, this._mouseLeaveDropTarget);
    };

    this.unregisterDropTargets = function(target) {
        const index = this._dropTargets.indexOf(target);
        if (index > -1)
            this._dropTargets.splice(index, 1);

        target.dropTargetElement().off('mouseenter', null, this._mouseEnterDropTarget);
        target.dropTargetElement().off('mouseleave', null, this._mouseLeaveDropTarget);
    };

    this.setOverTarget = function(target, pageX, pageY) {

        if (this._isDragging)
            target.inspectDraggedItems(this, this._itemsBeingDragged);

        let element = target.dropTargetElement();
        let offset = element.offset();

        let targetInfo = {
            target: target,
            subTargetInfo: null,
            x: { min: offset.left, max: offset.left + element.width() },
            y: { min: offset.top, max: offset.top + element.height() }
        };

        let parent = target._ddParent;
        let parentInfo = targetInfo;
        while (parent !== null) {
            element = parent.dropTargetElement();
            offset = element.offset();
            parentInfo = {
                target: parent,
                subTargetInfo: parentInfo,
                endTarget: targetInfo,
                x: { min: offset.left, max: offset.left + element.width() },
                y: { min: offset.top, max: offset.top + element.height() }
            };
            parent = parent._ddParent;
        }

        parentInfo.endTarget = targetInfo;

        if (this._currentTarget !== null && this._currentTarget.target && parentInfo.target !== this._currentTarget.target) {
            if (this._currentTarget.target.onDraggingLeave)
                this._currentTarget.target.onDraggingLeave();
        }

        this._currentTarget = parentInfo;

        this.trigger("targetChanged", parentInfo);
    };

    this.constructDragElement = function(items) {
        let $items = $('<div></div>');
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            let $item = item.$el.clone();
            $item.css('width', item.$el.outerWidth());
            let $itemOuter = $('<div style="position: static;"></div>');
            $itemOuter.css('position', 'relative');
            $itemOuter.append($item);
            $item.css('position', 'static');
            $items.append($itemOuter);
        }
        return $items;
    };

    this.hasDraggingItems = function() {
        return this._itemsBeingDragged !== null;
    };

    this.filterItemsForDrop = function(items) {
        let itemsToDrop = [];
        for (let i = 0; i < items.length; i++) {
            itemsToDrop.push(items[i]);
        }
        return itemsToDrop;
    };

};

DragNDrop._dropId = 0;

SuperClass.create(DragNDrop);

module.exports = DragNDrop;
