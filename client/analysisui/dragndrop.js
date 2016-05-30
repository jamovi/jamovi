'use strict';

var $ = require('jquery');
var _ = require('underscore');

var DragNDrop = function() {

    this._itemsBeingDragged = null;
    this._$el = null;
    this._dropTargets = [];
    this._isDragging = false;
    this._currentlyOverTargetIndex = -1;

    this._ddMouseUp = function(event) {
        var self = event.data;
        self._ddDropItems();
    };

    this._ddMouseDown = function(event) {
        var self = event.data;
        var items = self.getPickupItems();
        self._ddPickupItems(items.length === 0 ? null : items);
        self._currentlyOverTargetIndex = -1;
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

    this._ddDropItems = function() {
        if (this._isDragging) {
            if (this._currentlyOverTargetIndex !== -1) {
                var target = this._dropTargets[this._currentlyOverTargetIndex];
                var itemsToDrop = target.filterItemsForDrop(this._itemsBeingDragged);
                if (this.onItemsDropping)
                    this.onItemsDropping(itemsToDrop);
                target.catchDroppedItems(this, itemsToDrop);
            }
            this._$el.remove();
            this._isDragging = false;
        }

        this._itemsBeingDragged = null;
    };


    this.setPickupSourceElement = function($source) {
        $source.mousedown(this, this._ddMouseDown);
    };

    this.registerDropTargets = function(target) {
        var targetIndex = this._dropTargets.length;
        this._dropTargets.push(target);
        var self = this;
        var targetPos = {};

        target.dropTargetElement().on('mouseenter', function(event) {
            if (self._isDragging)
                target.inspectDraggedItems(self, self._itemsBeingDragged);

            self._currentlyOverTargetIndex = targetIndex;
            targetPos.x = {
                min: target.dropTargetElement().offset().left,
                max: target.dropTargetElement().offset().left + target.dropTargetElement().width()
            };
            targetPos.y = {
                min: target.dropTargetElement().offset().top,
                max: target.dropTargetElement().offset().top + target.dropTargetElement().height()
            };
        });

        target.dropTargetElement().on('mouseleave', function(event) {
            var x_con = event.pageX >= targetPos.x.min && event.pageX <= targetPos.x.max;
            var y_con = event.pageY >= targetPos.y.min && event.pageY <= targetPos.y.max;
            if ( x_con && y_con ) {
                return false;
            }

            if (self._currentlyOverTargetIndex === targetIndex)
                self._currentlyOverTargetIndex = -1;
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


DragNDrop.extendTo = function(target) {
    DragNDrop.call(target);
};

module.exports = DragNDrop;
