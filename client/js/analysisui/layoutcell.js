
'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var LayoutCell = Backbone.View.extend({

    initialize: function() {
        this.cssProperties = null;
        this._manipulating = 0;
        this.hAlign = "left";
        this.vAlign = "top";
        this.$content = null;
        this.$previousContent = null;
        this._clickable = false;
        this._selected = false;
        this._preferedWidth = -1;
        this._preferedHeight = -1;
        this._contentWidth = -1;
        this._contentHeight = -1;
        this._initialised = false;
        this._width = -1;
        this._height = -1;
        this._left = -1;
        this._top = -1;
    },

    onMouseDown: function(event) {
        var self = event.data;
        self.trigger('layoutcell.clicked', event.ctrlKey, event.shiftKey);
    },

    clickable: function(value) {
        this._clickable = value;
        if (value)
            this.$el.on("mousedown", null, this, this.onMouseDown);
        else
            this.$el.off("mousedown", this.onMouseDown);
    },

    setSelection: function(value, ctrlKey, shiftKey) {
        if (this._selected !== value) {
            this._selected = value;
            this.trigger('layoutcell.selectionChanged', ctrlKey, shiftKey);
        }
    },

    isSelected: function() {
        return this._selected;
    },

    setContent: function($content) {
        if (this.$content !== null) {
            this.$content.off('layoutgrid.sizeChanged', null, this.onContentSizeChanged);
            this.$previousContent = this.$content;
        }

        this.$content = $content;

        if (this.$content !== null)
            this.$content.on('layoutgrid.sizeChanged', null, this, this.onContentSizeChanged);

        if (this.$previousContent !== null)
            this.trigger('layoutcell.contentChanged', Math.random());
    },

    onContentSizeChanged: function(event, data) {
        var self = event.data;

        self._preferedWidth = -1;
        self._preferedHeight = -1;
        self._contentWidth = -1;
        self._contentHeight = -1;
        this._width = -1;
        this._height = -1;

        if (_.isUndefined(data.updateId))
            data.updateId = Math.random();

        self.trigger('layoutcell.sizeChanged', data.type, data.updateId);
    },



    render: function() {

        if (this.$previousContent !== null) {
            this.$previousContent.remove();
            this.$previousContent = null;
        }

        this.$el.css("position", "absolute");
        this.$el.css("box-sizing", "border-box");
        //this.$el.css("border", " 1px solid #555555");

        this.$content.css( "position", "absolute");

        if (this.$content)
            this.$el.append(this.$content);
    },

    setAlignment: function(hAlign, vAlign) {
        this.hAlign = hAlign;
        this.vAlign = vAlign;
    },

    top: function() {
        if (this._top === -1)
            this._top = parseFloat(this.$el.css('top'));
        return this._top;
    },

    left: function() {
        if (this._left === -1)
            this._left = parseFloat(this.$el.css('left'));
        return this._left;
    },

    right: function() {
        return this.left() + this.actualWidth();
    },

    bottom: function() {
        return this.top() + this.actualHeight();
    },

    refreshCSSProperties : function() {
        this.cssProperties = this.$el.css(["padding-top", "padding-bottom", "border-top-width", "border-bottom-width", "padding-left", "padding-right", "border-left-width", "border-right-width"]);
        this.cssProperties["padding-top"] = parseFloat(this.cssProperties["padding-top"]);
        this.cssProperties["padding-bottom"] = parseFloat(this.cssProperties["padding-bottom"]);
        this.cssProperties["border-top-width"] = parseFloat(this.cssProperties["border-top-width"]);
        this.cssProperties["border-bottom-width"] = parseFloat(this.cssProperties["border-bottom-width"]);
        this.cssProperties["padding-left"] = parseFloat(this.cssProperties["padding-left"]);
        this.cssProperties["padding-right"] = parseFloat(this.cssProperties["padding-right"]);
        this.cssProperties["border-left-width"] = parseFloat(this.cssProperties["border-left-width"]);
        this.cssProperties["border-right-width"] = parseFloat(this.cssProperties["border-right-width"]);
    },

    preferedWidth: function() {
        if (this._preferedWidth === -1) {
            if (this.cssProperties === null)
                this.refreshCSSProperties();
            //var properties = this.$el.css(["padding-left", "padding-right", "border-left-width", "border-right-width"]);
            var contentSpace = (this.dockContentWidth || (this.horizontalStretchFactor > 0)) ? 0 : this.contentWidth();
            this._preferedWidth =  contentSpace + this.cssProperties["padding-left"] + this.cssProperties["padding-right"] + this.cssProperties["border-left-width"] + this.cssProperties["border-right-width"];
        }
        return this._preferedWidth;
    },

    preferedHeight: function() {
        if (this._preferedHeight === -1) {
            if (this.cssProperties === null)
                this.refreshCSSProperties();
            //var properties = this.$el.css(["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"]);
            var contentSpace = this.dockContentHeight ? 0 : this.contentHeight();
            this._preferedHeight = this.contentHeight() + this.cssProperties["padding-top"] + this.cssProperties["padding-bottom"] + this.cssProperties["border-top-width"] + this.cssProperties["border-bottom-width"];
        }

        return this._preferedHeight;
    },

    preferedSize: function() {
        return { height: this.preferedHeight(), width: this.preferedWidth() };
    },

    contentWidth: function() {
        if (this._contentWidth === -1) {
            var properties = this.$content.css(["margin-left", "margin-right"]);
            var f = this.$content[0].getBoundingClientRect().width;
            this._contentWidth = f + parseFloat(properties["margin-left"]) + parseFloat(properties["margin-right"]);
        }

        return this._contentWidth;
    },

    contentHeight: function() {
        if (this._contentHeight === -1) {
            var properties = this.$content.css(["margin-top", "margin-bottom"]);
            var f = this.$content[0].getBoundingClientRect().height;
            this._contentHeight = f + parseFloat(properties["margin-top"]) + parseFloat(properties["margin-bottom"]);
        }

        return this._contentHeight;
    },

    adjustCellLeft: function(left) {
        if (this._left !== left) {
            this._left = left;
            this._leftAdjusted = true;
        }
    },

    adjustCellWidth: function(width) {
        if (this._width !== width) {
            this._width = width;
            this._widthAdjusted = true;
        }
    },

    adjustCellPosition: function(left, top) {
        if (this._left !== left) {
            this._left = left;
            this._leftAdjusted = true;
        }

        if (this._top !== top) {
            this._top = top;
            this._topAdjusted = true;
        }
    },

    adjustCellDimensions: function(width, height) {
        if (this._width !== width) {
            this._width = width;
            this._widthAdjusted = true;
        }

        if (this._height !== height) {
            this._height = height;
            this._heightAdjusted = true;
        }
    },

    adjustCellHorizontally: function(left, width) {
        if (this._left !== left) {
            this._left = left;
            this._leftAdjusted = true;
        }

        if (this._width !== width) {
            this._width = width;
            this._widthAdjusted = true;
        }
    },

    adjustCellVertically: function(top, height) {
        if (this._top !== top) {
            this._top = top;
            this._topAdjusted = true;
        }

        if (this._height !== height) {
            this._height = height;
            this._heightAdjusted = true;
        }
    },

    adjustCellHeight: function(height) {
        if (this._height !== height) {
            this._height = height;
            this._heightAdjusted = true;
        }
    },

    adjustCell: function(left, top, width, height) {
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
    },

    updateContentHorizontalAlignment: function(cellWidth) {
        var properties = null;
        var innerWidth = null;

        if (this.cssProperties === null)
            this.refreshCSSProperties();

        if (this.dockContentWidth) {
            innerWidth = cellWidth - this.cssProperties["padding-left"] - this.cssProperties["padding-right"] - this.cssProperties["border-left-width"] - this.cssProperties["border-right-width"];

            var contentProperties = this.$content.css(["padding-left", "padding-right", "border-left-width", "border-right-width"]);
            this.$content.css( { "left": this.cssProperties["padding-left"], "width": innerWidth - parseFloat(contentProperties["padding-left"]) - parseFloat(contentProperties["padding-right"]) - parseFloat(contentProperties["border-left-width"]) - parseFloat(contentProperties["border-right-width"])});
        }
        else if (this.hAlign === "left")
            this.$content.css( { "left": this.cssProperties["padding-left"] });
        else if (this.hAlign === "right") {
            innerWidth = cellWidth - this.cssProperties["padding-left"] - this.cssProperties["padding-right"] - this.cssProperties["border-left-width"] - this.cssProperties["border-right-width"];
            this.$content.css( { "left": this.cssProperties["padding-left"] + innerWidth - Math.ceil(this.contentWidth()) });
        }
        else if (this.hAlign === "centre") {
            innerWidth = cellWidth - this.cssProperties["padding-left"] - this.cssProperties["padding-right"] - this.cssProperties["border-left-width"] - this.cssProperties["border-right-width"];
            this.$content.css( { "left": this.cssProperties["padding-left"] + (innerWidth/2) - (Math.ceil(this.contentWidth())/2) });
        }
    },

    updateContentVerticalAlignment: function(cellHeight) {
        var properties = null;
        var innerHeight = null;

        if (this.cssProperties === null)
            this.refreshCSSProperties();

        if (this.dockContentHeight) {
            innerHeight = cellHeight - this.cssProperties["padding-top"] - this.cssProperties["padding-bottom"] - this.cssProperties["border-top-width"] - this.cssProperties["border-bottom-width"];

            var contentProperties = this.$content.css(["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"]);
            this.$content.css( { "top": this.cssProperties["padding-top"], "height": innerHeight - parseFloat(contentProperties["padding-top"]) - parseFloat(contentProperties["padding-bottom"]) - parseFloat(contentProperties["border-top-width"]) - parseFloat(contentProperties["border-bottom-width"])});
        }
        else if (this.vAlign === "top")
            this.$content.css( { "top": this.cssProperties["padding-top"] });
        else if (this.vAlign === "bottom") {
            innerHeight = cellHeight - this.cssProperties["padding-top"] - this.cssProperties["padding-bottom"] - this.cssProperties["border-top-width"] - this.cssProperties["border-bottom-width"];
            this.$content.css( { "top": this.cssProperties["padding-top"] + innerHeight - Math.ceil(this.contentHeight()) });
        }
        else if (this.vAlign === "centre") {
            innerHeight = cellHeight - this.cssProperties["padding-top"] - this.cssProperties["padding-bottom"] - this.cssProperties["border-top-width"] - this.cssProperties["border-bottom-width"];
            this.$content.css( { "top": this.cssProperties["padding-top"] + (innerHeight/2) - (Math.ceil(this.contentHeight())/2) });
        }
    },

    actualWidth: function() {
        if (this._width === -1)
            this._width = this.$el[0].getBoundingClientRect().width;

        return this._width;
    },

    actualHeight: function() {
        if (this._height === -1)
            this._height = this.$el[0].getBoundingClientRect().height;

        return this._height;
    },

    rightCell: function() {
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
    },

    bottomCell: function() {
        return this._parentLayout.getCell(this.data.column, this.data.row + 1);
    },

    adjustableWidth: function() {

        var diff = this.preferedWidth() - this.actualWidth();
        return diff < 0 ? 0 : diff;
    },

    adjustableHeight: function() {

        var diff = this.preferedHeight() - this.actualHeight();
        return diff < 0 ? 0 : diff;
    },

    beginManipulation: function() {

        if (this._manipulating++ > 0)
            return;

        this.cssProperties = null;

        this._topAdjusted = false;
        this._leftAdjusted = false;
        this._widthAdjusted = false;
        this._heightAdjusted = false;
    },

    endManipulation: function(animate) {
        this._manipulating -= 1;
        if (this._manipulating > 0)
            return;

        var animated = false;
        if (this._initialised && animate && (this._leftAdjusted || this._topAdjusted || this._widthAdjusted || this._heightAdjusted)) {
            this.$el.animate({ "width": this._width, "height": this._height, "left": this._left, "top": this._top }, {
                duration: 100,
                queue: false
            });
            animated = true;
        }
        else {
            var data = {};
            if (this._leftAdjusted)
                data.left = this._left;
            if (this._topAdjusted)
                data.top = this._top;
            if (this._widthAdjusted)
                data.width = this._width;
            if (this._heightAdjusted)
                data.height = this._height;

            if (this._leftAdjusted || this._topAdjusted || this._widthAdjusted || this._heightAdjusted)
                this.$el.css(data);
        }

        if (this._widthAdjusted)
            this.updateContentHorizontalAlignment(this._width);

        if (this._heightAdjusted)
            this.updateContentVerticalAlignment(this._height);

        this._initialised = true;

        return animated;
    },

    manipulating: function() {
        return this._manipulating > 0;
    },


    fitToGrid: false,

    horizontalStretchFactor: 0,

    spanAllRows: false,

    dockContentWidth: false,

    dockContentHeight: false,

    isVirtual: false
});

var SpacerCell = function(width, height, fitToGrid) {

    this._initalHeight = height;
    this._initalWidth = width;
    this.height = height;
    this.width = width;
    this.fitToGrid = fitToGrid;

    this.preferedWidth = function() {
        return this._initalWidth;
    };

    this.preferedHeight = function() {
        return this._initalHeight;
    };

    this.preferedSize = function() {
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
