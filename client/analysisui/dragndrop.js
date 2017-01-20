'use strict';

var $ = require('jquery');
var _ = require('underscore');
var SuperClass = require('../common/superclass');

var DragNDrop = function() {

    this._itemsBeingDragged = null;
    this._$el = null;
    this._ddParent = null;
    this._isDragging = false;
    this._currentTarget = { tartget: null };
    this._dropId = DragNDrop._dropId;
    DragNDrop._dropId += 1;

    this._ddMouseUp = function(event) {
        var self = event.data;
        self._ddDropItems(event.pageX, event.pageY);
    };

    this._ddMouseDown = function(event) {
        var self = event.data;
        var items = self.getPickupItems();
        self._ddPickupItems(items.length === 0 ? null : items);
        self.setOverTarget(self, event.pageX, event.pageY);
    };

    this._ddMouseMove = function(event) {
        var self = event.data;

        if (self.hasDraggingItems() === false)
            return;

        if (self._isDragging === false) {
            self._$el = self.constructDragElement(self._itemsBeingDragged);
            self._$el.addClass('silky-item-dragging');
            $('body').append(self._$el);
            self._isDragging = true;
        }

        var subTarget = self.fireDragging();
        if (subTarget !== null)
            self.setOverTarget(self.getTarget(subTarget, event.pageX, event.pageY));

        var data = {
            eventName: "mouseup",
            which: event.which,
            pageX: event.pageX,
            pageY: event.pageY
        };

        self._$el.css({ top: event.pageY + 1, left: event.pageX + 1 });
    };

    this.fireDragging = function() {
        var targetInfo = this._currentTarget;
        var target = null;
        while (targetInfo !== null) {
            if (this._stillOverTarget(targetInfo, event.pageX, event.pageY)) {
                target = targetInfo.target;
                if (target.onDraggingOver)
                    target.onDraggingOver(event.pageX - targetInfo.x.min, event.pageY - targetInfo.y.min);
                targetInfo = targetInfo.subTargetInfo;
            }
            else
                targetInfo = null;
        }

        return target;
    };

    this.getTarget = function(target, pageX, pageY) {

        var finalTarget = target;
        if (target !== null && target.hasSubDropTarget) {
            var element = target.dropTargetElement();
            var offset = element.offset();
            var subTarget = target.hasSubDropTarget(pageX - offset.left, pageY - offset.top);
            if (subTarget !== null && subTarget.hasSubDropTarget) {
                var subtar = this.getTarget(subTarget, pageX, pageY);
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

    this._ddDropItems = function(pageX, pageY) {
        if (this._isDragging) {
            if (this._stillOverTarget(this._currentTarget.endTarget, pageX, pageY)) {
                var target = this._currentTarget.endTarget.target;
                var itemsToDrop = target.filterItemsForDrop(this._itemsBeingDragged, this._dropId === target._dropId, pageX - this._currentTarget.endTarget.x.min, pageY - this._currentTarget.endTarget.y.min);
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
            }
            this._$el.remove();
            this._isDragging = false;
        }

        this._itemsBeingDragged = null;
    };

    this._stillOverTarget = function(targetInfo, pageX, pageY) {
        if (targetInfo.target === null)
            return false;

        var x_con = pageX >= targetInfo.x.min && pageX <= targetInfo.x.max;
        var y_con = pageY >= targetInfo.y.min && pageY <= targetInfo.y.max;
        return x_con && y_con;
    };

    this.setPickupSourceElement = function($source) {
        $source.mousedown(this, this._ddMouseDown);
    };

    this.registerDropTargets = function(target) {
        var self = this;

        target.dropTargetElement().on('mouseenter', function(event) {
            self.setOverTarget(target, event.pageX, event.pageY);
        });

        target.dropTargetElement().on('mouseleave', function(event) {

            var target = self._currentTarget.target;
            if (target._dropId === self._dropId && self._stillOverTarget(self._currentTarget, event.pageX, event.pageY) === false) {
                if (target.onDraggingLeave)
                    target.onDraggingLeave();
                self._currentTarget.target = null;
            }
        });
    };

    this.setOverTarget = function(target) {
        if (this._isDragging)
            target.inspectDraggedItems(this, this._itemsBeingDragged);

        var element = target.dropTargetElement();
        var offset = element.offset();

        var targetInfo = {
            target: target,
            subTargetInfo: null,
            x: { min: offset.left, max: offset.left + element.width() },
            y: { min: offset.top, max: offset.top + element.height() }
        };

        var parent = target._ddParent;
        var parentInfo = targetInfo;
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

        this._currentTarget = parentInfo;

        this.trigger("targetChanged", parentInfo);
    };

    this.constructDragElement = function(items) {
        var $items = $('<div></div>');
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var $item = item.$el.clone();
            $item.css('position', 'static');
            $items.append($item);
        }
        return $items;
    };

    this.hasDraggingItems = function() {
        return this._itemsBeingDragged !== null;
    };

    this.filterItemsForDrop = function(items) {
        var itemsToDrop = [];
        for (var i = 0; i < items.length; i++) {
            itemsToDrop.push(items[i]);
        }
        return itemsToDrop;
    };

    $(document).mouseup(this, this._ddMouseUp);
    $(document).mousemove(this, this._ddMouseMove);
};

DragNDrop._dropId = 0;

SuperClass.create(DragNDrop);

module.exports = DragNDrop;
