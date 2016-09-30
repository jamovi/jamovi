
'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
var Overridable = require('./overridable');

var LayoutCell = function(parent) {

    Overridable.extendTo(this);

    this.$el = $('<div style="opacity: 0" class="not-rendered"></div>');
    this.$el.css("position", "absolute");
    this.$el.css("box-sizing", "border-box");

    //if (parent.editable)
    //    this.$el.css("border", "1px dotted red");

    _.extend(this, Backbone.Events);

    this._visible = true;
    this.cssProperties = null;
    this._manipulating = 0;
    this.hAlign = "left";
    this.vAlign = "top";
    this.$content = null;
    this.$previousContent = null;
    this._clickable = false;
    this._selected = false;
    this._preferredWidth = -1;
    this._preferredHeight = -1;
    this._contentWidth = -1;
    this._contentHeight = -1;
    this._initialised = false;
    this._width = -1;
    this._height = -1;
    this._left = -1;
    this._top = -1;
    this._parentLayout = parent;

    var self = this;

    this.blockInsert = function(direction) {
        if (parent.editable)
            this.$el.css("border-" + direction + "-style", "none");
    };

    this.onMouseDown = function(event) {
        var ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        self.trigger('layoutcell.mousedown', ctrlKey, event.shiftKey);
    };

    this.onMouseUp = function(event) {
        var ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        self.trigger('layoutcell.mouseup', ctrlKey, event.shiftKey);
    };

    this.clickable = function(value) {
        this._clickable = value;
        if (value) {
            this.$el.on("mousedown", null, this, this.onMouseDown);
            this.$el.on("mouseup", null, this, this.onMouseUp);
        }
        else {
            this.$el.off("mousedown", this.onMouseDown);
            this.$el.off("mouseup", this.onMouseUp);
        }
    };

    this.setSelection = function(value, ctrlKey, shiftKey) {
        if (value && this.visible() === false)
            return;

        if (this._selected !== value) {
            this._selected = value;
            this.trigger('layoutcell.selectionChanged', ctrlKey, shiftKey);
        }
    };

    this.isSelected = function() {
        return this._selected;
    };

    this.onContentChangedEvent = function(event) {
        self.data.hasContentChanged = true;
        self.onContentSizeChanged({type: "both"});
    };

    this.setContent = function($content) {

        if (this.$previousContent !== null)
            this.$previousContent.off("contentchanged", this.onContentChangedEvent);

        if (this.$content !== null)
            this.$previousContent = this.$content;

        this.$content = $content;

        if (this.$content !== null)
            this.$content.on("contentchanged", this.onContentChangedEvent);

        this.invalidateContentSize();

        if (this.$previousContent !== null) {
            this.data.hasNewContent = true;
            this._parentLayout.invalidateLayout('both', Math.random());
        }

        return this.$previousContent;
    };

    this.invalidateContentSize = function() {
        this._preferredWidth = -1;
        this._preferredHeight = -1;
        this._contentWidth = -1;
        this._contentHeight = -1;
        this._width = -1;
        this._height = -1;
    };

    this.onContentSizeChanged = function(data) {

        self.invalidateContentSize();

        if (_.isUndefined(data.updateId))
            data.updateId = Math.random();

        self._parentLayout.invalidateLayout(data.type, data.updateId);
    };

    this.render = function() {

        if (this.$previousContent !== null) {
            this.$previousContent.remove();
            this.$previousContent = null;
        }

        if (this.$content) {
            this.$content.css( "position", "absolute");
            this.$el.append(this.$content);
        }
    };

    this.setAlignment = function(hAlign, vAlign) {
        this.hAlign = hAlign;
        this.vAlign = vAlign;
    };

    this.top = function() {
        if (this._top === -1)
            this._top = parseFloat(this.$el.css('top'));
        return this._top;
    };

    this.left = function() {
        if (this._left === -1)
            this._left = parseFloat(this.$el.css('left'));
        return this._left;
    };

    this.right = function() {
        return this.left() + this.actualWidth();
    };

    this.bottom = function() {
        return this.top() + this.actualHeight();
    };

    this.visible = function() {
        return this._visible;
    };

    this.refreshCSSProperties = function() {
        this.cssProperties = this.$el.css(["padding-top", "padding-bottom", "border-top-width", "border-bottom-width", "padding-left", "padding-right", "border-left-width", "border-right-width"]);
        this.cssProperties["padding-top"] = parseFloat(this.cssProperties["padding-top"]);
        this.cssProperties["padding-bottom"] = parseFloat(this.cssProperties["padding-bottom"]);
        this.cssProperties["border-top-width"] = parseFloat(this.cssProperties["border-top-width"]);
        this.cssProperties["border-bottom-width"] = parseFloat(this.cssProperties["border-bottom-width"]);
        this.cssProperties["padding-left"] = parseFloat(this.cssProperties["padding-left"]);
        this.cssProperties["padding-right"] = parseFloat(this.cssProperties["padding-right"]);
        this.cssProperties["border-left-width"] = parseFloat(this.cssProperties["border-left-width"]);
        this.cssProperties["border-right-width"] = parseFloat(this.cssProperties["border-right-width"]);
    };

    this.preferredWidth = function() {
        if (this._preferredWidth === -1) {
            if (this.cssProperties === null)
                this.refreshCSSProperties();
            //var properties = this.$el.css(["padding-left", "padding-right", "border-left-width", "border-right-width"]);
            var contentSpace = (this.dockContentWidth || (this.horizontalStretchFactor > 0)) ? 0 : this.contentWidth();
            this._preferredWidth =  contentSpace + this.cssProperties["padding-left"] + this.cssProperties["padding-right"] + this.cssProperties["border-left-width"] + this.cssProperties["border-right-width"];
        }
        return this._preferredWidth;
    };

    this.preferredHeight = function() {
        if (this._preferredHeight === -1) {
            if (this.cssProperties === null)
                this.refreshCSSProperties();

            this._preferredHeight = this.contentHeight() + this.cssProperties["padding-top"] + this.cssProperties["padding-bottom"] + this.cssProperties["border-top-width"] + this.cssProperties["border-bottom-width"];
        }

        return this._preferredHeight;
    };

    this.preferredSize = function() {
        return { height: this.preferredHeight(), width: this.preferredWidth() };
    };

    this.contentWidth = function() {
        if (this._contentWidth === -1) {
            var f = this.$content[0].getBoundingClientRect().width;
            if (this.ignoreContentMargin_left === false || this.ignoreContentMargin_right === false) {
                var properties = this.$content.css(["margin-left", "margin-right"]);
                if (this.ignoreContentMargin_left === false)
                    f += parseFloat(properties["margin-left"]);
                if (this.ignoreContentMargin_right === false)
                    f += parseFloat(properties["margin-right"]);
            }
            this._contentWidth = f;
        }

        return this._contentWidth;
    };

    this.contentHeight = function() {
        if (this._contentHeight === -1) {
            var f = this.$content[0].getBoundingClientRect().height;
            if (this.ignoreContentMargin_top === false || this.ignoreContentMargin_bottom === false) {
                var properties = this.$content.css(["margin-top", "margin-bottom"]);
                if (this.ignoreContentMargin_top === false)
                    f += parseFloat(properties["margin-top"]);
                if (this.ignoreContentMargin_bottom === false)
                    f += parseFloat(properties["margin-bottom"]);
            }
            this._contentHeight = f;
        }

        return this._contentHeight;
    };

    this.setVisibility = function(visible) {
        if (this._visible !== visible) {
            this._visible = visible;
            this._visibleAdjusted = true;
        }
    };

    this.adjustCellLeft = function(left) {
        if (this._left !== left) {
            this._left = left;
            this._leftAdjusted = true;
        }
    };

    this.adjustCellWidth = function(width) {
        if (this._width !== width) {
            this._width = width;
            this._widthAdjusted = true;
        }
    };

    this.adjustCellPosition = function(left, top) {
        if (this._left !== left) {
            this._left = left;
            this._leftAdjusted = true;
        }

        if (this._top !== top) {
            this._top = top;
            this._topAdjusted = true;
        }
    };

    this.adjustCellDimensions = function(width, height) {
        if (this._width !== width) {
            this._width = width;
            this._widthAdjusted = true;
        }

        if (this._height !== height) {
            this._height = height;
            this._heightAdjusted = true;
        }
    };

    this.adjustCellHorizontally = function(left, width) {
        if (this._left !== left) {
            this._left = left;
            this._leftAdjusted = true;
        }

        if (this._width !== width) {
            this._width = width;
            this._widthAdjusted = true;
        }
    };

    this.adjustCellVertically = function(top, height) {
        if (this._top !== top) {
            this._top = top;
            this._topAdjusted = true;
        }

        if (this._height !== height) {
            this._height = height;
            this._heightAdjusted = true;
        }
    };

    this.adjustCellHeight = function(height) {
        if (this._height !== height) {
            this._height = height;
            this._heightAdjusted = true;
        }
    };

    this.adjustCell = function(left, top, width, height) {
        if (left !== this._left) {
            this._left = left;
            this._leftAdjusted = true;
        }

        if (top !== this._top) {
            this._top = top;
            this._topAdjusted = true;
        }

        if (width !== this._width) {
            this._width = width;
            this._widthAdjusted = true;
        }

        if (height !== this._height) {
            this._height = height;
            this._heightAdjusted = true;
        }
    };

    this.updateContentHorizontalAlignment = function(cellWidth) {
        var properties = null;
        var innerWidth = null;

        if (this.cssProperties === null)
            this.refreshCSSProperties();

        var left = null;
        var width = null;

        if (this.dockContentWidth) {
            innerWidth = cellWidth - this.cssProperties["padding-left"] - this.cssProperties["padding-right"] - this.cssProperties["border-left-width"] - this.cssProperties["border-right-width"];

            var contentProperties = this.$content.css(["padding-left", "padding-right", "margin-left", "margin-right", "border-left-width", "border-right-width"]);
            left = this.cssProperties["padding-left"];
            width = innerWidth - parseFloat(contentProperties["margin-left"]) - parseFloat(contentProperties["margin-right"]) - parseFloat(contentProperties["padding-left"]) - parseFloat(contentProperties["padding-right"]) - parseFloat(contentProperties["border-left-width"]) - parseFloat(contentProperties["border-right-width"]);
        }
        else if (this.hAlign === "left")
            left = this.cssProperties["padding-left"];
        else if (this.hAlign === "right") {
            innerWidth = cellWidth - this.cssProperties["padding-left"] - this.cssProperties["padding-right"] - this.cssProperties["border-left-width"] - this.cssProperties["border-right-width"];
            left = this.cssProperties["padding-left"] + innerWidth - Math.ceil(this.contentWidth());
        }
        else if (this.hAlign === "centre") {
            innerWidth = cellWidth - this.cssProperties["padding-left"] - this.cssProperties["padding-right"] - this.cssProperties["border-left-width"] - this.cssProperties["border-right-width"];
            left = this.cssProperties["padding-left"] + (innerWidth/2) - (Math.ceil(this.contentWidth())/2);
        }

        if (this.ignoreContentMargin_left || this.ignoreContentMargin_right) {
            var margins = this.$content.css(["margin-left", "margin-right"]);
            if (this.ignoreContentMargin_left) {
                if (left !== null)
                    left -= parseFloat(margins["margin-left"]);
                if (width !== null)
                    width -= parseFloat(margins["margin-left"]);
            }
            if (width !== null && this.ignoreContentMargin_right)
                width -=  parseFloat(margins["margin-right"]);
        }

        if (left !== null && width !== null)
            this.$content.css( { "left": left, "width": width });
        else if (left !== null)
            this.$content.css( { "left": left });
        else if (width !== null)
            this.$content.css( { "width": width });
    };

    this.updateContentVerticalAlignment = function(cellHeight) {
        var properties = null;
        var innerHeight = null;

        if (this.cssProperties === null)
            this.refreshCSSProperties();

        var top = null;
        var height = null;

        if (this.dockContentHeight) {
            innerHeight = cellHeight - this.cssProperties["padding-top"] - this.cssProperties["padding-bottom"] - this.cssProperties["border-top-width"] - this.cssProperties["border-bottom-width"];

            var contentProperties = this.$content.css(["padding-top", "padding-bottom", "margin-top", "margin-bottom", "border-top-width", "border-bottom-width"]);
            top = this.cssProperties["padding-top"];
            height = innerHeight - parseFloat(contentProperties["margin-top"]) - parseFloat(contentProperties["margin-bottom"]) - parseFloat(contentProperties["padding-top"]) - parseFloat(contentProperties["padding-bottom"]) - parseFloat(contentProperties["border-top-width"]) - parseFloat(contentProperties["border-bottom-width"]);
        }
        else if (this.vAlign === "top")
            top = this.cssProperties["padding-top"];
        else if (this.vAlign === "bottom") {
            innerHeight = cellHeight - this.cssProperties["padding-top"] - this.cssProperties["padding-bottom"] - this.cssProperties["border-top-width"] - this.cssProperties["border-bottom-width"];
            top = this.cssProperties["padding-top"] + innerHeight - Math.ceil(this.contentHeight());
        }
        else if (this.vAlign === "centre") {
            innerHeight = cellHeight - this.cssProperties["padding-top"] - this.cssProperties["padding-bottom"] - this.cssProperties["border-top-width"] - this.cssProperties["border-bottom-width"];
            top = this.cssProperties["padding-top"] + (innerHeight/2) - (Math.ceil(this.contentHeight())/2);
        }

        if (this.ignoreContentMargin_top || this.ignoreContentMargin_bottom) {
            var margins = this.$content.css(["margin-top", "margin-bottom"]);
            if (this.ignoreContentMargin_top) {
                if (top !== null)
                    top -= parseFloat(margins["margin-top"]);
                if (height !== null)
                    height -= parseFloat(margins["margin-top"]);
            }
            if (height !== null && this.ignoreContentMargin_bottom)
                height -= parseFloat(margins["margin-bottom"]);
        }

        if (top !== null && height !== null)
            this.$content.css( { "top": top, "height": height });
        else if (top !== null)
            this.$content.css( { "top": top });
        else if (height !== null)
            this.$content.css( { "height": height });
    };

    this.actualWidth = function() {
        if (this._width === -1)
            this._width = this.$el[0].getBoundingClientRect().width;

        return this._width;
    };

    this.actualHeight = function() {
        if (this._height === -1)
            this._height = this.$el[0].getBoundingClientRect().height;

        return this._height;
    };

    this.rightCell = function() {
        var cell = null;
        var c = this.data.column + 1;
        if (c < this._parentLayout._columnCount) {

            do {
                cell = this._parentLayout.getCell(c, this.data.row);
                c += 1;
            }
            while (cell === null && c < this._parentLayout._columnCount);
        }
        return cell;
    };

    this.topCell = function() {
        return this._parentLayout.getCell(this.data.column, this.data.row - 1);
    };

    this.leftCell = function() {
        var cell = null;
        var c = this.data.column - 1;
        if (c < this._parentLayout._columnCount) {

            do {
                cell = this._parentLayout.getCell(c, this.data.row);
                c -= 1;
            }
            while (cell === null && c >= 0);
        }
        return cell;
    };

    this.bottomCell = function() {
        return this._parentLayout.getCell(this.data.column, this.data.row + 1);
    };

    this.adjustableWidth = function() {

        var diff = this.preferredWidth() - this.actualWidth();
        return diff < 0 ? 0 : diff;
    };

    this.adjustableHeight = function() {

        var diff = this.preferredHeight() - this.actualHeight();
        return diff < 0 ? 0 : diff;
    };

    this.beginManipulation = function() {

        if (this._manipulating++ > 0)
            return;

        this.cssProperties = null;
    };

    this.checkForHeightDiscrepancy = function() {
        var oldPreferedHeight = this._preferredHeight;
        //var oldPreferedWidth = this._preferredWidth;

        //this._preferredWidth = -1;
        this._preferredHeight = -1;
        //this._contentWidth = -1;
        this._contentHeight = -1;
        //this._width = -1;
        this._height = -1;

        return oldPreferedHeight !== this.preferredHeight() ;//|| oldPreferedWidth !== this.preferredWidth();
    };

    this.endManipulation = function() {
        this._manipulating -= 1;
        if (this._manipulating > 0)
            return;

        var data = {};
        if (this._leftAdjusted)
            data.left = this._left;
        if (this._topAdjusted)
            data.top = this._top;
        if (this._widthAdjusted)
            data.width = this._width;
        if (this._heightAdjusted)
            data.height = this._height;
        if (this._visibleAdjusted) {
            if (this._visible)
                this.$el.removeClass("cell-invisible");
            else
                this.$el.addClass("cell-invisible");
            data.opacity = (this._visible ? 1 : 0);
            data['z-index'] = this._visible ? 1 : 0;
        }

        if (this._initialised === false)
        {
            window.setTimeout(function() {
                self.$el.removeClass("not-rendered");
                self.$el.addClass("rendered");
                if (self._visible)
                    self.$el.css("opacity", 1);
            }, 0);
        }

        if (this._leftAdjusted || this._topAdjusted || this._widthAdjusted || this._heightAdjusted || this._visibleAdjusted)
            this.$el.css(data);

        if (this._visibleAdjusted)
            this.trigger('layoutcell.visibleChanged');

        if (this._widthAdjusted)
            this.updateContentHorizontalAlignment(this._width);

        if (this._heightAdjusted)
            this.updateContentVerticalAlignment(this._height);

        this._initialised = true;

        this._topAdjusted = false;
        this._leftAdjusted = false;
        this._widthAdjusted = false;
        this._heightAdjusted = false;
        this._visibleAdjusted = false;
    };

    this.manipulating = function() {
        return this._manipulating > 0;
    };

    this.setStretchFactor = function(factor) {
        this.horizontalStretchFactor = factor;

        this.dockContentWidth = this.horizontalStretchFactor > 0 && this.hAlign === "left";

        if (factor === 0)
            this.$el.css("border-color", "red");
        else
            this.$el.css("border-color", "blue");

        if (this.horizontalStretchFactor > 0)
            this.fitToGrid = false;
        else
            this.fitToGrid = true;
    };

    this.fitToGrid = true;

    this.horizontalStretchFactor = 0;

    this.spanAllRows = false;

    this.dockContentWidth = false;

    this.dockContentHeight = false;

    this.ignoreContentMargin_top = false;
    this.ignoreContentMargin_bottom = false;
    this.ignoreContentMargin_left = false;
    this.ignoreContentMargin_right = false;

    this.isVirtual = false;
};

LayoutCell.extendTo = function(target) {
    LayoutCell.call(target);
};

var SpacerCell = function(width, height, fitToGrid) {

    this._initalHeight = height;
    this._initalWidth = width;
    this.spanAllRows = false;
    this.horizontalStretchFactor = 0;
    this.height = height;
    this.width = width;
    this.fitToGrid = fitToGrid;
    this._visible = true;
    this.visible = function() { return this._visible; };

    this.setVisibility = function(visible) { this._visible = visible; };

    this.preferredWidth = function() {
        return this._initalWidth;
    };

    this.preferredHeight = function() {
        return this._initalHeight;
    };

    this.preferredSize = function() {
        return { height: this._initalHeight, width: this._initalWidth };
    };

    this.contentWidth = function() {
        return this._initalWidth;
    };

    this.contentHeight = function() {
        return this._initalHeight;
    };

    this.adjustCellLeft = function(left) {
    };

    this.adjustCell = function(left, top, width, height) {
        this.height = height;
        this.width = width;
    };

    this.rightCell = function() {
        return this._parentLayout.getCell(this.data.column + 1, this.data.row);
    };

    this.bottomCell = function() {
        return this._parentLayout.getCell(this.data.column, this.data.row + 1);
    };

    this.isVirtual = true;
};

module.exports.LayoutCell = LayoutCell;
module.exports.SpacerCell = SpacerCell;
