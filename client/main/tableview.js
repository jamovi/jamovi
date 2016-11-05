//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');

const SilkyView = require('./view');
const DataSetModel = require('./dataset').Model;
const Notify = require('./notification');

const TableView = SilkyView.extend({
    className: "tableview",
    initialize() {

        $(window).on('resize', event => this._resizeHandler(event));
        this.$el.on('resized', event => this._resizeHandler(event));

        this.model.on('dataSetLoaded', this._dataSetLoaded, this);
        this.model.on('change:cells',  this._updateCells, this);
        this.model.on('cellsChanged', this._cellsChanged, this);
        this.model.on('columnsChanged', event => this._columnsChanged(event));

        this.viewport = null;
        this.viewOuterRange = { top: 0, bottom: -1, left: 0, right: -1 };

        this.$el.addClass("silky-tableview");

        let html = '';
        html += '<div class="silky-table-header">';
        html += '    <div class="silky-column-header" style="width: 110%">&nbsp;</div>';
        html += '</div>';
        html += '<div class="silky-table-container">';
        html += '    <div class="silky-table-body"></div>';
        html += '</div>';

        this.$el.html(html);
        this.$container = this.$el.find('.silky-table-container');
        this.$header    = this.$el.find('.silky-table-header');
        this.$body      = this.$container.find('.silky-table-body');
        this.$columns   = [ ];

        this.rowHeaderWidth = 32;

        this.$container.on('scroll', event => this._scrollHandler(event));

        setTimeout(() => {
            this._rowHeight = this.$header.height();  // read and store the row height
            this.$header.css('height', this._rowHeight);
            this.$container.css('top', this._rowHeight);
            this.$container.css('height', this.$el.height() - this._rowHeight);
        }, 0);

        this.selection = null;

        this.$el.on('click', event => this._clickHandler(event));
        this.$el.on('dblclick', event => this._clickHandler(event));

        this._active = true;

        keyboardJS.setContext('spreadsheet-editing');
        keyboardJS.bind('', event => this._editingKeyPress(event));
        keyboardJS.setContext('spreadsheet');
        keyboardJS.bind('', event => this._notEditingKeyPress(event));

        this._edited = false;
        this._editing = false;
        this._editNote = new Notify({ duration: 3000 });
    },
    setActive(active) {
        this._active = active;
        if (this._active)
            keyboardJS.setContext('spreadsheet');
        else
            keyboardJS.setContext('');
    },
    _dataSetLoaded() {

        this.$header.empty();  // clear the temporary cell
        this.$header.append('<div class="silky-column-header" style="width:' + this.rowHeaderWidth + 'px ; height: ' + this._rowHeight + 'px">&nbsp;</div>');

        let columns = this.model.get('columns');
        let left = this.rowHeaderWidth;

        this._lefts = new Array(columns.length);  // store the left co-ordinate for each column
        this._widths = new Array(columns.length);

        for (let colNo = 0; colNo < columns.length; colNo++) {
            let column = columns[colNo];
            let width  = column.width;

            let html = '';
            html += '<div data-id="' + column.id + '" data-index="' + colNo + '" data-measuretype="' + column.measureType + '" class="silky-column-header silky-column-header-' + column.id + '" style="left: ' + left + 'px ; width: ' + column.width + 'px ; height: ' + this._rowHeight + 'px">';
            html +=     column.name;
            html +=     '<div class="silky-column-header-resizer" data-index="' + colNo + '" draggable="true"></div>';
            html += '</div>';

            this.$header.append(html);
            this.$body.append('<div data-measuretype="' + column.measureType + '" class="silky-column" style="left: ' + left + 'px ; width: ' + column.width + 'px ; "></div>');

            this._lefts[colNo] = left;
            this._widths[colNo] = width;
            left += width;
        }

        this.$headers = this.$header.children(':not(:first-child)');
        this.$columns = this.$body.children();
        this.$body.css('width',  left);

        let rowCount = this.model.get('rowCount');
        let totalHeight = rowCount * this._rowHeight;
        this.$body.css('height', totalHeight);

        this.$rhColumn = $('<div class="silky-column-row-header" style="left: 0 ; width: ' + this.rowHeaderWidth + 'px ; background-color: pink ;"></div>').appendTo(this.$body);

        this._updateViewRange();

        let $resizers = this.$header.find('.silky-column-header-resizer');
        $resizers.on('drag', event => this._columnResizeHandler(event));

        this.$selection = $('<input class="silky-table-cell-selected" contenteditable>');
        this.$selection.width(this._lefts[0]);
        this.$selection.height(this._rowHeight);
        this.$selection.appendTo(this.$body);

        this.$selectionRowHighlight = $('<div class="silky-table-row-highlight"></div>');
        this.$selectionRowHighlight.appendTo(this.$body);

        this.$selectionColumnHighlight = $('<div class="silky-table-column-highlight"></div>');
        this.$selectionColumnHighlight.appendTo(this.$header);

        this.$selection.on('focus', event => this._beginEditing());
        this.$selection.on('blur', event => {
            if (this._editing)
                this._endEditing();
        });

        this.model.on('change:editingVar', event => {
            let prev = this.model.previous('editingVar');
            let now  = event.changed.editingVar;
            if (now !== null) {
                if (this.selection !== null && now !== this.selection.colNo) {
                    this._endEditing().then(() => {
                        let rowNo = this.selection === null ? 0 : this.selection.rowNo;
                        this._setSelection(rowNo, now);
                    }, () => {});
                }
            }
        });

        this._setSelection(0, 0);
    },
    _columnsChanged(event) {

        for (let changes of event.changes) {
            let column = this.model.getColumnById(changes.id);
            let index = this.model.indexOfColumnById(changes.id);
            if (index !== -1) {
                if (changes.levelsChanged || changes.measureTypeChanged) {
                    let $header = $(this.$headers[index]);
                    $header.attr('data-measuretype', column.measureType);
                    let $column = $(this.$columns[index]);
                    $column.attr('data-measuretype', column.measureType);
                }

                if (changes.nameChanged) {
                    let header = this.$headers[index];
                    header.innerText = column.name;
                }
            }
        }
    },
    _clickHandler(event) {
        let element = document.elementFromPoint(event.clientX, event.clientY);
        let $element = $(element);

        if (event.type === 'click') {
            if ($element.hasClass('silky-column-cell')) {
                let rowNo = $element.data('row');
                let colNo = $element.data('col');
                if (rowNo === this.selection.rowNo && colNo === this.selection.colNo)
                    return;
                this._endEditing().then(() => {
                    this._setSelection(rowNo, colNo);
                }, () => {});
            }
        }
        else if (event.type === 'dblclick') {
            if ($element.hasClass('silky-column-header')) {
                let colNo = $element.data('index');
                this._endEditing().then(() => {
                    let rowNo = this.selection === null ? 0 : this.selection.rowNo;
                    this._setSelection(rowNo, colNo);
                }, () => {});
                if (this.model.get('editingVar') === null)
                    this.model.set('editingVar', colNo);
            }
        }
    },
    _moveCursor(direction) {

        if (this.selection === null)
            return;

        let rowNo = this.selection.rowNo;
        let colNo = this.selection.colNo;

        switch (direction) {
            case 'left':
                if (this.selection.colNo > 0)
                    this._setSelection(rowNo, colNo - 1);
                break;
            case 'right':
                if (this.selection.colNo < this.model.attributes.columnCount - 1)
                    this._setSelection(rowNo, colNo + 1);
                break;
            case 'up':
                if (this.selection.rowNo > 0)
                    this._setSelection(rowNo - 1, colNo);
                break;
            case 'down':
                if (this.selection.rowNo < this.model.attributes.rowCount - 1)
                    this._setSelection(rowNo + 1, colNo);
                break;
        }
    },
    _setSelection(rowNo, colNo) {

        if (this.selection !== null) {

            // remove row/column highlights from last time

            if (colNo !== this.selection.colNo)
                $(this.$headers[this.selection.colNo]).removeClass('highlighted');
            if (rowNo !== this.selection.rowNo && rowNo <= this.viewport.bottom && rowNo >= this.viewport.top) {
                let vRowNo = this.selection.rowNo - this.viewport.top;
                let $cell = this.$rhColumn.children(':nth-child(' + (vRowNo + 1) + ')');
                $cell.removeClass('highlighted');
            }
        } else {

            this.selection = {};
        }

        this.selection.rowNo = rowNo;
        this.selection.colNo = colNo;
        this.currentColumn = this.model.attributes.columns[colNo];
        if (this.model.get('editingVar') !== null)
            this.model.set('editingVar', colNo);

        // add column header highlight
        $(this.$headers[colNo]).addClass('highlighted');

        // add row header highlight
        if (rowNo <= this.viewport.bottom && rowNo >= this.viewport.top) {
            let vRowNo = rowNo - this.viewport.top;
            let $cell = this.$rhColumn.children(':nth-child(' + (vRowNo + 1) + ')');
            $cell.addClass('highlighted');
        }

        // move selection cell to new location
        let x = this._lefts[colNo];
        let y = rowNo * this._rowHeight;
        let width = this._widths[colNo];
        let height = this._rowHeight;

        this.$selection.css({ left: x, top: y, width: width, height: height});
        this.$selection.blur();
        this.$selection.removeClass('editing');
        this.$selection.val('');

        let selRight = x + width;
        let scrollX = this.$container.scrollLeft();
        let diffX = 0;
        let containerRight = scrollX + (this.$container.width() - TableView.getScrollbarWidth());
        if (selRight > containerRight)
            diffX = selRight - containerRight;
        else if (x - this.rowHeaderWidth < scrollX)
            diffX = (x - this.rowHeaderWidth) - scrollX;

        let selBottom = y + height;
        let scrollY = this.$container.scrollTop();
        let diffY = 0;
        let containerBottom = scrollY + (this.$container.height() - TableView.getScrollbarWidth());
        if (selBottom > containerBottom)
            diffY = selBottom - containerBottom;
        else if (y < scrollY)
            diffY = y - scrollY;

        if (diffX)
            this.$container.scrollLeft(scrollX + diffX);
        if (diffY)
            this.$container.scrollTop(scrollY + diffY);

        // slide row/column highlight *lines* into position
        this.$selectionRowHighlight.css({ top: y, width: this.rowHeaderWidth, height: height });
        this.$selectionColumnHighlight.css({ left: x, width: width, height: height });

        return new Promise((resolve, reject) => {
            this.$selection.one('transitionend', resolve);
        });
    },
    _beginEditing(ch) {

        if (this._editing)
            return;
        this._editing = true;
        keyboardJS.setContext('spreadsheet-editing');

        let rowNo = this.selection.rowNo;
        let colNo = this.selection.colNo;
        let type = this.model.attributes.columns[colNo].measureType;

        this.$selection.addClass('editing');
        this.$selection.attr('data-measuretype', type);

        if (typeof(ch) === 'undefined') {
            let value = this.model.valueAt(rowNo, colNo);
            this.$selection.val(value);
        }

        setTimeout(() => {
            this.$selection.select();
            if (typeof(ch) !== 'undefined') {
                this.$selection.val(ch);
                this._edited = true;
            }
        }, 50);
    },
    _applyEdit() {
        if ( ! this._edited)
            return Promise.resolve();

        return Promise.resolve().then(() => {

            let value = this.$selection.val().trim();

            if (value === '') {
                value = null; // missing value
            }
            else {
                let number = Number(value);
                switch (this.currentColumn.measureType) {
                    case 'continuous':
                        if ( ! Number.isNaN(number))
                            value = number;
                        else if ( ! this.currentColumn.autoMeasure)
                            throw {
                                title: 'Numeric value required',
                                message: 'Variables of type Continuous only accept numeric values',
                            };
                        break;
                    case 'nominal':
                    case 'ordinal':
                        if (Number.isInteger(number))
                            value = number;
                        else if ( ! this.currentColumn.autoMeasure)
                            throw {
                                title: 'Integer value required',
                                message: 'Nominal and Ordinal variables only accept integer values',
                            };
                        else if ( ! Number.isNaN(number))
                            value = number;
                        break;
                    case 'nominaltext':
                        break;
                }
            }

            let viewport = {
                left:   this.selection.colNo,
                right:  this.selection.colNo,
                top:    this.selection.rowNo,
                bottom: this.selection.rowNo
            };

            return this.model.changeCells(viewport, [[ value ]]);
        });
    },
    _endEditing() {
        if (this._editing === false)
            return Promise.resolve();

        return Promise.resolve().then(() => {
            return this._applyEdit();
        }).then(() => {
            this._editing = false;
            keyboardJS.setContext('spreadsheet');
            this.$selection.val('');
            this.$selection.blur();
            this.$selection.removeClass('editing');
        }).catch(err => {
            this._notifyEditProblem(err);
            this.$selection.select();
            console.log(err);
            throw 'cancelled';
        });
    },
    _notifyEditProblem(details) {
        this._editNote.set(details);
        this.trigger('notification', this._editNote);
    },
    _abortEditing() {
        if (this._editing === false)
            return;

        this._editing = false;
        keyboardJS.setContext('spreadsheet');
        this._edited = false;

        this.$selection.blur();
        this.$selection.val('');
        this.$selection.removeClass('editing');
    },
    _editingKeyPress(event) {

        switch(event.key) {
            case 'Enter':
                this._endEditing().then(() => {
                    this._moveCursor('down');
                }, () => {});
                break;
            case 'Escape':
                this._abortEditing();
                break;
            case 'Tab':
                this._endEditing().then(() => {
                    if (event.shiftKey)
                        this._moveCursor('left');
                    else
                        this._moveCursor('right');
                }, () => {});
                event.preventDefault();
                break;
            case 'Delete':
            case 'Backspace':
                this._edited = true;
                break;
            default:
                if (event.key.length === 1)
                    this._edited = true;
                break;
        }
        event.stopPropagation();
    },
    _notEditingKeyPress(event) {

        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
        case 'ArrowLeft':
            this._moveCursor('left');
            event.preventDefault();
            break;
        case 'Tab':
            if (event.shiftKey)
                this._moveCursor('left');
            else
                this._moveCursor('right');
            event.preventDefault();
            break;
        case 'ArrowRight':
            this._moveCursor('right');
            event.preventDefault();
            break;
        case 'ArrowUp':
            this._moveCursor('up');
            event.preventDefault();
            break;
        case 'ArrowDown':
            this._moveCursor('down');
            event.preventDefault();
            break;
        case 'Enter':
            if (this.model.get('varEdited') === false)
                this._moveCursor('down');
            event.preventDefault();
            break;
        case 'Delete':
        case 'Backspace':
            let viewport = {
                left:  this.selection.colNo,
                right: this.selection.colNo,
                top:   this.selection.rowNo,
                bottom: this.selection.rowNo,
            };
            this.model.changeCells(viewport, [[ null ]]);
            break;
        case 'F2':
            this._beginEditing();
            break;
        case 'F3':
            if (this.model.get('editingVar') === null)
                this.model.set('editingVar', this.selection.colNo);
            else
                this.model.set('editingVar', null);
            event.preventDefault();
            break;
        case ' ':
            event.preventDefault();
            break;
        default:
            if (event.key.length === 1)
                this._beginEditing(event.key);
            break;
        }
    },
    _columnResizeHandler(event) {
        if (event.clientX === 0 && event.clientY === 0)
            return;

        let $target = $(event.target);
        let $parent = $target.parent();
        let x = event.offsetX - 6;

        if (x === 0)
            return;

        let colNo = parseInt($target.attr('data-index'));

        let newWidth = this._widths[colNo] + x;
        if (newWidth < 32) {
            newWidth = 32;
            x = newWidth - this._widths[colNo];
        }

        this._widths[colNo] = newWidth;
        let $header = $(this.$headers[colNo]);
        let $column = $(this.$columns[colNo]);
        let css = { width: this._widths[colNo] };
        $header.css(css);
        $column.css(css);

        for (let i = colNo + 1; i < this._lefts.length; i++) {
            this._lefts[i] += x;
            let $header = $(this.$headers[i]);
            let $column = $(this.$columns[i]);
            let css = { left: this._lefts[i] };
            $header.css(css);
            $column.css(css);
        }

        if (colNo <= this.selection.colNo) {
            let x = this._lefts[this.selection.colNo];
            let y = this.selection.rowNo * this._rowHeight;
            let width = this._widths[this.selection.colNo];
            let height = this._rowHeight;

            this.$selection.css({ left: x, top: y, width: width, height: height});
            this.$selectionColumnHighlight.css({ left: x, width: width, height: height });
        }

        this._resizeHandler();
    },
    _updateCells() {

        let colOffset = this.model.get('viewport').left;
        let cells = this.model.get('cells');
        let columns = this.model.get('columns');

        for (let colNo = 0; colNo < cells.length; colNo++) {

            let column = cells[colNo];
            let $column = $(this.$columns[colOffset + colNo]);
            let $cells  = $column.children();

            let dps = columns[colOffset + colNo].dps;

            for (let rowNo = 0; rowNo < column.length; rowNo++) {
                let $cell = $($cells[rowNo]);
                let content = column[rowNo];

                this._updateCell($cell, content, dps);
            }
        }

    },
    _cellsChanged(range) {

        let viewport = this.viewport;

        let colOffset = range.left - viewport.left;
        let rowOffset = range.top - viewport.top;
        let nCols = range.right - range.left + 1;
        let nRows = range.bottom - range.top + 1;

        let cells = this.model.get('cells');
        let columns = this.model.get('columns');

        for (let colNo = 0; colNo < nCols; colNo++) {

            let column = cells[colOffset + colNo];
            let $column = $(this.$columns[range.left + colNo]);
            let $cells  = $column.children();

            let columnInfo = columns[range.left + colNo];
            let dps = columnInfo.dps;
            if (columnInfo.measureType !== 'continuous')
                dps = 0;

            for (let rowNo = 0; rowNo < nRows; rowNo++) {

                let $cell = $($cells[rowOffset + rowNo]);
                let content = column[rowOffset + rowNo];
                this._updateCell($cell, content, dps);
            }
        }
    },
    _updateCell($cell, content, dps) {

        let type;
        let asNumber = Number(content);

        if (content === null || content === '') {
            content = '';
            type = '';
        }
        else if (typeof(content) === 'number') {
            content = asNumber.toFixed(dps);
            type = 'number';
        }
        else if (Number.isNaN(asNumber)) {
            type = 'string';
        }
        else {
            type = 'number';
        }


        $cell.text(content);
        $cell.attr('data-type', type);
    },
    _scrollHandler(event) {

        if (this.model.get('hasDataSet') === false)
            return;

        let currentViewRange = this._getViewRange();
        if (this._encloses(this.viewOuterRange, currentViewRange) === false)
            this._updateViewRange();

        let left = this.$container.scrollLeft();
        this.$rhColumn.css('left', left);
        this.$selectionRowHighlight.css('left', left);
        this.$header.css('left', -left);
        this.$header.css('width', this.$el.width() + left);
    },
    _resizeHandler(event) {

        if (this.model.get('hasDataSet') === false)
            return;

        let currentViewRange = this._getViewRange();
        if (this._encloses(this.viewOuterRange, currentViewRange) === false)
            this._updateViewRange();

        let left = this.$container.scrollLeft();
        this.$header.css('left', -left);
        this.$header.css('width', this.$el.width() + left);
        this.$container.css('height', this.$el.height() - this._rowHeight);
    },
    _updateViewRange() {

        let v = this._getViewRange();

        let topRow = Math.floor(v.top / this._rowHeight) - 1;
        let botRow = Math.ceil(v.bottom / this._rowHeight) - 1;

        let rowCount = this.model.get('rowCount');
        let columnCount = this.model.get('columnCount');

        let columns = this.model.get("columns");

        let leftColumn  = _.sortedIndex(this._lefts, v.left) - 1;
        let rightColumn = _.sortedIndex(this._lefts, v.right) - 1;

        if (leftColumn > columnCount - 1)
            leftColumn = columnCount - 1;
        if (leftColumn < 0)
            leftColumn = 0;
        if (rightColumn > columnCount - 1)
            rightColumn = columnCount - 1;
        if (rightColumn < 0)
            rightColumn = 0;

        let oTop  = ((topRow + 1) * this._rowHeight);
        let oBot  = ((botRow + 1) * this._rowHeight);
        let oLeft = this._lefts[leftColumn];

        let oRight;
        if (rightColumn == columns.length - 1) // last column
            oRight = Infinity;
        else
            oRight = this._lefts[rightColumn] + columns[rightColumn].width;

        if (botRow > rowCount - 1)
            botRow = rowCount - 1;
        if (botRow < 0)
            botRow = 0;
        if (topRow > rowCount - 1)
            topRow = rowCount - 1;
        if (topRow < 0)
            topRow = 0;

        let oldViewport = this.viewport;

        this.viewRange      = v;
        this.viewOuterRange = { top : oTop,   bottom : oBot,   left : oLeft,      right : oRight };
        this.viewport    = { top : topRow, bottom : botRow, left : leftColumn, right : rightColumn };

        //console.log("view");
        //console.log(this.viewport);
        //console.log(this.viewRange);
        //console.log(this.viewOuterRange);

        this.refreshCells(oldViewport, this.viewport);
    },
    _createCellHTML(top, height, rowNo, colNo) {

        return '<div ' +
            ' class="silky-column-cell"' +
            ' data-row="' + rowNo + '"' +
            ' data-col="' + colNo + '"' +
            ' style="top : ' + top + 'px ; height : ' + height + 'px">' +
            '</div>';
    },
    _createRHCellHTML(top, height, content, rowNo) {

        let highlighted = '';
        if (this.selection !== null && this.selection.rowNo === rowNo)
            highlighted = 'highlighted';

        return '<div class="silky-row-header-cell ' + highlighted + '" style="top : ' + top + 'px ; height : ' + height + 'px">' + content + '</div>';
    },
    refreshCells(oldViewport, newViewport) {

        let o = oldViewport;
        let n = newViewport;

        let columns = this.model.get('columns');

        if (o === null || n.top !== o.top || n.bottom !== o.bottom) {

            this.$rhColumn.empty();
            let nRows = n.bottom - n.top + 1;

            for (let j = 0; j < nRows; j++) {
                let rowNo = n.top + j;
                let top   = rowNo * this._rowHeight;
                let $cell = $(this._createRHCellHTML(top, this._rowHeight, '' + (n.top+j+1), rowNo));
                this.$rhColumn.append($cell);
            }
        }

        if (o === null || this._overlaps(o, n) === false) { // entirely new cells

            if (o !== null) {  // clear old cells

                for (let i = o.left; i <= o.right; i++) {
                    let $column = $(this.$columns[i]);
                    $column.empty();
                }
            }

            let nRows = n.bottom - n.top + 1;

            for (let i = n.left; i <= n.right; i++) {

                let column  = columns[i];
                let $column = $(this.$columns[i]);

                for (let j = 0; j < nRows; j++) {
                    let rowNo = n.top + j;
                    let top   = rowNo * this._rowHeight;
                    let $cell = $(this._createCellHTML(top, this._rowHeight, rowNo, i));
                    $column.append($cell);
                }
            }

            this.model.setViewport(n);
        }
        else {  // add or subtract from cells displayed

            if (n.right > o.right) {  // add columns to the right

                let nCols = n.right - o.right;
                let nRows = n.bottom - n.top + 1;

                for (let i = 0; i < nCols; i++) {

                    let colNo = o.right + i + 1;
                    let left  = this._lefts[colNo];
                    let column = columns[colNo];
                    let $column = $(this.$columns[colNo]);

                    for (let j = 0; j < nRows; j++) {
                        let rowNo = n.top + j;
                        let top = this._rowHeight * rowNo;
                        let $cell = $(this._createCellHTML(top, this._rowHeight, rowNo, colNo));
                        $column.append($cell);
                    }
                }
            }
            else if (n.right < o.right) {  // delete columns from the right
                let nCols = o.right - n.right;
                let count = this.$columns.length;
                for (let i = 0; i < nCols; i++) {
                    let $column = $(this.$columns[o.right - i]);
                    $column.empty();
                }
            }

            if (n.left < o.left) {  // add columns to the left

                let nCols = o.left - n.left;
                let nRows = n.bottom - n.top + 1;

                for (let i = 0; i < nCols; i++) {

                    let colNo = n.left + i;
                    let left  = this._lefts[colNo];
                    let column = columns[colNo];
                    let $column = $(this.$columns[colNo]);

                    for (let j = 0; j < nRows; j++) {
                        let rowNo = n.top + j;
                        let top = this._rowHeight * rowNo;
                        let $cell = $(this._createCellHTML(top, this._rowHeight, rowNo, colNo));
                        $column.append($cell);
                    }
                }
            }
            else if (n.left > o.left) {  // delete columns from the left
                let nCols = n.left - o.left;
                let count = this.$columns.length;
                for (let i = 0; i < nCols; i++) {
                    let $column = $(this.$columns[o.left + i]);
                    $column.empty();
                }
            }

            if (n.bottom > o.bottom) {

                let nRows = n.bottom - o.bottom;  // to add rows to the bottom

                let left  = Math.max(o.left,  n.left);
                let right = Math.min(o.right, n.right);

                for (let i = left; i <= right; i++) {

                    let column  = columns[i];
                    let $column = $(this.$columns[i]);

                    for (let j = 0; j < nRows; j++) {
                        let rowNo = o.bottom + j + 1;
                        let top   = rowNo * this._rowHeight;
                        let $cell = $(this._createCellHTML(top, this._rowHeight, rowNo, i));
                        $column.append($cell);
                    }
                }
            }

            if (n.bottom < o.bottom) {

                let nRows = o.bottom - n.bottom;  // to remove from the bottom

                let left  = Math.max(o.left,  n.left);
                let right = Math.min(o.right, n.right);

                for (let i = left; i <= right; i++) {

                    let $column = $(this.$columns[i]);
                    let $cells = $column.children();
                    let count = $cells.length;

                    for (let j = 0; j < nRows; j++)
                        $($cells[count - j - 1]).remove();
                }
            }

            if (n.top < o.top) {

                let nRows = o.top - n.top;  // add to top

                let left  = Math.max(o.left,  n.left);
                let right = Math.min(o.right, n.right);

                for (let i = left; i <= right; i++) {

                    let column  = columns[i];
                    let $column = $(this.$columns[i]);

                    for (let j = 0; j < nRows; j++) {
                        let rowNo = o.top - j - 1;
                        let top   = rowNo * this._rowHeight;
                        let $cell = $(this._createCellHTML(top, this._rowHeight, rowNo, i));
                        $column.prepend($cell);
                    }
                }
            }

            if (n.top > o.top) {  // remove from the top

                let nRows = n.top - o.top;

                let left  = Math.max(o.left,  n.left);
                let right = Math.min(o.right, n.right);

                for (let c = left; c <= right; c++) {
                    let $column = $(this.$columns[c]);
                    let $cells = $column.children();
                    for (let r = 0; r < nRows; r++)
                        $($cells[r]).remove();
                }
            }

            let deltaLeft   = o.left - n.left;
            let deltaRight  = n.right - o.right;
            let deltaTop    = o.top - n.top;
            let deltaBottom = n.bottom - o.bottom;

            this.model.reshape(deltaLeft, deltaTop, deltaRight, deltaBottom);
        }
    },
    _getViewRange() {
        let vTop   = this.$container.scrollTop();
        let vBot   = vTop + this.$el.height() - this._rowHeight;
        let vLeft  = this.$container.scrollLeft();
        let vRight = vLeft + this.$el.width();

        return { top : vTop, bottom : vBot, left : vLeft, right : vRight };
    },
    _encloses(outer, inner) {
        return outer.left   <= inner.left
            && outer.right  >= inner.right
            && outer.top    <= inner.top
            && outer.bottom >= inner.bottom;
    },
    _overlaps(one, two) {
        let colOverlap = (one.left >= two.left && one.left <= two.right) || (one.right >= two.left && one.right <= two.right);
        let rowOverlap = (one.top <= two.bottom && one.top >= two.top)  || (one.bottom <= two.bottom && one.bottom >= two.top);
        return rowOverlap && colOverlap;
    }
});

TableView.prototype._scrollbarWidth = null;
TableView.getScrollbarWidth = function() {
    if (TableView.prototype._scrollbarWidth === null) {
        var outer = document.createElement("div");
        outer.style.visibility = "hidden";
        outer.style.width = "100px";
        outer.style.msOverflowStyle = "scrollbar"; // needed for WinJS apps

        document.body.appendChild(outer);

        var widthNoScroll = outer.offsetWidth;
        // force scrollbars
        outer.style.overflow = "scroll";

        // add innerdiv
        var inner = document.createElement("div");
        inner.style.width = "100%";
        outer.appendChild(inner);

        var widthWithScroll = inner.offsetWidth;

        // remove divs
        outer.parentNode.removeChild(outer);

        TableView.prototype._scrollbarWidth = widthNoScroll - widthWithScroll;
    }
    return TableView.prototype._scrollbarWidth;
};


module.exports = TableView;
