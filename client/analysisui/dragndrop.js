'use strict';

var $ = require('jquery');
var _ = require('underscore');
var SuperClass = require('./superclass');

var DragNDrop = function() {

    this._itemsBeingDragged = null;
    this._$el = null;
    this._dropTargets = [];
    this._isDragging = false;
    this._currentTarget = { index: -1 };

    this._ddMouseUp = function(event) {
        var self = event.data;
        self._ddDropItems(event.pageX, event.pageY);
    };

    this._ddMouseDown = function(event) {
        var self = event.data;
        var items = self.getPickupItems();
        self._ddPickupItems(items.length === 0 ? null : items);
        self._currentTarget.index = -1;
    };

    this._ddMouseMove = function(event) {
        var self = event.data;

        if (self.hasItems() === false)
            return;

        if (self._isDragging === false) {
            self._$el = self.constructDragElement(self._itemsBeingDragged);
            self._$el.addClass('silky-item-dragging');
            $('body').append(self._$el);
            self._isDragging = true;
        }

        var data = {
            eventName: "mouseup",
            which: event.which,
            pageX: event.pageX,
            pageY: event.pageY
        };

        self._$el.css({ top: event.pageY + 1, left: event.pageX + 1 });
    };

    this._ddPickupItems = function(items) {
        this._itemsBeingDragged = items;
    };

    this._ddDropItems = function(pageX, pageY) {
        if (this._isDragging) {
            if (this._stillOverTarget(pageX, pageY)) {
                var target = this._dropTargets[this._currentTarget.index];
                var itemsToDrop = target.filterItemsForDrop(this._itemsBeingDragged, pageX - this._currentTarget.x.min, pageY - this._currentTarget.y.min);
                if (itemsToDrop !== null && itemsToDrop.length !== 0) {
                    if (target.onDragDropStart)
                        target.onDragDropStart();
                    if (this.onDragDropStart)
                        this.onDragDropStart();

                    if (this.onItemsDropping)
                        this.onItemsDropping(itemsToDrop);
                    target.catchDroppedItems(this, itemsToDrop, pageX - this._currentTarget.x.min, pageY - this._currentTarget.y.min);

                    if (target.onDragDropEnd)
                        target.onDragDropEnd();
                    if (this.onDragDropEnd)
                        this.onDragDropEnd();
                }
            }
            this._$el.remove();
            this._isDragging = false;
        }

        this._itemsBeingDragged = null;
    };

    this._stillOverTarget = function(pageX, pageY) {
        if (this._currentTarget.index === -1)
            return false;

        var x_con = pageX >= this._currentTarget.x.min && pageX <= this._currentTarget.x.max;
        var y_con = pageY >= this._currentTarget.y.min && pageY <= this._currentTarget.y.max;
        return x_con && y_con;
    };

    this.setPickupSourceElement = function($source) {
        $source.mousedown(this, this._ddMouseDown);
    };

    this.registerDropTargets = function(target) {
        var targetIndex = this._dropTargets.length;
        this._dropTargets.push(target);
        var self = this;

        target.dropTargetElement().on('mouseenter', function(event) {
            if (self._isDragging)
                target.inspectDraggedItems(self, self._itemsBeingDragged);

            var element = target.dropTargetElement();
            var offset = element.offset();
            self._currentTarget = {
                index: targetIndex,
                x: { min: offset.left, max: offset.left + element.width() },
                y: { min: offset.top, max: offset.top + element.height() }
            };
        });

        target.dropTargetElement().on('mouseleave', function(event) {
            if (self._currentTarget.index === targetIndex && self._stillOverTarget(event.pageX, event.pageY) === false)
                self._currentTarget.index = -1;
        });
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

    this.hasItems = function() {
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

SuperClass.create(DragNDrop);

module.exports = DragNDrop;
