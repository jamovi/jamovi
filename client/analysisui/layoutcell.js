
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const SuperClass = require('../common/superclass');

const LayoutCell = function(parent, properties) {

    this.$el = $('<div style="opacity: 0; visibility: hidden; position: relative; align-self: stretch; justify-self: stretch; box-sizing: border-box;" class="not-rendered"></div>');

    //if (parent.editable)
    //    this.$el.css("border", "1px dotted red");

    Object.assign(this, Backbone.Events);

    this._visible = true;
    this.hAlign = "left";
    this.vAlign = "top";
    this.item = null;
    this.$content = null;
    this.$previousContent = null;
    this._clickable = false;
    this._selected = false;
    this._initialized = false;
    this._parentLayout = parent;

    if (properties) {
        if (properties.visible === false) {
            this._visible = properties.visible;
            this.$el.addClass("cell-invisible");
            this.$el.addClass('cell-disconnected');
            this.$el.css( { opacity:  0, visibility: 'hidden', height: '0px' });
            this.$el.attr('data-collapsed', 'true');
        }
    }

    this.makeSticky = function(dockcss) {
        if (dockcss === undefined) {
            dockcss = {
                'z-index': 10,
                top: '0px'
            };
        }

        if (dockcss['z-index'] === undefined)
            dockcss['z-index'] = 111;

        dockcss.position = 'sticky';

        this.$el.css(dockcss);
    };

    this.blockInsert = function(direction) {
        if (parent.editable)
            this.$el.css("border-" + direction + "-style", "none");
    };

    this.onMouseDown = (event) => {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.mousedown', ctrlKey, event.shiftKey);
        this.$el.one("mouseup", null, this, this.onMouseUp);
    };

    this.onMouseUp = (event) => {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.mouseup', ctrlKey, event.shiftKey);
    };

    this.onTouchStart = (event) => {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.touchstart', ctrlKey, event.shiftKey);
        event.preventDefault();
        this.$el.one("touchend", null, this, this.onTouchEnd);
    };

    this.onTouchEnd = (event) => {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.touchend', ctrlKey, event.shiftKey);
    };

    this.clickable = function(value) {
        this._clickable = value;
        if (value) {
            this.$el.on("mousedown", null, this, this.onMouseDown);
            this.$el.on("touchstart", null, this, this.onTouchStart);
        }
        else {
            this.$el.off("mousedown", this.onMouseDown);
            this.$el.off("touchstart", this.onTouchStart);
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

    this.setContent = function(item) {

        if (this.$content !== null)
            this.$previousContent = this.$content;

        this.item = item;
        if (item !== null && item.$el)
            this.$content = item.$el_cell !== undefined ? item.$el_cell : item.$el;
        else
            this.$content = item;

        if (this.$content !== null) {
            this.$content.css('position', 'relative');
        }

        this.render();
    };

    this.render = function() {

        if (this.$previousContent !== null) {
            this.$previousContent.remove();
            this.$previousContent = null;
        }

        if (this.$content) {
            if (this.$content.css === undefined)
                this.$content = null;
            else
                this.$el.append(this.$content);
        }

        this.$el.removeClass("not-rendered");
        this.$el.addClass("rendered");
        if (this._visible)
            this.$el.css( { opacity: 1, visibility: 'visible' });
    };

    this.visible = function() {
        return this._visible;
    };

    this.collapse = function(immediately) {

        if (this._expandingTimer)
            clearTimeout(this._expandingTimer);

        let element = this.$el[0];
        if (immediately)
            element.style.height = 0 + 'px';
        else {
            let sectionHeight = element.scrollHeight;

            let elementTransition = element.style.transition;
            element.style.transition = '';

            requestAnimationFrame(function() {
                element.style.height = sectionHeight + 'px';
                element.style.transition = elementTransition;

                requestAnimationFrame(function() {
                    element.style.height = 0 + 'px';
                });
            });
        }

        element.setAttribute('data-collapsed', 'true');
    };

    this.expand = function(immediately) {

        let element = this.$el[0];
        if (immediately)
            element.style.height = null;
        else {
            let sectionHeight = element.scrollHeight;
            element.style.height = sectionHeight + 'px';

            this._expandingTimer = setTimeout(() => {
                element.style.height = null;
            }, 200);
        }

        element.setAttribute('data-collapsed', 'false');
    };

    this.setVisibility = function(visible, immediately) {
        if (this._visible !== visible) {
            this._visible = visible;

            if (this.diconnectionId)
                clearTimeout(this.diconnectionId);

            if (this._visible) {
                this.$el.removeClass('cell-disconnected');
                this.$el.removeClass("cell-invisible");
                this.expand(immediately);
            }
            else {
                this.$el.addClass("cell-invisible");
                if (immediately)
                    this.$el.addClass('cell-disconnected');
                else {
                    this.diconnectionId = setTimeout(() => {
                        this.$el.addClass('cell-disconnected');
                        this.diconnectionId = null;
                    }, 200);
                }
                this.collapse(immediately);
            }
            this.$el.css( { opacity: (this._visible ? 1 : 0), visibility: (this._visible ? 'visible' : 'hidden') } );

            this.trigger('layoutcell.visibleChanged');
        }
    };

    let observer = new ResizeObserver(entries => {
        if (this.hAlign === 'center')
            this.setHorizontalAlign(this.hAlign);
        if (this.vAlign === 'center')
            this.setVerticalAlign(this.vAlign);
    });

    observer.observe(this.$el[0]);

    this.setStretchFactor = function(factor) {
        if (factor === this.horizontalStretchFactor)
            return;

        this.horizontalStretchFactor = factor;

        if (this.horizontalStretchFactor > 0 && this.hAlign === "left")
            this.setHorizontalAlign('stretch');

        let endColumn = this.data.column;
        if (this.data.spans)
            endColumn = this.data.column + this.data.spans.columns - 1;
        for (let column = this.data.column; column <= endColumn; column++)
            this._parentLayout.setStretchFactor(column, factor);

        this.updateGridProperties();
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

    this.setHorizontalAlign = function(hAlign) {
        if (! this.$content)
            return;

        switch (hAlign) {
            case 'stretch':
                this.$content.css({ left: '0px', float: '' });
                break;
            case 'left':
                this.$content.css({ left: '0px', float: 'left' });
                break;
            case 'right':
                this.$content.css({ right: '0px', float: 'right' });
                break;
            case 'center':
                let left = (this.$el.innerWidth() / 2) - (this.$content.outerWidth(true) / 2);
                this.$content.css({ left: left + 'px', float: '' });
                break;
            default:
                this.$content.css({ left: '0px', float: '' });
                break;
        }

        this.hAlign = hAlign;
    };

    this.setVerticalAlign = function(vAlign) {
        if (! this.$content)
            return;

        switch (vAlign) {
            case 'stretch':
                this.$content.css('top', '0px');
                break;
            case 'top':
                this.$content.css('top', '0px');
                break;
            case 'bottom':
                this.$content.css('bottom', '0px');
                break;
            case 'center':
                let top = (this.$el.innerHeight() / 2) - (this.$content.outerHeight(true) / 2);
                this.$content.css('top', top + 'px');
                break;
            default:
                this.$content.css('top', '0px');
                break;
        }

        this.vAlign = vAlign;
    };

    this.setAlignment = function(hAlign, vAlign) {
        this.setHorizontalAlign(hAlign);
        this.setVerticalAlign(vAlign);
    };

    this.setDimensionMinMax = function(minWidth, maxWidth, minHeight, maxHeight) {
        if (! this.$content)
            return;

        let data = { };
        if (minWidth !== -1)
            data['min-width'] = minWidth;
        if (maxWidth !== -1)
            data['max-width'] = maxWidth;
        if (minHeight !== -1)
            data['min-height'] = minHeight;
        if (maxHeight !== -1)
            data['max-height'] = maxHeight;

        this.$content.css( data );
    };

    this.horizontalStretchFactor = 0;

    this.spanAllRows = false;

    this.setSpanAllRows = function(value) {
        this.spanAllRows = value;
        if (value) {
            this.$el.css('grid-row-end', '-1');
        }
        else {
            this.$el.css('grid-row-end', '');
        }
        this.updateGridProperties();
    };

    this.updateGridProperties = function(fromSide) {

        let columnEnd = 'span ' + this.data.spans.columns;

        let leftCell = this.leftCell();
        let rightCell = this.rightCell();

        if (this.horizontalStretchFactor > 0) {
            if (this.spanAllRows === false && leftCell === null && rightCell === null) {
                columnEnd = '-1';
                for (let column = this.data.column; column <= this.data.column + this.data.spans.columns - 1; column++)
                    this._parentLayout.setStretchFactor(column, LayoutCell.defaultFormat, true);
                this._parentLayout.setLayoutStretch(true);
            }
            else {
                for (let column = this.data.column; column <= this.data.column + this.data.spans.columns - 1; column++)
                    this._parentLayout.setStretchFactor(column, this.horizontalStretchFactor);
                columnEnd = 'span ' + this.data.spans.columns; //(rightCell.data.column - this.data.column + 1);
            }
        }

        if (fromSide !== 'left' && leftCell !== null && leftCell.horizontalStretchFactor > 0)
            leftCell.updateGridProperties('right');
        if (fromSide !== 'right' && rightCell !== null && rightCell.horizontalStretchFactor > 0)
            rightCell.updateGridProperties('left');

        this.$el.css({ "grid-column": (this.data.column + 1) + '/ ' + columnEnd, 'grid-row': (this.data.row + 1) + ' / ' + (this.spanAllRows ? '-1' : ('span ' + this.data.spans.rows)) });
    };

    this.isVirtual = false;
};

LayoutCell.defaultFormat = 'minmax(max-content, max-content)';

SuperClass.create(LayoutCell);

module.exports.LayoutCell = LayoutCell;
