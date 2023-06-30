
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const focusLoop = require('../common/focusloop');
const { constructor } = require('./formatdef');

class LayoutCell {

    constructor(parent, properties) {
        this.$el = $(`<div id='${focusLoop.getNextAriaElementId('cell')}' style="display: flex; justify-self: stretch; align-self: stretch; opacity: 0; visibility: hidden; position: relative;  box-sizing: border-box;" class="layout-cell not-rendered"></div>`);
        this.$el.attr('role', 'presentation');

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

        this.onMouseDown = this.onMouseDown.bind(this);
        this.onFocus = this.onFocus.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);
        this.isSelected = this.isSelected.bind(this);
        this.setSelection = this.setSelection.bind(this);

        this.horizontalStretchFactor = 0;

        this.spanAllRows = false;

        this.isVirtual = false;

        if (properties) {
            if (properties.visible === false) {
                this._visible = properties.visible;
                this.$el.addClass("cell-invisible");
                this.$el.addClass('cell-disconnected');
                this.$el.css({ opacity: 0, visibility: 'hidden', height: '0px' });
                this.$el.attr('data-collapsed', 'true');
            }

            if (properties.hAlign)
                this.setHorizontalAlign(properties.hAlign);
            if (properties.vAlign)
                this.setVerticalAlign(properties.vAlign);
        }
    }

    makeSticky(dockcss) {
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
    }

    blockInsert(direction) {
        if (this._parentLayout.editable)
            this.$el.css("border-" + direction + "-style", "none");
    }

    onMouseDown(event) {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.mousedown', ctrlKey, event.shiftKey);
        this.$el.one("mouseup", null, this, this.onMouseUp);
    }

    onFocus(event) {
        this.trigger('layoutcell.focus');
    }

    onMouseUp(event) {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.mouseup', ctrlKey, event.shiftKey);
    }

    onTouchStart(event) {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.touchstart', ctrlKey, event.shiftKey);
        event.preventDefault();
        this.$el.one("touchend", null, this, this.onTouchEnd);
    }

    onTouchEnd(event) {
        let ctrlKey = event.ctrlKey;
        if (navigator.platform == "MacIntel")
            ctrlKey = event.metaKey;
        this.trigger('layoutcell.touchend', ctrlKey, event.shiftKey);
    }

    clickable(value) {
        this._clickable = value;
        if (value) {
            this.$el.on("focus", null, this, this.onFocus);
            this.$el.on("mousedown", null, this, this.onMouseDown);
            this.$el.on("touchstart", null, this, this.onTouchStart);
        }
        else {
            this.$el.off("focus", this.onFocus);
            this.$el.off("mousedown", this.onMouseDown);
            this.$el.off("touchstart", this.onTouchStart);
        }
    }

    setSelection(value, ctrlKey, shiftKey) {
        if (value && this.visible() === false)
            return;

        if (this._selected !== value) {
            this._selected = value;
            this.trigger('layoutcell.selectionChanged', ctrlKey, shiftKey);
        }
    }

    isSelected() {
        return this._selected;
    }

    setContent(item) {

        if (this.$content !== null)
            this.$previousContent = this.$content;

        this.item = item;
        if (item !== null && item.$el)
            this.$content = item.$el_cell !== undefined ? item.$el_cell : item.$el;
        else
            this.$content = item;

        if (this.$content !== null) {
            let css = {};
            css.position = 'relative';
            if (this.hAlign === 'stretch' || this.vAlign === 'stretch') {
                css['flex-grow'] = '1';
                css['flex-shrink'] = '1';
            }
            this.$content.css(css);
        
            
        }

        this.render();
    }

    render() {

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
    }

    visible() {
        return this._visible;
    }

    collapse(immediately) {

        if (this._expandingTimer) {
            clearTimeout(this._expandingTimer);
            this._expandingTimer = null;
        }
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        let element = this.$el[0];
        if (immediately)
            element.style.height = 0 + 'px';
        else {
            let sectionHeight = element.scrollHeight;

            let elementTransition = element.style.transition;
            element.style.transition = '';

            this.animationFrame = requestAnimationFrame(() => {
                element.style.height = sectionHeight + 'px';
                element.style.transition = elementTransition;
                this.animationFrame = requestAnimationFrame(() => {
                    element.style.height = 0 + 'px';
                    this.animationFrame = null;
                });
            });
        }

        element.setAttribute('data-collapsed', 'true');
    }

    expand(immediately) {

        if (this._expandingTimer) {
            clearTimeout(this._expandingTimer);
            this._expandingTimer = null;
        }
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        let element = this.$el[0];
        if (immediately)
            element.style.height = null;
        else {
            let sectionHeight = element.scrollHeight;
            element.style.height = sectionHeight + 'px';

            this._expandingTimer = setTimeout(() => {
                element.style.height = null;
                this._expandingTimer = null;
            }, 200);
        }

        element.setAttribute('data-collapsed', 'false');
    }

    setVisibility(visible, immediately) {
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

            if (this._parentLayout.refreshCellStatus)
                this._parentLayout.refreshCellStatus();
        }
    }

    setStretchFactor(factor) {
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

        this.trigger('layoutcell.horizontalStretchFactorChanged', this);
    }

    rightCell() {
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
    }

    topCell(onlyVisible) {
        let row = this.data.row - 1;
        let cell = this._parentLayout.getCell(this.data.column, row);
        if (onlyVisible) {
            while (cell && (cell._clickable === false || cell.visible() === false)) {
                row -= 1;
                cell = this._parentLayout.getCell(this.data.column, row);
            }

        }
        return cell;
    }

    leftCell() {
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
    }

    bottomCell(onlyVisible) {
        let row = this.data.row + 1;
        let cell = this._parentLayout.getCell(this.data.column, row);
        if (onlyVisible) {
            while (cell && (cell._clickable === false || cell.visible() === false)) {
                row += 1;
                cell = this._parentLayout.getCell(this.data.column, row);
            }
                
        }
        return cell;
    }

    setHorizontalAlign(hAlign) {
        if (! this.$content)
            return;

        switch (hAlign) {
            case 'stretch':
                this.$el.css('justify-content', 'stretch');
                this.$content.css('flex-grow', '1');
                this.$content.css('flex-strink', '1');
                break;
            case 'left':
                this.$el.css('justify-content', 'flex-start');
                this.$content.css('flex-grow', '');
                this.$content.css('flex-strink', '');
                break;
            case 'right':
                this.$el.css('justify-content', 'flex-end');
                this.$content.css('flex-grow', '');
                this.$content.css('flex-strink', '');
                break;
            case 'center':
                this.$el.css('justify-content', 'center');
                this.$content.css('flex-grow', '');
                this.$content.css('flex-strink', '');
                break;
            default:
                this.$el.css('justify-content', 'auto');
                this.$content.css('flex-grow', '');
                this.$content.css('flex-strink', '');
                break;
        }

        this.hAlign = hAlign;
    }

    setVerticalAlign(vAlign) {
        if (! this.$content)
            return;

        switch (vAlign) {
            case 'stretch':
                this.$el.css('align-items', 'stretch');
                this.$content.css('flex-grow', '1');
                this.$content.css('flex-strink', '1');
                break;
            case 'top':
                this.$el.css('align-items', 'flex-start');
                this.$content.css('flex-grow', '');
                this.$content.css('flex-strink', '');
                break;
            case 'bottom':
                this.$el.css('align-items', 'flex-end');
                this.$content.css('flex-grow', '');
                this.$content.css('flex-strink', '');
                break;
            case 'center':
                this.$el.css('align-items', 'center');
                this.$content.css('flex-grow', '');
                this.$content.css('flex-strink', '');
                break;
            default:
                this.$el.css('align-items', 'auto');
                this.$content.css('flex-grow', '');
                this.$content.css('flex-strink', '');
                break;
        }

        this.vAlign = vAlign;
    }

    setAlignment(hAlign, vAlign) {
        this.setHorizontalAlign(hAlign);
        this.setVerticalAlign(vAlign);
    }

    setDimensionMinMax(minWidth, maxWidth, minHeight, maxHeight) {
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
    }

    setSpanAllRows(value) {
        if (this.spanAllRows === value)
            return;
        
        this.spanAllRows = value;
        if (value) {
            this.$el.css('grid-row-end', '-1');
        }
        else {
            this.$el.css('grid-row-end', '');
        }
        this.updateGridProperties();
        this.trigger('layoutcell.spanAllRowsChanged', this);
    }

    updateGridProperties(fromSide) {

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
    }
}

LayoutCell.defaultFormat = 'minmax(max-content, max-content)';

module.exports = LayoutCell;
