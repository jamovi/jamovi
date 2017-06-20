//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');
const dialogs = require('dialogs')({cancel:false});

const SilkyView = require('./view');
const Notify = require('./notification');
const { csvifyCells, htmlifyCells } = require('./utils/formatio');
const host = require('./host');
const ActionHub = require('./actionhub');

const TableView = SilkyView.extend({
    className: "tableview",
    initialize() {

        $(window).on('resize', event => this._resizeHandler(event));
        this.$el.on('resized', event => this._resizeHandler(event));

        this.model.on('dataSetLoaded', this._dataSetLoaded, this);
        this.model.on('change:cells',  this._updateCells, this);
        this.model.on('cellsChanged', this._cellsChanged, this);
        this.model.on('columnsChanged', event => this._columnsChanged(event));
        this.model.on('columnsDeleted', event => this._columnsDeleted(event));
        this.model.on('columnsInserted', event => this._columnsInserted(event));

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
        this.$headers   = [ ];

        this._bodyWidth = 0;

        this.rowHeaderWidth = 32;

        this.$container.on('scroll', event => this._scrollHandler(event));

        setTimeout(() => {
            this._rowHeight = this.$header.height();  // read and store the row height
            this.$header.css('height', this._rowHeight);
            this.$container.css('top', this._rowHeight);
            this.$container.css('height', this.$el.height() - this._rowHeight);
        }, 0);

        this.selection = null;

        this.$el.on('mousedown', event => this._mouseDown(event));
        this.$el.on('mousemove', event => this._mouseMove(event));
        $(document).on('mouseup', event => this._mouseUp(event));
        this.$el.on('dblclick', event => this._dblClickHandler(event));

        this._active = true;

        keyboardJS.setContext('spreadsheet-editing');
        keyboardJS.bind('', event => this._editingKeyPress(event));
        keyboardJS.setContext('spreadsheet');
        keyboardJS.bind('', event => this._notEditingKeyPress(event));

        this._edited = false;
        this._editing = false;
        this._editNote = new Notify({ duration: 3000 });

        ActionHub.get('cut').on('request', this._cutSelectionToClipboard, this);
        ActionHub.get('copy').on('request', this._copySelectionToClipboard, this);
        ActionHub.get('paste').on('request', this._pasteClipboardToSelection, this);

        ActionHub.get('editVar').on('request', this._toggleVariableEditor, this);

        ActionHub.get('insertVar').on('request', this._insertColumn, this);
        ActionHub.get('appendVar').on('request', this._appendColumn, this);
        ActionHub.get('delVar').on('request', this._deleteColumns, this);

        ActionHub.get('insertRow').on('request', this._insertRows, this);
        ActionHub.get('appendRow').on('request', this._appendRows, this);
        ActionHub.get('delRow').on('request', this._deleteRows, this);
    },
    setActive(active) {
        this._active = active;
        if (this._active)
            keyboardJS.setContext('spreadsheet');
        else
            keyboardJS.setContext('');
    },
    _addColumnToView(column) {
        let width  = column.width;
        let left = this._bodyWidth;

        let html = this._createHeaderHTML(column.index, left);

        let $header = $(html);
        this.$header.append($header);
        this.$headers.push($header);

        let $column = $('<div data-measuretype="' + column.measureType + '" class="silky-column" style="left: ' + left + 'px ; width: ' + column.width + 'px ; "></div>');
        this.$body.append($column);
        this.$columns.push($column);

        this._lefts[column.index] = left;
        this._widths[column.index] = width;
        this._bodyWidth += width;

        this.$body.css('width',  this._bodyWidth);

        this._enableDisableActions();
    },
    _dataSetLoaded() {

        this.$header.empty();  // clear the temporary cell

        // add the top-left corner cell
        this.$header.append('<div class="silky-column-header" style="width:' + this.rowHeaderWidth + 'px ; height: ' + this._rowHeight + 'px">&nbsp;</div>');

        let columns = this.model.get('columns');
        this._bodyWidth = this.rowHeaderWidth;

        this._lefts = new Array(columns.length);  // store the left co-ordinate for each column
        this._widths = new Array(columns.length);

        for (let colNo = 0; colNo < columns.length; colNo++) {
            let column = columns[colNo];
            this._addColumnToView(column);
        }

        this.$rhColumn = $('<div class="silky-column-row-header" style="left: 0 ; width: ' + this.rowHeaderWidth + 'px ; background-color: pink ;"></div>').appendTo(this.$body);

        let vRowCount = this.model.get('vRowCount');
        let totalHeight = vRowCount * this._rowHeight;
        this.$body.css('height', totalHeight);

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

        this.model.on('change:vRowCount', event => {
            this._updateHeight();
        });

        this._setSelection(0, 0);
    },
    _updateHeight() {
        let vRowCount = this.model.get('vRowCount');
        let totalHeight = vRowCount * this._rowHeight;
        this.$body.css('height', totalHeight);
        this._refreshRHCells(this.viewport);
    },
    _columnsDeleted(event) {

        let nToRemove = event.end - event.start + 1;
        let headersToRemove = this.$headers.slice(event.start, event.end + 1);
        let columnsToRemove = this.$columns.slice(event.start, event.end + 1);

        for (let header of headersToRemove)
            $(header).remove();
        for (let column of columnsToRemove)
            $(column).remove();

        let widthReduction = this._widths.slice(event.start, event.end + 1).reduce((acc, val) => acc + val, 0);

        let exclude = (elem, index) => index < event.start || index > event.end;

        this.$headers = this.$headers.filter(exclude);
        this.$columns = this.$columns.filter(exclude);
        this._lefts  = this._lefts.filter(exclude);
        this._widths = this._widths.filter(exclude);

        for (let i = event.start; i < this.model.attributes.vColumnCount; i++) {
            this._lefts[i] -= widthReduction;
            let $header = $(this.$headers[i]);
            let $column = $(this.$columns[i]);
            $header.attr('data-index', i);
            $header.children().attr('data-index', i);
            $header.css('left', '' + this._lefts[i] + 'px');
            $column.css('left', '' + this._lefts[i] + 'px');
        }

        this._bodyWidth -= widthReduction;
        this.$body.css('width', this._bodyWidth);

        this.viewport = this.model.attributes.viewport;

        this._updateViewRange();
    },
    _columnsChanged(event) {

        let editingVar = this.model.get('editingVar');
        let editingVarCleared = false;

        for (let changes of event.changes) {

            if (changes.deleted) {
                if (editingVarCleared === false && editingVar !== null) {
                    this.model.set('editingVar', changes.index + 1, { silent: true });
                    this.model.set('editingVar', changes.index);
                    editingVarCleared = true;
                }
                continue;
            }

            if (changes.created && changes.index === editingVar) {
                this.model.set('editingVar', changes.index + 1, { silent: true });
                this.model.set('editingVar', changes.index);
            }

            let column = this.model.getColumnById(changes.id);

            if (changes.levelsChanged || changes.measureTypeChanged) {
                let $header = $(this.$headers[column.index]);
                $header.attr('data-measuretype', column.measureType);
                let $column = $(this.$columns[column.index]);
                $column.attr('data-measuretype', column.measureType);
            }

            if (changes.nameChanged) {
                let header = this.$headers[column.index];
                let $label = $(header).find('.silky-column-header-label');
                $label.text(column.name);
            }
        }

        this._enableDisableActions();
        this._updateViewRange();
    },
    _getPos(x, y) {
        let bounds = this.$body[0].getBoundingClientRect();
        let vx = x - bounds.left;
        let vy = y - bounds.top;

        let rowNo = Math.floor(vy / this._rowHeight);
        let colNo;
        for (colNo = -1; colNo < this._lefts.length - 1; colNo++) {
            if (vx < this._lefts[colNo+1])
                break;
        }

        return { rowNo: rowNo, colNo: colNo, x: vx, y: vy };
    },
    _mouseDown(event) {

        if (event.button === 2 || event.button === 0 && event.ctrlKey) {
            // right click
            return;
        }

        let pos = this._getPos(event.clientX, event.clientY);
        let rowNo = pos.rowNo;
        let colNo = pos.colNo;

        if (this._editing &&
            rowNo === this.selection.rowNo &&
            colNo === this.selection.colNo)
                return;

        this._endEditing().then(() => {

            if (rowNo >= 0 && colNo >= 0) {

                this._isDragging = true;
                this._isClicking = true;

                if (event.shiftKey) {
                    this._clickCoords = Object.assign({}, this.selection);
                    this._mouseMove(event);
                }
                else {
                    this._clickCoords = pos;
                }

            }
            else if (rowNo < 0 && colNo >= 0) {

                let left = colNo;
                let right = colNo;

                if (event.shiftKey) {
                    if (this.selection.colNo > colNo)
                        right = this.selection.colNo;
                    else if (this.selection.colNo < colNo)
                        left = this.selection.colNo;
                    colNo = this.selection.colNo;
                }

                let range = {
                    rowNo: this.selection.rowNo,
                    colNo: colNo,
                    left: left,
                    right: right,
                    top: 0,
                    bottom: this.model.attributes.rowCount - 1 };

                this._setSelectedRange(range);
            }
            else if (rowNo >= 0 && colNo < 0) {

                let top = rowNo;
                let bot = rowNo;

                if (event.shiftKey) {
                    if (this.selection.rowNo > rowNo)
                        bot = this.selection.rowNo;
                    else if (this.selection.rowNo < rowNo)
                        top = this.selection.rowNo;
                    rowNo = this.selection.rowNo;
                }

                let range = {
                    rowNo: rowNo,
                    colNo: this.selection.colNo,
                    left: 0,
                    right: this.model.attributes.columnCount - 1,
                    top: top,
                    bottom: bot };

                this._setSelectedRange(range);
            }

        }, () => {});
    },
    _mouseUp(event) {
        if (this._isClicking) {
            this._setSelection(this._clickCoords.rowNo, this._clickCoords.colNo);
        }
        else if (this._isDragging) {

        }
        this._isClicking = false;
        this._isDragging = false;
    },
    _mouseMove(event) {
        if ( ! this._isDragging)
            return;
        this._isClicking = false; // mouse moved, no longer a click

        let pos = this._getPos(event.clientX, event.clientY);

        if (pos.rowNo < 0 || pos.colNo < 0)
            return;
        if (this._lastPos && pos.rowNo === this._lastPos.rowNo && pos.colNo === this._lastPos.colNo)
            return;

        this._lastPos = pos;

        let rowNo = pos.rowNo;
        let colNo = pos.colNo;

        let left  = Math.min(colNo, this._clickCoords.colNo);
        let right = Math.max(colNo, this._clickCoords.colNo);
        let top   = Math.min(rowNo, this._clickCoords.rowNo);
        let bottom = Math.max(rowNo, this._clickCoords.rowNo);

        let range = {
            rowNo: this._clickCoords.rowNo,
            colNo: this._clickCoords.colNo,
            left: left,
            right: right,
            top: top,
            bottom: bottom };

        this._setSelectedRange(range);
    },
    _dblClickHandler(event) {

        let element = document.elementFromPoint(event.clientX, event.clientY);
        let $element = $(element);

        let $header = $element.closest('.silky-column-header');
        if ($header.length > 0) {
            let colNo = $header.data('index');
            this._endEditing().then(() => {
                let rowNo = this.selection === null ? 0 : this.selection.rowNo;
                this._setSelection(rowNo, colNo);
            }, () => {});
            if (this.model.get('editingVar') === null)
                this.model.set('editingVar', colNo);
        }
        else {
            if ( ! this._editing)
                this._beginEditing();
        }
    },
    _moveCursor(direction, extend) {

        if (this.selection === null)
            return;

        let range = Object.assign({}, this.selection);
        let rowNo = range.rowNo;
        let colNo = range.colNo;

        let scrollLeft = false;
        let scrollRight = false;
        let scrollUp = false;
        let scrollDown = false;

        switch (direction) {
            case 'left':
                if (extend) {
                    if (range.right > range.colNo) {
                        range.right--;
                    }
                    else if (range.left > 0) {
                        range.left--;
                        scrollLeft = true;
                    }
                    else {
                        return;
                    }
                }
                else {
                    if (colNo > 0) {
                        colNo--;
                        scrollLeft = true;
                    }
                    else {
                        colNo = 0;
                    }
                    range.left  = colNo;
                    range.right = colNo;
                    range.colNo = colNo;
                    range.rowNo = rowNo;
                    range.top   = rowNo;
                    range.bottom = rowNo;
                }
                break;
            case 'right':
                if (extend) {
                    if (range.left < range.colNo) {
                        range.left++;
                    }
                    else if (range.right < this.model.attributes.vColumnCount - 1) {
                        range.right++;
                        scrollRight = true;
                    }
                    else {
                        return;
                    }
                }
                else {
                    if (range.colNo < this.model.attributes.vColumnCount - 1) {
                        colNo = range.colNo + 1;
                        scrollRight = true;
                    }
                    else {
                        colNo = this.model.attributes.vColumnCount - 1;
                    }
                    range.left  = colNo;
                    range.right = colNo;
                    range.colNo = colNo;
                    range.rowNo = rowNo;
                    range.top   = rowNo;
                    range.bottom = rowNo;
                }
                break;
            case 'up':
                if (extend) {
                    if (range.bottom > range.rowNo) {
                        range.bottom--;
                    }
                    else if (range.top > 0) {
                        range.top--;
                        scrollUp = true;
                    }
                    else {
                        return;
                    }
                }
                else {
                    if (rowNo > 0) {
                        rowNo--;
                        scrollUp = true;
                    }
                    else {
                        rowNo = 0;
                    }
                    range.top    = rowNo;
                    range.bottom = rowNo;
                    range.rowNo  = rowNo;
                    range.colNo  = colNo;
                    range.left   = colNo;
                    range.right  = colNo;
                }
                break;
            case 'down':
                if (extend) {
                    if (range.top < range.rowNo) {
                        range.top++;
                    }
                    else if (range.bottom < this.model.attributes.vRowCount - 1) {
                        range.bottom++;
                        scrollDown = true;
                    }
                    else {
                        return;
                    }
                }
                else {
                    if (range.rowNo < this.model.attributes.vRowCount - 1) {
                        rowNo = range.rowNo + 1;
                        scrollDown = true;
                    }
                    else {
                        rowNo = this.model.attributes.rRowCount - 1;
                    }
                    range.top    = rowNo;
                    range.bottom = rowNo;
                    range.rowNo  = rowNo;
                    range.colNo  = colNo;
                    range.left   = colNo;
                    range.right  = colNo;
                }
                break;
        }

        this._setSelectedRange(range);

        if (scrollLeft || scrollRight) {
            let x = this._lefts[range.left];
            let width = this._lefts[range.right] + this._widths[range.right] - x;
            let selRight = x + width;
            let scrollX = this.$container.scrollLeft();
            let containerRight = scrollX + (this.$container.width() - TableView.getScrollbarWidth());
            if (scrollRight && selRight > containerRight)
                this.$container.scrollLeft(scrollX + selRight - containerRight);
            else if (scrollLeft && x - this.rowHeaderWidth < scrollX)
                this.$container.scrollLeft(x - this.rowHeaderWidth);
        }

        if (scrollUp || scrollDown) {

            let nRows = range.bottom - range.top + 1;
            let y = range.top * this._rowHeight;
            let height = this._rowHeight * nRows;

            let selBottom = y + height;
            let scrollY = this.$container.scrollTop();
            let containerBottom = scrollY + (this.$container.height() - TableView.getScrollbarWidth());

            if (scrollDown && selBottom > containerBottom)
                this.$container.scrollTop(scrollY + selBottom - containerBottom);
            else if (scrollUp && y < scrollY)
                this.$container.scrollTop(y);
        }

    },
    _setSelection(rowNo, colNo) {
        return this._setSelectedRange({
            rowNo: rowNo,
            colNo: colNo,
            top:   rowNo,
            bottom: rowNo,
            left:  colNo,
            right: colNo });
    },
    _setSelectedRange(range) {

        let rowNo = range.rowNo;
        let colNo = range.colNo;

        if (this.selection !== null) {

            // remove row/column highlights from last time

            for (let colNo = this.selection.left; colNo <= this.selection.right; colNo++)
                $(this.$headers[colNo]).removeClass('highlighted');

            for (let rowNo = this.selection.top; rowNo <= this.selection.bottom; rowNo++) {
                if (rowNo <= this.viewport.bottom && rowNo >= this.viewport.top) {
                    let vRowNo = rowNo - this.viewport.top;
                    let $cell = this.$rhColumn.children(':nth-child(' + (vRowNo + 1) + ')');
                    $cell.removeClass('highlighted');
                }
            }

        } else {

            this.selection = {};
        }

        let oldSel = Object.assign({}, this.selection);

        Object.assign(this.selection, range);

        this._enableDisableActions();

        this.currentColumn = this.model.attributes.columns[colNo];
        if (this.model.get('editingVar') !== null)
            this.model.set('editingVar', colNo);

        // add column header highlight
        for (let colNo = range.left; colNo <= range.right; colNo++)
            $(this.$headers[colNo]).addClass('highlighted');

        // add row header highlight
        for (let rowNo = range.top; rowNo <= range.bottom; rowNo++) {
            if (rowNo <= this.viewport.bottom && rowNo >= this.viewport.top) {
                let vRowNo = rowNo - this.viewport.top;
                let $cell = this.$rhColumn.children(':nth-child(' + (vRowNo + 1) + ')');
                $cell.addClass('highlighted');
            }
        }

        // move selection cell to new location
        let nRows = range.bottom - range.top + 1;
        let x = this._lefts[range.left];
        let y = range.top * this._rowHeight;
        let width = this._lefts[range.right] + this._widths[range.right] - x;
        let height = this._rowHeight * nRows;

        this.$selection.css({ left: x, top: y, width: width, height: height});
        this.$selection.blur();
        this.$selection.removeClass('editing');
        this.$selection.val('');

        // slide row/column highlight *lines* into position
        this.$selectionRowHighlight.css({ top: y, width: this.rowHeaderWidth, height: height });
        this.$selectionColumnHighlight.css({ left: x, width: width, height: this._rowHeight });

        if (oldSel.left === range.left &&
            oldSel.right === range.right &&
            oldSel.top === range.top &&
            oldSel.bottom === range.bottom)
                return Promise.resolve();

        return new Promise((resolve, reject) => {
            this.$selection.one('transitionend', resolve);
        });
    },
    _beginEditing(ch) {

        if (this._editing)
            return;
        if (this.selection.left !== this.selection.right)
            return;
        if (this.selection.top !== this.selection.bottom)
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
                                type: 'error',
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
                                type: 'error'
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

        if (event.ctrlKey || event.metaKey) {
            if (event.key === 'c') {
                this._copySelectionToClipboard()
                    .done();
                event.preventDefault();
            }
            else if (event.key === 'v') {
                let promise = this._pasteClipboardToSelection();
                if (promise)
                    promise.done();
                event.preventDefault();
            }
            else if (event.key === 'x') {
                this._cutSelectionToClipboard()
                    .done();
                event.preventDefault();
            }
        }

        if (event.metaKey || event.ctrlKey || event.altKey)
            return;

        switch(event.key) {
        case 'ArrowLeft':
            this._moveCursor('left', event.shiftKey);
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
            this._moveCursor('right', event.shiftKey);
            event.preventDefault();
            break;
        case 'ArrowUp':
            this._moveCursor('up', event.shiftKey);
            event.preventDefault();
            break;
        case 'ArrowDown':
            this._moveCursor('down', event.shiftKey);
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
                left:  this.selection.left,
                right: this.selection.right,
                top:   this.selection.top,
                bottom: this.selection.bottom };
            this.model.changeCells(viewport, null);
            break;
        case 'F2':
            this._beginEditing();
            break;
        case 'F3':
            this._toggleVariableEditor();
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
    _deleteColumns() {
        let start = this.selection.left;
        let end = this.selection.right;

        let oldSelection = Object.assign({}, this.selection);
        let newSelection = Object.assign({}, this.selection);

        newSelection.rowNo = 0;
        newSelection.top = 0;
        newSelection.bottom = this.model.attributes.vRowCount - 1;

        if (newSelection.right >= this.model.attributes.columnCount)
            newSelection.right = this.model.attributes.columnCount - 1;

        return this._setSelectedRange(newSelection).then(() => {

            return new Promise((resolve, reject) => {

                let cb = (result) => {
                    if (result)
                        resolve();
                    else
                        reject();
                };

                if (newSelection.left === newSelection.right) {
                    let column = this.model.getColumn(newSelection.left);
                    dialogs.confirm('Delete column \'' + column.name + '\' ?', cb);
                }
                else {
                    dialogs.confirm('Delete columns ' + (newSelection.left+1) + ' - ' + (newSelection.right+1) + '?', cb);
                }
            });

        }).then(() => {

            return this.model.deleteColumns(newSelection.left, newSelection.right);

        }).then(() => {

            return this._setSelection(oldSelection.top, oldSelection.left);

        }).then(undefined, (error) => {
            if (error)
                console.log(error);
            return this._setSelectedRange(oldSelection);
        });

    },
    _deleteRows() {
        let start = this.selection.top;
        let end = this.selection.bottom;

        let oldSelection = Object.assign({}, this.selection);
        let newSelection = Object.assign({}, this.selection);

        newSelection.colNo = 0;
        newSelection.left = 0;
        newSelection.right = this.model.attributes.vColumnCount - 1;

        if (newSelection.bottom >= this.model.attributes.rowCount)
            newSelection.bottom = this.model.attributes.rowCount - 1;

        return this._setSelectedRange(newSelection).then(() => {

            return new Promise((resolve, reject) => {

                let cb = (result) => {
                    if (result)
                        resolve();
                    else
                        reject();
                };

                if (newSelection.top === newSelection.bottom)
                    dialogs.confirm('Delete row ' + (newSelection.top+1) + '?', cb);
                else
                    dialogs.confirm('Delete rows ' + (newSelection.top+1) + ' - ' + (newSelection.bottom+1) + '?', cb);
            });

        }).then(() => {

            return this.model.deleteRows(newSelection.top, newSelection.bottom);

        }).then(() => {

            this._updateViewRange();
            this._refreshRHCells(this.viewport);
            this.model.readCells(this.viewport);

            return this._setSelection(oldSelection.top, oldSelection.left);

        }).then(undefined, (error) => {
            if (error)
                console.log(error);
            return this._setSelectedRange(oldSelection);
        });
    },
    _insertColumn() {
        return this.model.insertColumn(this.selection.colNo);
    },
    _columnsInserted(event) {

        let column = this.model.getColumn(event.index);

        if (event.index >= this._lefts.length) {  // append
            this._addColumnToView(column);
            return;
        }

        let left = this._lefts[event.index];
        let html = this._createHeaderHTML(event.index, left);

        let $after = $(this.$headers[column.index]);
        let $header = $(html);
        $header.insertBefore($after);
        this.$headers.splice(column.index, 0, $header);

        $after = $(this.$columns[column.index]);
        let $column = $('<div data-measuretype="' + column.measureType + '" class="silky-column" style="left: ' + left + 'px ; width: ' + column.width + 'px ; "></div>');
        $column.insertBefore($after);
        this.$columns.splice(column.index, 0, $column);

        this.viewport = this.model.attributes.viewport;
        for (let rowNo = this.viewport.top; rowNo < this.viewport.bottom; rowNo++) {
            let top   = rowNo * this._rowHeight;
            let $cell = this._createCell(top, this._rowHeight, rowNo, column.index);
            $column.append($cell);
        }

        this._lefts.splice(column.index, 0, this._lefts[column.index]);
        this._widths.splice(column.index, 0, column.width);

        let widthIncrease = column.width;

        for (let i = column.index + 1; i < this.model.attributes.vColumnCount; i++) {
            this._lefts[i] += widthIncrease;
            let $header = $(this.$headers[i]);
            let $column = $(this.$columns[i]);
            $header.attr('data-index', i);
            $header.children().attr('data-index', i);
            $header.css('left', '' + this._lefts[i] + 'px');
            $column.css('left', '' + this._lefts[i] + 'px');
        }

        this._bodyWidth += widthIncrease;
        this.$body.css('width', this._bodyWidth);

        let selection = Object.assign({}, this.selection);
        if (column.index <= this.selection.colNo) {
            this.selection.colNo++;
            this.selection.left++;
            this.selection.right++;
            this._setSelectedRange(selection);
        }

        this._updateViewRange();
    },
    _insertRows() {

        return new Promise((resolve, reject) => {

            keyboardJS.setContext('');
            dialogs.prompt('Insert how many rows?', '1', (result) => {
                keyboardJS.setContext('spreadsheet');
                if (result === undefined)
                    reject('cancelled by user');
                let n = parseInt(result);
                if (isNaN(n) || n <= 0)
                    reject('' + result + ' is not a positive integer');
                else
                    resolve(n);
            });

        }).then(n => {

            return this.model.insertRows(this.selection.top, this.selection.top + n - 1);

        });
    },
    _appendRows() {

        return new Promise((resolve, reject) => {

            keyboardJS.setContext('');
            dialogs.prompt('Append how many rows?', '1', (result) => {
                keyboardJS.setContext('spreadsheet');
                if (result === undefined)
                    reject('cancelled by user');
                let n = parseInt(result);
                if (isNaN(n) || n <= 0)
                    reject('' + result + ' is not a positive integer');
                else
                    resolve(n);
            });

        }).then(n => {

            let rowStart = this.model.attributes.rowCount;
            let rowEnd = rowStart + n - 1;
            return this.model.insertRows(rowStart, rowEnd);

        }).then(undefined, (error) => {
            if (error)
                console.log(error);
        });
    },
    _appendColumn() {

        let rowNo = this.selection.rowNo;
        let colNo = this.model.get('columnCount');
        let column = this.model.getColumn(colNo);

        this._setSelection(rowNo, colNo).then(() => {

            return this.model.changeColumn(column.id, { name: '', measureType: 'nominal' });

        }).then(() => {

            let selRight = this._lefts[colNo] + this._widths[colNo];
            let scrollX = this.$container.scrollLeft();
            let containerRight = scrollX + (this.$container.width() - TableView.getScrollbarWidth());
            if (selRight > containerRight)
                this.$container.scrollLeft(scrollX + selRight - containerRight);
        });
    },
    _enableDisableActions() {

        let selection = this.selection;

        if (selection === null)
            return;

        let dataSetBounds = {
            left: 0,
            right: this.model.attributes.columnCount - 1,
            top: 0,
            bottom: this.model.attributes.rowCount - 1 };

        ActionHub.get('delRow').set('enabled', selection.top <= dataSetBounds.bottom);
        ActionHub.get('delVar').set('enabled', selection.left <= dataSetBounds.right);
        ActionHub.get('insertVar').set('enabled', selection.left === selection.right && selection.colNo <= dataSetBounds.right);
        ActionHub.get('insertRow').set('enabled', selection.top === selection.bottom && selection.rowNo <= dataSetBounds.bottom);
    },
    _toggleVariableEditor() {
        if (this.model.get('editingVar') === null)
            this.model.set('editingVar', this.selection.colNo);
        else
            this.model.set('editingVar', null);
    },
    _cutSelectionToClipboard() {
        return this._copySelectionToClipboard()
            .then(() => this.model.changeCells(this.selection, null));
    },
    _copySelectionToClipboard() {
        return this.model.requestCells(this.selection)
            .then(cells => {
                host.copyToClipboard({
                    text: csvifyCells(cells),
                    html: htmlifyCells(cells),
                });
                this.$selection.addClass('copying');
                setTimeout(() => this.$selection.removeClass('copying'), 100);
            });
    },
    _pasteClipboardToSelection() {
        let content = host.pasteFromClipboard();

        let text = content.text;
        let html = content.html;

        if (text.trim() === '' && html.trim() === '')
            return;

        return this.model.changeCells(this.selection, text, html)
            .then(range => {

                range.rowNo = range.top;
                range.colNo = range.left;
                this._setSelectedRange(range);

                this.$selection.addClass('copying');
                setTimeout(() => this.$selection.removeClass('copying'), 100);

            }, error => {
                let notification = new Notify({
                    title: error.message,
                    message: error.cause,
                    duration: 4000,
                });
                this.trigger('notification', notification);
            });
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

        let rowCount = this.model.get('vRowCount');
        let columnCount = this.model.get('vColumnCount');

        let columns = this.model.get('columns');

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
        if (botRow < -1) // row count of zero is a bottom row of -1
            botRow = -1;
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
    _createHeaderHTML(colNo, left) {

        let column = this.model.get('columns')[colNo];

        let html = '';

        html += '<div data-id="' + column.id + '" data-index="' + column.index + '" data-measuretype="' + column.measureType + '" class="silky-column-header silky-column-header-' + column.id + '" style="left: ' + left + 'px ; width: ' + column.width + 'px ; height: ' + this._rowHeight + 'px">';
        html +=     '<span class="silky-column-header-label">' + column.name + '</span>';
        html +=     '<div class="silky-column-header-resizer" data-index="' + column.index + '" draggable="true"></div>';
        html += '</div>';

        return html;
    },
    _createCell(top, height, rowNo, colNo) {

        let $cell = $('<div ' +
            ' class="silky-column-cell"' +
            ' data-row="' + rowNo + '"' +
            ' data-col="' + colNo + '"' +
            ' style="top : ' + top + 'px ; height : ' + height + 'px">' +
            '</div>');

        return $cell;
    },
    _createRHCellHTML(top, height, content, rowNo) {

        let highlighted = '';
        if (this.selection !== null && this.selection.rowNo === rowNo)
            highlighted = ' highlighted';

        let virtual = '';
        if (rowNo >= this.model.attributes.rowCount)
            virtual = ' virtual';

        let $cell = $('<div class="silky-row-header-cell' + highlighted + virtual + '" style="top : ' + top + 'px ; height : ' + height + 'px">' + content + '</div>');

        return $cell;
    },
    _refreshRHCells(v) {
        this.$rhColumn.empty();
        let nRows = v.bottom - v.top + 1;

        for (let j = 0; j < nRows; j++) {
            let rowNo = v.top + j;
            let top   = rowNo * this._rowHeight;
            let content = '' + (v.top+j+1);
            let $cell = $(this._createRHCellHTML(top, this._rowHeight, content, rowNo));
            this.$rhColumn.append($cell);
        }
    },
    refreshCells(oldViewport, newViewport) {

        let o = oldViewport;
        let n = newViewport;

        let columns = this.model.get('columns');

        if (o === null || n.top !== o.top || n.bottom !== o.bottom) {
            this._refreshRHCells(n);
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
                    let $cell = this._createCell(top, this._rowHeight, rowNo, i);
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
                        let $cell = this._createCell(top, this._rowHeight, rowNo, colNo);
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
                        let $cell = this._createCell(top, this._rowHeight, rowNo, colNo);
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
                        let $cell = this._createCell(top, this._rowHeight, rowNo, i);
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
                        let $cell = this._createCell(top, this._rowHeight, rowNo, i);
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
