
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
const SuperClass = require('../common/superclass');

const LayoutCell = function(parent) {


    this.$el = $('<div style="opacity: 0; position: absolute; box-sizing: border-box;" class="not-rendered"></div>');

    //if (parent.editable)
    //    this.$el.css("border", "1px dotted red");

    Object.assign(this, Backbone.Events);

    this._visible = true;
    this.cssProperties = null;
    this._manipulating = 0;
    this.hAlign = "left";
    this.vAlign = "top";
    this.item = null;
    this.$content = null;
    this.$previousContent = null;
    this._clickable = false;
    this._selected = false;
    this._preferredWidth = -1;
    this._preferredHeight = -1;
    this._contentWidth = -1;
    this._contentHeight = -1;
    this._initialized = false;
    this._width = -1;
    this._height = -1;
    this._left = -1;
    this._top = -1;
    this._parentLayout = parent;

    this.blockInsert = function(direction) {
        if (parent.editable)
            this.$el.css("border-" + direction + "-style", "none");
    };

    this.onMouseDown = (event) => {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.mousedown', ctrlKey, event.shiftKey);
    };

    this.onMouseUp = (event) => {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.mouseup', ctrlKey, event.shiftKey);
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

    this.setSelection = (value, ctrlKey, shiftKey) => {
        if (value && this.visible() === false)
            return;

        if (this._selected !== value) {
            this._selected = value;
            this.trigger('layoutcell.selectionChanged', ctrlKey, shiftKey);
        }
    };

    this.isSelected = () => {
        return this._selected;
    };

    this.onContentChangedEvent = (event) => {
        this.data.hasContentChanged = true;
        this.onContentSizeChanged({type: "both"});
    };

    this.setContent = function(item) {

        if (this.$previousContent !== null)
            this.$previousContent.off("contentchanged", this.onContentChangedEvent);

        if (this.$content !== null)
            this.$previousContent = this.$content;

        this.item = item;
        if (item !== null && item.$el)
            this.$content = item.$el_cell !== undefined ? item.$el_cell : item.$el;
        else
            this.$content = item;

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

        this.invalidateContentSize();

        if (_.isUndefined(data.updateId))
            data.updateId = Math.random();

        if (this._parentLayout !== null)
            this._parentLayout.invalidateLayout(data.type, data.updateId);
    };

    this.render = function() {

        if (this.$previousContent !== null) {
            this.$previousContent.remove();
            this.$previousContent = null;
        }

        if (this.$content) {
            if (this.$content.css === undefined)
                this.$content = null;
            else {
                this.$content.css( "position", "absolute");
                this.$el.append(this.$content);
            }
        }
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
            //let properties = this.$el.css(["padding-left", "padding-right", "border-left-width", "border-right-width"]);
            let contentSpace = (this.dockContentWidth || (this.horizontalStretchFactor > 0)) ? 0 : this.contentWidth();
            this._preferredWidth =  contentSpace + this.cssProperties["padding-left"] + this.cssProperties["padding-right"] + this.cssProperties["border-left-width"] + this.cssProperties["border-right-width"];
        }
        return Math.round(this._preferredWidth);
    };

    this.preferredHeight = function() {
        if (this._preferredHeight === -1) {
            if (this.cssProperties === null)
                this.refreshCSSProperties();

            this._preferredHeight = this.contentHeight() + this.cssProperties["padding-top"] + this.cssProperties["padding-bottom"] + this.cssProperties["border-top-width"] + this.cssProperties["border-bottom-width"];
        }

        return Math.round(this._preferredHeight);
    };

    this.preferredSize = function() {
        return { height: this.preferredHeight(), width: this.preferredWidth() };
    };

    this.contentWidth = function() {
        if (this._contentWidth === -1) {
            let f = this.$content[0].getBoundingClientRect().width;
            if (this.ignoreContentMargin_left === false || this.ignoreContentMargin_right === false) {
                let properties = this.$content.css(["margin-left", "margin-right"]);
                if (this.ignoreContentMargin_left === false)
                    f += parseFloat(properties["margin-left"]);
                if (this.ignoreContentMargin_right === false)
                    f += parseFloat(properties["margin-right"]);
            }
            this._contentWidth = Math.round(f);
        }

        return this._contentWidth;
    };

    this.contentHeight = function() {
        if (this._contentHeight === -1) {
            let f = this.$content[0].getBoundingClientRect().height;
            if (this.ignoreContentMargin_top === false || this.ignoreContentMargin_bottom === false) {
                let properties = this.$content.css(["margin-top", "margin-bottom"]);
                if (this.ignoreContentMargin_top === false)
                    f += parseFloat(properties["margin-top"]);
                if (this.ignoreContentMargin_bottom === false)
                    f += parseFloat(properties["margin-bottom"]);
            }
            this._contentHeight = Math.round(f);
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
        left = Math.round(left);
        if (this._left !== left) {
            this._left = left;
            this._leftAdjusted = true;
        }
    };

    this.adjustCellTop = function(top) {
        top = Math.round(top);
        if (this._top !== top) {
            this._top = top;
            this._topAdjusted = true;
        }
    };

    this.adjustCellWidth = function(width) {
        width = Math.round(width);
        if (this._width !== width) {
            this._width = width;
            if (this.maximumWidth > -1)
                this._width = Math.min(this._width, this.maximumWidth);
            if (this.minimumWidth > -1)
                this._width = Math.max(this._width, this.minimumWidth);
            this._widthAdjusted = true;
        }
    };

    this.adjustCellPosition = function(left, top) {
        this.adjustCellLeft(left);
        this.adjustCellTop(top);
    };

    this.adjustCellDimensions = function(width, height) {
        this.adjustCellWidth(width);
        this.adjustCellHeight(height);
    };

    this.adjustCellHorizontally = function(left, width) {
        this.adjustCellLeft(left);
        this.adjustCellWidth(width);
    };

    this.adjustCellVertically = function(top, height) {
        this.adjustCellTop(top);
        this.adjustCellHeight(height);
    };

    this.adjustCellHeight = function(height) {
        height = Math.round(height);
        if (this._height !== height) {
            this._height = height;
            this._heightAdjusted = true;
            if (this.maximumHeight > -1)
                this._height = Math.min(this._height, this.maximumHeight);
            if (this.minimumHeight > -1)
                this._height = Math.max(this._height, this.minimumHeight);
        }
    };

    this.adjustCell = function(left, top, width, height) {
        this.adjustCellLeft(left);
        this.adjustCellTop(top);
        this.adjustCellWidth(width);
        this.adjustCellHeight(height);
    };

    this.updateContentHorizontalAlignment = function(cellWidth) {
        let properties = null;
        let innerWidth = null;

        if (this.cssProperties === null)
            this.refreshCSSProperties();

        let left = null;
        let width = null;

        if (this.dockContentWidth) {
            innerWidth = cellWidth - this.cssProperties["padding-left"] - this.cssProperties["padding-right"] - this.cssProperties["border-left-width"] - this.cssProperties["border-right-width"];

            let contentProperties = this.$content.css(["padding-left", "padding-right", "margin-left", "margin-right", "border-left-width", "border-right-width"]);
            left = this.cssProperties["padding-left"];
            width = innerWidth - parseFloat(contentProperties["margin-left"]) - parseFloat(contentProperties["margin-right"]) - parseFloat(contentProperties["padding-left"]) - parseFloat(contentProperties["padding-right"]) - parseFloat(contentProperties["border-left-width"]) - parseFloat(contentProperties["border-right-width"]);
        }
        else if (this.hAlign === "left")
            left = this.cssProperties["padding-left"];
        else if (this.hAlign === "right") {
            innerWidth = cellWidth - this.cssProperties["padding-left"] - this.cssProperties["padding-right"] - this.cssProperties["border-left-width"] - this.cssProperties["border-right-width"];
            left = this.cssProperties["padding-left"] + innerWidth - Math.ceil(this.contentWidth());
        }
        else if (this.hAlign === "center") {
            innerWidth = cellWidth - this.cssProperties["padding-left"] - this.cssProperties["padding-right"] - this.cssProperties["border-left-width"] - this.cssProperties["border-right-width"];
            left = this.cssProperties["padding-left"] + (innerWidth/2) - (Math.ceil(this.contentWidth())/2);
        }

        if (this.ignoreContentMargin_left || this.ignoreContentMargin_right) {
            let margins = this.$content.css(["margin-left", "margin-right"]);
            if (this.ignoreContentMargin_left) {
                if (left !== null)
                    left -= parseFloat(margins["margin-left"]);
                if (width !== null)
                    width -= parseFloat(margins["margin-left"]);
            }
            if (width !== null && this.ignoreContentMargin_right)
                width -=  parseFloat(margins["margin-right"]);
        }

        if (left !== null)
            left = Math.round(left);
        if (width !== null)
            width = Math.round(width);

        if (left !== null && width !== null)
            this.$content.css( { "left": left, "width": width });
        else if (left !== null)
            this.$content.css( { "left": left });
        else if (width !== null)
            this.$content.css( { "width": width });
    };

    this.updateContentVerticalAlignment = function(cellHeight) {
        let properties = null;
        let innerHeight = null;

        if (this.cssProperties === null)
            this.refreshCSSProperties();

        let top = null;
        let height = null;

        if (this.dockContentHeight) {
            innerHeight = cellHeight - this.cssProperties["padding-top"] - this.cssProperties["padding-bottom"] - this.cssProperties["border-top-width"] - this.cssProperties["border-bottom-width"];

            let contentProperties = this.$content.css(["padding-top", "padding-bottom", "margin-top", "margin-bottom", "border-top-width", "border-bottom-width"]);
            top = this.cssProperties["padding-top"];
            height = innerHeight - parseFloat(contentProperties["margin-top"]) - parseFloat(contentProperties["margin-bottom"]) - parseFloat(contentProperties["padding-top"]) - parseFloat(contentProperties["padding-bottom"]) - parseFloat(contentProperties["border-top-width"]) - parseFloat(contentProperties["border-bottom-width"]);
        }
        else if (this.vAlign === "top")
            top = this.cssProperties["padding-top"];
        else if (this.vAlign === "bottom") {
            innerHeight = cellHeight - this.cssProperties["padding-top"] - this.cssProperties["padding-bottom"] - this.cssProperties["border-top-width"] - this.cssProperties["border-bottom-width"];
            top = this.cssProperties["padding-top"] + innerHeight - Math.ceil(this.contentHeight());
        }
        else if (this.vAlign === "center") {
            innerHeight = cellHeight - this.cssProperties["padding-top"] - this.cssProperties["padding-bottom"] - this.cssProperties["border-top-width"] - this.cssProperties["border-bottom-width"];
            top = this.cssProperties["padding-top"] + (innerHeight/2) - (Math.ceil(this.contentHeight())/2);
        }

        if (this.ignoreContentMargin_top || this.ignoreContentMargin_bottom) {
            let margins = this.$content.css(["margin-top", "margin-bottom"]);
            if (this.ignoreContentMargin_top) {
                if (top !== null)
                    top -= parseFloat(margins["margin-top"]);
                if (height !== null)
                    height -= parseFloat(margins["margin-top"]);
            }
            if (height !== null && this.ignoreContentMargin_bottom)
                height -= parseFloat(margins["margin-bottom"]);
        }

        if (top !== null)
            top = Math.round(top);
        if (height !== null)
            height = Math.round(height);

        if (top !== null && height !== null)
            this.$content.css( { "top": top, "height": height });
        else if (top !== null)
            this.$content.css( { "top": top });
        else if (height !== null)
            this.$content.css( { "height": height });
    };

    this.actualWidth = function() {
        if (this._width === -1)
            this._width = Math.round(this.$el[0].getBoundingClientRect().width);

        return this._width;
    };

    this.actualHeight = function() {
        if (this._height === -1)
            this._height = Math.round(this.$el[0].getBoundingClientRect().height);

        return this._height;
    };

    this.rightCell = function() {
        let cell = null;
        let c = this.data.column + 1;
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
        let cell = null;
        let c = this.data.column - 1;
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

        let diff = this.preferredWidth() - this.actualWidth();
        return diff < 0 ? 0 : diff;
    };

    this.adjustableHeight = function() {

        let diff = this.preferredHeight() - this.actualHeight();
        return diff < 0 ? 0 : diff;
    };

    this.beginManipulation = function() {

        if (this._manipulating++ > 0)
            return;

        this._ready = new Promise((resolve, reject) => {
            this._readyResolved = resolve;
        });

        this.cssProperties = null;
    };

    this._ready = new Promise((resolve, reject) => {
        this._readyResolved = resolve;
    });

    this._readyResolved = null;
    this.ready = function() {
        return this._ready;
    };

    this.checkForHeightDiscrepancy = function() {
        let oldPreferedHeight = this._preferredHeight;
        //let oldPreferedWidth = this._preferredWidth;

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

        let data = {};
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
        }

        if (this._initialized === false)
        {
            window.setTimeout(() => {
                this.$el.removeClass("not-rendered");
                this.$el.addClass("rendered");
                if (this._visible)
                    this.$el.css("opacity", 1);
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

        window.setTimeout(() => {
            if (this._manipulating === 0)
                this._readyResolved();
        }, 0);

        this._initialized = true;

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
        if (factor === this.horizontalStretchFactor)
            return;

        this.horizontalStretchFactor = factor;

        this.dockContentWidth = this.horizontalStretchFactor > 0 && this.hAlign === "left";

        //if (factor === 0)
        //    this.$el.css("border-color", "red");
        //else
        //    this.$el.css("border-color", "blue");

        if (this.horizontalStretchFactor > 0)
            this.fitToGrid = false;
        else
            this.fitToGrid = true;
    };

    this.setHorizontalAlign = function(hAlign) {
        if (hAlign !== "left" && this.dockContentWidth)
            this.dockContentWidth = false;

        this.hAlign = hAlign;
    };

    this.setVerticalAlign = function(vAlign) {
        if (vAlign !== "top" && this.dockContentHeight)
            this.dockContentHeight = false;

        this.vAlign = vAlign;
    };

    this.setAlignment = function(hAlign, vAlign) {
        this.setHorizontalAlign(hAlign);
        this.setVerticalAlign(vAlign);
    };

    this.fitToGrid = true;
    this.maximumWidth = -1;
    this.minimumWidth = -1;
    this.maximumHeight = -1;
    this.minimumHeight = -1;
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

SuperClass.create(LayoutCell);

const SpacerCell = function(width, height, fitToGrid) {

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
