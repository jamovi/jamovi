//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const ColourPalette = require('./editors/colourpalette');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');
const dialogs = require('dialogs')({cancel:false});

const SilkyView = require('./view');
const Notify = require('./notification');
const { csvifyCells, htmlifyCells } = require('./utils/formatio');
const host = require('./host');
const ActionHub = require('./actionhub');
const ContextMenu = require('./contextmenu');

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
        this.model.on('columnsHidden', event => this._columnsDeleted(event));
        this.model.on('columnsVisible', event => this._columnsInserted(event));
        this.model.on('columnsActiveChanged', event => this._columnsActiveChanged(event));
        this.model.on('transformsChanged', event => this._transformsChanged(event));

        this._tabStart = { row: 0, col: 0 };
        this.viewport = null;
        this.viewOuterRange = { top: 0, bottom: -1, left: 0, right: -1 };

        this.$el.addClass('jmv-tableview');



        let html = '';
        html += '<div class="jmv-table-header">';
        html += '    <div class="jmv-column-header place-holder" style="width: 110%">&nbsp;</div>';
        html += '</div>';
        html += '<div class="jmv-table-container">';
        html += '    <div class="jmv-table-body">';
        html += '        <div class="jmv-column-row-header" style="left: 0 ;"></div>';
        html += '        <div class="jmv-sub-selections"></div>';
        html += '    </div>';
        html += '</div>';

        this.$el.html(html);

        this.$container = this.$el.find('.jmv-table-container');
        this.$header    = this.$el.find('.jmv-table-header');
        this.$body      = this.$container.find('.jmv-table-body');
        this.$rhColumn  = this.$body.find('.jmv-column-row-header');
        this.$columns   = [ ];
        this.$headers   = [ ];

        this._bodyWidth = 0;

        this.$container.on('scroll', event => this._scrollHandler(event));

        let $measureOne = $(this._createRHCellHTML(0, 0, '', 0))
            .css('width', 'auto')
            .appendTo(this.$rhColumn);
        let $measureTwo = $(this._createRHCellHTML(0, 0, '0', 1))
            .css('width', 'auto')
            .appendTo(this.$rhColumn);

        this._rowHeaderDigits = 2;
        this._rowHeaderWidthB = $measureOne[0].offsetWidth;
        this._rowHeaderWidthM = $measureTwo[0].offsetWidth - this._rowHeaderWidthB;
        this._rowHeaderWidth = this._rowHeaderDigits * this._rowHeaderWidthM + this._rowHeaderWidthB;

        this._rowHeight = this.$header[0].offsetHeight;  // read and store the row height
        this.$header.css('height', this._rowHeight);
        this.$container.css('top', this._rowHeight);
        this.$container.css('height', this.$el[0].offsetHeight - this._rowHeight);

        this.$rhColumn.css('width', this._rowHeaderWidth);
        this.$rhColumn.empty();

        this.selection = null;

        this.$body.on('mousedown', event => this._mouseDown(event));
        this.$header.on('mousedown', event => this._mouseDown(event));
        $(document).on('mousemove', event => this._mouseMove(event));
        $(document).on('mouseup', event => this._mouseUp(event));
        this.$el.on('dblclick', event => this._dblClickHandler(event));

        this._active = true;

        keyboardJS.setContext('spreadsheet-editing');
        keyboardJS.bind('', event => this._editingKeyPress(event));
        keyboardJS.setContext('spreadsheet');
        keyboardJS.bind('', event => this._notEditingKeyPress(event));

        this._edited = false;
        this._editing = false;
        this._modifyingCellContents = false;
        this._editNote = new Notify({ duration: 3000 });

        ActionHub.get('cut').on('request', this._cutSelectionToClipboard, this);
        ActionHub.get('copy').on('request', this._copySelectionToClipboard, this);
        ActionHub.get('paste').on('request', this._pasteClipboardToSelection, this);

        ActionHub.get('editVar').on('request', this._toggleVariableEditor, this);
        ActionHub.get('editFilters').on('request', this._toggleFilterEditor, this);

        ActionHub.get('insertVar').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = 'data'; }, 'left'));
        ActionHub.get('appendVar').on('request', () => this._appendColumn('data'));
        ActionHub.get('insertComputed').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = 'computed'; }, 'left'));
        ActionHub.get('appendComputed').on('request', () => this._appendColumn('computed'));
        ActionHub.get('insertRecoded').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = 'recoded'; }, 'left'));
        ActionHub.get('appendRecoded').on('request', () => this._appendColumn('recoded'));
        ActionHub.get('delVar').on('request', () => this._deleteColumns());
        ActionHub.get('compute').on('request', () => {
            this._insertFromSelectedColumns((item, column) => {
                item.columnType = 'computed';
            }, 'right');
        });
        ActionHub.get('transform').on('request', () => {
            this._insertFromSelectedColumns((item, column) => {
                item.columnType = 'recoded';
                item.parentId = column.id;
            }, 'right');
        });

        ActionHub.get('insertRow').on('request', this._insertRows, this);
        ActionHub.get('appendRow').on('request', this._appendRows, this);
        ActionHub.get('delRow').on('request', this._deleteRows, this);

        this._clearSelectionList();
    },
    _insertFromSelectedColumns(itemConstruction, direction) {
        if (direction === undefined)
            direction = 'right';

        let blocks = this._selectionToColumnBlocks();

        let inserts = [];
        let emptyIds = [];
        for (let block of blocks) {
            for (let i = 0; i < block.right - block.left + 1; i++) {
                let column = this.model.getColumn(block.right - i, true);
                if (column.columnType === 'none')
                    emptyIds.push(column.id);
                else {
                    let props = { /*name: column.name,*/ index: block[direction] + (direction === 'right' ? 1 : 0) };
                    itemConstruction(props, column);
                    inserts.push(props);
                }
            }
        }

        let promise = Promise.resolve();
        if (emptyIds.length > 0) {
            let pairs = [];
            for (let id of emptyIds) {
                let item = { };
                itemConstruction(item, this.model.getColumnById(id));
                pairs.push({ id: id, values: item });
            }
            promise = this.model.changeColumns(pairs);
        }

        return promise.then(() => {
            if (inserts.length > 0) {
                return this.model.insertColumn(inserts, true).then((data) => {
                    let ids = data.ids.concat(emptyIds);
                    this.model.set('editingVar', ids);
                });
            }
        });
    },
    setActive(active) {
        this._active = active;
        if (this._active)
            keyboardJS.setContext('spreadsheet');
        else
            keyboardJS.setContext('');
    },
    _updateColumnColour(column, $header, $column) {
        if (column.columnType === 'recoded') {
            let $colour = $header.find('.jmv-column-header-colour');
            let transform = this.model.getTransformById(column.transform);
            if (transform) {
                $colour.removeClass('no-transform');
                $colour.css('background-color', ColourPalette.get(transform.colourIndex));
                $colour.attr('title', 'Transform: ' + transform.name);
            }
            else
                $colour.addClass('no-transform');
        }
        else if (column.columnType === 'computed') {
            let $colour = $header.find('.jmv-column-header-colour');
            $colour.css('background-color', '#515151');
            $colour.attr('title', 'Computed variable');
        }

        if (column.columnType === 'recoded' || column.columnType === 'computed') {
            let ok = this._isColumnOk(column);
            if (ok)
                $column.css('background-color', 'hsla(0, 0%, 50%, 0.05)');
            else
                $column.css('background-color', '');

            return ok;
        }

        return true;
    },
    _addColumnToView(column) {
        let width  = column.width;
        let left = this._bodyWidth;

        let html = this._createHeaderHTML(column.dIndex, left);

        let $header = $(html);
        this.$header.append($header);
        this.$headers.push($header);

        this._addResizeListeners($header);

        let $column = $('<div data-fmlaok="' + (this._isColumnOk(column) ? '1' : '0') + '" data-active="' + (column.active ? '1' : '0') + '" data-columntype="' + column.columnType + '" data-datatype="' + column.dataType + '" data-measuretype="' + column.measureType + '" class="jmv-column jmv-column-' + column.id + '" style="left: ' + left + 'px ; width: ' + column.width + 'px ; "></div>');

        this.$body.append($column);
        this.$columns.push($column);

        this._lefts[column.dIndex] = left;
        this._widths[column.dIndex] = width;
        this._bodyWidth += width;

        this.$body.css('width',  this._bodyWidth);

        this._updateColumnColour(column, $header, $column);

        this._enableDisableActions();
    },
    selectAll() {
        let range = {
            rowNo: 0,
            colNo: 0,
            left: 0,
            right: this.model.visibleRealColumnCount() - 1,
            top: 0,
            bottom: this.model.attributes.rowCount - 1 };

        this._setSelections(range);
    },
    _dataSetLoaded() {

        this.$header.empty();  // clear the temporary cell

        // add a background for its border line
        this.$header.append('<div class="jmv-table-header-background"></div>');

        // add the top-left corner cell
        this.$topLeftCell = $('<div class="jmv-column-header select-all" style="width:' + this._rowHeaderWidth + 'px ; height: ' + this._rowHeight + 'px">&nbsp;</div>')
            .on('click', event => this.selectAll())
            .appendTo(this.$header);

        let vColumnCount = this.model.get('vColumnCount');

        this._bodyWidth = this._rowHeaderWidth;

        this._lefts = new Array(vColumnCount);  // store the left co-ordinate for each column
        this._widths = new Array(vColumnCount);

        for (let colNo = 0; colNo < vColumnCount; colNo++) {
            let column = this.model.getColumn(colNo, true);
            this._addColumnToView(column);
        }

        let vRowCount = this.model.get('vRowCount');
        let totalHeight = vRowCount * this._rowHeight;
        this.$body.css('height', totalHeight);

        this._updateViewRange();

        this.$selection = $('<input class="jmv-table-cell-selected" contenteditable>');
        this.$selection.width(this._lefts[0]);
        this.$selection.height(this._rowHeight);
        this.$selection.appendTo(this.$body);

        this.$selectionRowHighlight = $('<div class="jmv-table-row-highlight"></div>');
        this.$selectionRowHighlight.appendTo(this.$body);

        this.$selectionColumnHighlight = $('<div class="jmv-table-column-highlight"></div>');
        this.$selectionColumnHighlight.appendTo(this.$header);

        this.$selection.on('focus', event => this._beginEditing());
        this.$selection.on('blur', event => {
            if (this._editing)
                this._endEditing();
        });
        this.$selection.on('click', event => {
            if (this._editing)
                this._modifyingCellContents = true;
        });

        this.model.on('change:editingVar', event => {
            if (this._modifiedFromSelection)
                return;

            let now  = this.model.getDisplayedEditingColumns();
            if (now !== null && now.length > 0) {
                if (this.selection !== null) {
                    this._endEditing().then(() => {
                        this._createSelectionsFromColumns(this.selection.rowNo, now);
                        this._updateScroll(this.selection);
                    }, () => {});
                }
            }
        });

        this.model.on('change:vRowCount', event => {
            this._updateHeight();
        });

        this._setSelection(0, 0);
    },
    _refreshSelection() {
        if (this.model.attributes.editingVar !== null) {
            let now  = this.model.getDisplayedEditingColumns();
            if (now !== null && now.length > 0)
                this._createSelectionsFromColumns(this.selection.rowNo, now);
            else
                this._setSelections(this.selection, this._selectionList, true);
        }
        else
            this._setSelections(this.selection, this._selectionList, true);
    },
    _addResizeListeners($element) {
        let $resizers = $element.find('.jmv-column-header-resizer');
        $resizers.on('drag', event => this._columnResizeHandler(event));
        $resizers.on('mousedown', event => event.stopPropagation());
    },
    _updateHeight() {
        let vRowCount = this.model.get('vRowCount');
        let totalHeight = vRowCount * this._rowHeight;
        this.$body.css('height', totalHeight);
        this._refreshRHCells(this.viewport);
    },
    _columnsActiveChanged(event) {
        let exclude = (elem, index) => {
            return index >= event.dStart && index <= event.dEnd;
        };
        let $columns = this.$columns.filter(exclude);
        let $headers = this.$headers.filter(exclude);
        for (let $column of $columns)
            $($column).attr('data-active', event.value ? '1' : '0');

        for (let $header of $headers)
            $($header).attr('data-active', event.value ? '1' : '0');
    },
    _columnsDeleted(event) {

        let indices = $.extend(true, {}, event.indices);

        if (event.ids.length === 0)
            return;

        let lowestIndex = -1;
        let totalWidthReduction = 0;
        for (let id of event.ids) {
            let dIndex = indices[id].dIndex;
            if (dIndex === -1)
                continue;

            this.$el.find('.jmv-column-header-' + id).remove();
            this.$el.find('.jmv-column-' + id).remove();

            let widthReduction = this._widths[dIndex];
            totalWidthReduction += widthReduction;

            let removedHeaders = this.$headers.splice(dIndex, 1);
            let removedColumns = this.$columns.splice(dIndex, 1);
            this._lefts.splice(dIndex, 1);
            this._widths.splice(dIndex, 1);

            for (let $header of removedHeaders)
                $($header).remove();
            for (let $column of removedColumns)
                $($column).remove();


            for (let x in indices) {
                let i = indices[x];
                if (i.dIndex > dIndex)
                    i.dIndex -= 1;
            }

            for (let i = dIndex; i < this._lefts.length; i++)
                this._lefts[i] -= widthReduction;

            if (lowestIndex == -1 || dIndex < lowestIndex)
                lowestIndex = dIndex;
        }

        if (lowestIndex !== -1) {
            for (let i = lowestIndex; i < this._lefts.length; i++) {
                let $header = $(this.$headers[i]);
                let $column = $(this.$columns[i]);
                $header.attr('data-index', i);
                $header.children().attr('data-index', i);
                $header.css('left', '' + this._lefts[i] + 'px');
                $column.css('left', '' + this._lefts[i] + 'px');
            }
        }

        this._bodyWidth -= totalWidthReduction;
        this.$body.css('width', this._bodyWidth);

        this._refreshSelection();

        this.viewport = this.model.attributes.viewport;

        this._updateViewRange();
    },
    _findVisibleColumn(index) {
        let dIndex = this.model.indexToDisplayIndex(index);
        while (dIndex === -1 && index > 0) {
            index -= 1;
            dIndex = this.model.indexToDisplayIndex(index);
        }
        if (dIndex === -1)
            dIndex = 0;
        return { dIndex: dIndex, index: index };
    },
    _isColumnOk(column) {
        let ok = column.formulaMessage === '';
        if (ok && column.transform !== 0) {
            let transform = this.model.getTransformById(column.transform);
            if (transform) {
                for (let msg of transform.formulaMessage) {
                    if (msg !== '') {
                        ok = false;
                        break;
                    }
                }
            }
        }
        return ok;
    },
    _transformsChanged(event) {

        for (let changes of event.changes) {

            for (let column of this.model.attributes.columns) {
                if (column.hidden || column.columnType !== 'recoded' || column.transform !== changes.id)
                    continue;

                let $header = $(this.$headers[column.dIndex]);
                let $column = $(this.$columns[column.dIndex]);

                let ok = this._updateColumnColour(column, $header, $column);

                $column.attr('data-fmlaok', ok ? '1' : '0');
                $header.attr('data-fmlaok', ok ? '1' : '0');
                let $icon = $header.find('.jmv-column-header-icon');
                if ( ! ok)
                    $icon.attr('title', 'Issue with formula');
                else
                    $icon.removeAttr('title');
            }
        }
    },
    _columnsChanged(event) {
        let aFilterChanged = false;

        for (let changes of event.changes) {

            if (changes.deleted || changes.created || changes.hiddenChanged)
                continue;

            let column = this.model.getColumnById(changes.id);

            if (column.columnType === 'filter')
                aFilterChanged = true;

            if (column.hidden)
                continue;

            let $header = $(this.$headers[column.dIndex]);
            let $column = $(this.$columns[column.dIndex]);

            if (changes.levelsChanged || changes.measureTypeChanged || changes.dataTypeChanged || changes.columnTypeChanged) {
                $header.attr('data-measuretype', column.measureType);
                $header.attr('data-columntype', column.columnType);
                $header.attr('data-datatype', column.dataType);
                $column.attr('data-measuretype', column.measureType);
            }

            let ok = this._updateColumnColour(column, $header, $column);

            $column.attr('data-fmlaok', ok ? '1' : '0');
            $header.attr('data-fmlaok', ok ? '1' : '0');
            let $icon = $header.find('.jmv-column-header-icon');
            if ( ! ok)
                $icon.attr('title', 'Issue with formula');
            else
                $icon.removeAttr('title');

            if (changes.nameChanged) {
                let $label = $header.find('.jmv-column-header-label');
                $label.text(column.name);
            }
        }

        this._enableDisableActions();
        this._updateViewRange();

        if (aFilterChanged)
            this.model.readCells(this.model.attributes.viewport);
    },
    _getPos(x, y) {

        let rowNo, colNo, vx, vy;
        let rowHeader = false;
        let colHeader = false;

        let bounds = this.$el[0].getBoundingClientRect();
        let bodyBounds = this.$body[0].getBoundingClientRect();

        if (y - bounds.top >= 0 && y - bounds.top < this._rowHeight) // on column header
            colHeader = true;
        vy = y - bodyBounds.top;
        rowNo = Math.floor(vy / this._rowHeight);
        rowNo = rowNo < 0 ? 0 : rowNo;
        rowNo = rowNo > this.model.attributes.vRowCount - 1 ? this.model.attributes.vRowCount - 1 : rowNo;

        if (x - bounds.left >= 0 && x - bounds.left < this._rowHeaderWidth) // on row header
            rowHeader = true;
        vx = x - bodyBounds.left;
        for (colNo = 0; colNo < this._lefts.length; colNo++) {
            if (vx < this._lefts[colNo])
                break;
        }
        colNo -= 1;
        colNo = colNo < 0 ? 0 : colNo;

        let onHeader = 'none';
        if (rowHeader && colHeader)
            onHeader = 'both';
        else if (rowHeader)
            onHeader = 'rows';
        else if (colHeader)
            onHeader = 'columns';

        return { rowNo: rowNo, colNo: colNo, x: vx, y: vy, onHeader: onHeader  };
    },
    _cellInSelection(rowNo, colNo) {
        if (rowNo >= this.selection.top && rowNo <= this.selection.bottom &&
             colNo >= this.selection.left && colNo <= this.selection.right) {
                 return true;
             }

        for (let selection of this._selectionList) {
            if (rowNo >= selection.top && rowNo <= selection.bottom &&
                 colNo >= selection.left && colNo <= selection.right) {
                     return true;
                 }
        }

        return false;
    },
    _mouseDown(event) {

        let pos = this._getPos(event.clientX, event.clientY);
        let rowNo = pos.rowNo;
        let colNo = pos.colNo;

        if (event.button === 0) {
            if (event.ctrlKey || event.metaKey) {
                let range = {
                    rowNo: rowNo,
                    colNo: colNo,
                    left: colNo,
                    right: colNo,
                    top: rowNo,
                    bottom: rowNo,
                    colFocus: colNo,
                    rowFocus: rowNo };
                if (this._cellInSelection(rowNo, colNo))
                    this._addNewSelectionToList(range, 'negative');
                else
                    this._addNewSelectionToList(range);
            }
            else
                this._clearSelectionList();
        }
        else if (pos.onHeader !== 'none' || !this._cellInSelection(rowNo, colNo))
            this._clearSelectionList();


        this._draggingType = pos.onHeader === 'none' ? 'both' : pos.onHeader;

        if (event.button === 2) {
            if (pos.onHeader === 'none' && this._cellInSelection(rowNo, colNo))
                return Promise.resolve();
            else if (pos.onHeader === 'columns' && this.selection.top === 0 && this.selection.bottom === this.model.attributes.rowCount - 1 &&
                colNo >= this.selection.left && colNo <= this.selection.right)
                return Promise.resolve();
            else if (pos.onHeader === 'rows' && this.selection.left === 0 && this.selection.right === this.model.attributes.columnCount - 1 &&
                rowNo >= this.selection.top && rowNo <= this.selection.bottom)
                return Promise.resolve();
        }

        if (this._editing &&
            rowNo === this.selection.rowNo &&
            colNo === this.selection.colNo)
                return Promise.resolve();

        return this._endEditing().then(() => {

            if (pos.onHeader === 'none') {

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
            else if (pos.onHeader === 'columns') {

                let left = colNo;
                let right = colNo;
                this._isDragging = true;
                this._isClicking = true;
                this._clickCoords = pos;

                if (event.shiftKey) {
                    if (this.selection.colNo > colNo)
                        right = this.selection.colNo;
                    else if (this.selection.colNo < colNo)
                        left = this.selection.colNo;
                    colNo = this.selection.colNo;
                }

                this._clickRange = {
                    rowNo: this.selection.rowNo,
                    colNo: colNo,
                    left: left,
                    right: right,
                    top: 0,
                    bottom: this.model.attributes.rowCount - 1,
                    colFocus: pos.colNo,
                    rowFocus: pos.rowNo };
            }
            else if (pos.onHeader === 'rows') {

                let top = rowNo;
                let bot = rowNo;
                this._isDragging = true;
                this._isClicking = true;
                this._clickCoords = pos;

                if (event.shiftKey) {
                    if (this.selection.rowNo > rowNo)
                        bot = this.selection.rowNo;
                    else if (this.selection.rowNo < rowNo)
                        top = this.selection.rowNo;
                    rowNo = this.selection.rowNo;
                }

                this._clickRange = {
                    rowNo: rowNo,
                    colNo: this.selection.colNo,
                    left: 0,
                    right: this.model.attributes.columnCount - 1,
                    top: top,
                    bottom: bot,
                    colFocus: pos.colNo,
                    rowFocus: pos.rowNo  };
            }

        }, () => {});
    },
    _mouseUp(event) {

        if (this._isClicking && this._draggingType === 'both') {
            this._setSelection(this._clickCoords.rowNo, this._clickCoords.colNo, false);
        }
        else if (this._isClicking && (this._draggingType === 'rows' || this._draggingType === 'columns')) {
            this._setSelections(this._clickRange, null);
        }

        if (this._resolveSelectionList()) {
            this._isClicking = false;
            this._isDragging = false;
            return;
        }

        if (event.button === 2) {
            let element = document.elementFromPoint(event.clientX, event.clientY);
            let $element = $(element);
            let $header = $element.closest('.jmv-column-header');
            if ($header.length > 0) {
                if (this._isClicking === false) {
                    this._mouseDown(event).then(() => {
                        if (this._isClicking)
                            this._mouseUp(event);
                        else {
                            let colNo = this.selection === null ? 0 : this.selection.colNo;
                            let column = this.model.getColumn(colNo, true);
                            if (column.columnType === 'filter')
                                ContextMenu.showFilterMenu(event.clientX, event.clientY);
                            else
                                ContextMenu.showVariableMenu(event.clientX, event.clientY, this.selection.left !== this.selection.right);
                        }
                    }, 0);
                    return;
                }
                else {
                    let colNo = this.selection === null ? 0 : this.selection.colNo;
                    let column = this.model.getColumn(colNo, true);
                    if (column.columnType === 'filter')
                        ContextMenu.showFilterMenu(event.clientX, event.clientY);
                    else
                        ContextMenu.showVariableMenu(event.clientX, event.clientY, this.selection.left !== this.selection.right);
                }
            }
            else {
                let $table = $element.closest('.jmv-tableview');
                if ($table.length > 0) {
                    if (this._isClicking === false) {
                        this._mouseDown(event).then(() => {
                            if (this._isClicking)
                                this._mouseUp(event);
                            else {
                                let colNo = this.selection === null ? 0 : this.selection.colNo;
                                let column = this.model.getColumn(colNo, true);
                                if (column.columnType === 'filter')
                                    ContextMenu.showFilterRowMenu(event.clientX, event.clientY);
                                else {
                                    if (this.selection.top === 0 && this.selection.bottom === this.model.attributes.rowCount - 1)
                                        ContextMenu.showVariableMenu(event.clientX, event.clientY, this.selection.left !== this.selection.right);
                                    else
                                        ContextMenu.showDataRowMenu(event.clientX, event.clientY, this.selection.top !== this.selection.bottom);
                                }
                            }
                        }, () => {});
                        return;
                    }
                    let colNo = this.selection === null ? 0 : this.selection.colNo;
                    let column = this.model.getColumn(colNo, true);
                    if (column.columnType === 'filter')
                        ContextMenu.showFilterRowMenu(event.clientX, event.clientY);
                    else {
                        if (this.selection.top === 0 && this.selection.bottom === this.model.attributes.rowCount - 1)
                            ContextMenu.showVariableMenu(event.clientX, event.clientY, this.selection.left !== this.selection.right);
                        else
                            ContextMenu.showDataRowMenu(event.clientX, event.clientY, this.selection.top !== this.selection.bottom);
                    }
                }
            }
        }

        this._isClicking = false;
        this._isDragging = false;
    },
    _mouseMove(event) {
        if ( ! this._isDragging)
            return;
        this._isClicking = false; // mouse moved, no longer a click

        let pos = this._getPos(event.clientX, event.clientY);

        let dragBoth = this._draggingType === 'both';
        let dragRows = dragBoth || this._draggingType === 'rows';
        let dragCols = dragBoth || this._draggingType === 'columns';


        if (this._lastPos) {
            if (dragRows && pos.rowNo === this._lastPos.rowNo && dragCols && pos.colNo === this._lastPos.colNo)
                return;
            else if (dragRows && pos.rowNo === this._lastPos.rowNo && dragCols === false)
                return;
            else if (dragCols && pos.colNo === this._lastPos.colNo && dragRows === false)
                return;
        }

        this._lastPos = pos;

        let rowNo = pos.rowNo;
        let colNo = pos.colNo;

        let left  = (!dragBoth && dragRows) ? this._clickRange.left : Math.min(colNo, this._clickCoords.colNo);
        let right = (!dragBoth && dragRows) ? this._clickRange.right : Math.max(colNo, this._clickCoords.colNo);
        let top   = (!dragBoth && dragCols) ? this._clickRange.top : Math.min(rowNo, this._clickCoords.rowNo);
        let bottom = (!dragBoth && dragCols) ? this._clickRange.bottom : Math.max(rowNo, this._clickCoords.rowNo);

        let range = {
            rowNo: dragRows ? this._clickCoords.rowNo : this.selection.rowNo,
            colNo: dragCols ? this._clickCoords.colNo : this.selection.colNo,
            left: left,
            right: right,
            top: top,
            bottom: bottom,
            colFocus: dragCols ? pos.colNo : this.selection.colFocus,
            rowFocus: dragRows ? pos.rowNo : this.selection.rowFocus };

        this._setSelections(range, this._selectionList);
    },
    _dblClickHandler(event) {
        let element = document.elementFromPoint(event.clientX, event.clientY);
        let $element = $(element);

        let $header = $element.closest('.jmv-column-header:not(.select-all)');
        if ($header.length > 0) {
            let colId = parseInt($header.attr('data-id'));
            this._endEditing();
            if (this.model.get('editingVar') === null)
                this.model.set('editingVar', [colId]);
        }
        else {
            if ( ! this._editing)
                this._beginEditing();
        }
    },
    _moveCursor(direction, extend, ignoreTabStart) {

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
                        range.colFocus = range.right;
                    }
                    else if (range.left > 0) {
                        range.left--;
                        range.colFocus = range.left;
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
                    range.top    = rowNo;
                    range.bottom = rowNo;
                    range.rowNo  = rowNo;
                    range.rowFocus = rowNo;
                    range.colNo  = colNo;
                    range.left   = colNo;
                    range.right  = colNo;
                    range.colFocus = colNo;
                }
                break;
            case 'right':
                if (extend) {
                    if (range.left < range.colNo) {
                        range.left++;
                        range.colFocus = range.left;
                    }
                    else if (range.right < this.model.attributes.vColumnCount - 1) {
                        range.right++;
                        range.colFocus = range.right;
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
                    range.top    = rowNo;
                    range.bottom = rowNo;
                    range.rowNo  = rowNo;
                    range.rowFocus = rowNo;
                    range.colNo  = colNo;
                    range.left   = colNo;
                    range.right  = colNo;
                    range.colFocus = colNo;
                }
                break;
            case 'up':
                if (extend) {
                    if (range.bottom > range.rowNo) {
                        range.bottom--;
                        range.rowFocus = range.bottom;
                    }
                    else if (range.top > 0) {
                        range.top--;
                        range.rowFocus = range.top;
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
                    range.rowFocus = rowNo;
                    range.colNo  = colNo;
                    range.left   = colNo;
                    range.right  = colNo;
                    range.colFocus = colNo;
                }
                break;
            case 'down':
                if (extend) {
                    if (range.top < range.rowNo) {
                        range.top++;
                        range.rowFocus = range.top;
                    }
                    else if (range.bottom < this.model.attributes.vRowCount - 1) {
                        range.bottom++;
                        range.rowFocus = range.bottom;
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
                    range.rowFocus = rowNo;
                    range.colNo  = colNo;
                    range.left   = colNo;
                    range.right  = colNo;
                    range.colFocus = colNo;
                }
                break;
        }

        this._setSelections(range, [], false, ignoreTabStart);
    },
    _scrollToPosition(pos) {
        let range = { left: pos.colNo, right: pos.colNo, colNo: pos.colNo, top: pos.rowNo, bottom: pos.rowNo, rowNo: pos.rowNo };

        this._updateScroll(range);
    },
    _updateScroll(targetRange) {

        let range = targetRange === undefined ? this.selection : targetRange;

        let x = this._lefts[range.left];
        let width = this._lefts[range.right] + this._widths[range.right] - x;
        let selRight = x + width;
        let scrollX = this.$container.scrollLeft();
        let containerRight = scrollX + (this.$container.width() - TableView.getScrollbarWidth());
        if (selRight > containerRight)
            this.$container.scrollLeft(scrollX + selRight - containerRight);
        else if (x - this._rowHeaderWidth < scrollX)
            this.$container.scrollLeft(x - this._rowHeaderWidth);


        let nRows = range.bottom - range.top + 1;
        let y = range.top * this._rowHeight;
        let height = this._rowHeight * nRows;

        let selBottom = y + height;
        let scrollY = this.$container.scrollTop();
        let containerBottom = scrollY + (this.$container.height() - TableView.getScrollbarWidth());

        if (selBottom > containerBottom)
            this.$container.scrollTop(scrollY + selBottom - containerBottom);
        else if (y < scrollY)
            this.$container.scrollTop(y);

    },
    _setSelection(rowNo, colNo, clearSelectionList) {
        return this._setSelections({
            rowNo: rowNo,
            colNo: colNo,
            top:   rowNo,
            bottom: rowNo,
            left:  colNo,
            right: colNo,
            colFocus: colNo,
            rowFocus: rowNo }, clearSelectionList ? [] : null);
    },
    _rangesOverlap(range1, range2) {
        let verticalOverlap = ((range1.top < range2.top && range1.bottom < range2.top) || (range1.top > range2.bottom && range1.bottom > range2.bottom)) === false;
        let horizontalOverlap = ((range1.left < range2.left && range1.right < range2.left) || (range1.left > range2.right && range1.right > range2.right)) === false;
        return verticalOverlap && horizontalOverlap;
    },
    _resolveSelectionList() {
        if ( ! this._selectionNegative)
            return false;

        for (let i = 0; i < this._selectionList.length; i++) {
            let $subSel = this.$body.find('.jmv-table-cell-secondary-selected');
            let subSel = this._selectionList[i];
            if (subSel.left >= this.selection.left && subSel.right <= this.selection.right &&
                    subSel.top >= this.selection.top && subSel.bottom <= this.selection.bottom) {
                $($subSel[i]).remove();
                this._selectionList.splice(i, 1);
                i -= 1;
            }
            else if (this._rangesOverlap(this.selection, subSel)) {

                $($subSel[i]).remove();
                this._selectionList.splice(i, 1);

                let overlapRange = {
                    top:   Math.max(this.selection.top, subSel.top),
                    bottom: Math.min(this.selection.bottom, subSel.bottom),
                    left:  Math.max(this.selection.left, subSel.left),
                    right: Math.min(this.selection.right, subSel.right)
                };

                let top = overlapRange.top - subSel.top;
                let bottom = subSel.bottom - overlapRange.bottom;
                let left = overlapRange.left - subSel.left;
                let right = subSel.right - overlapRange.right;

                let toAdd = [];
                if (top > 0) {
                    let topSelection = {
                        top:   subSel.top,
                        bottom: subSel.top + top - 1,
                        left:  subSel.left,
                        right: subSel.right };
                    topSelection.rowNo = topSelection.top;
                    topSelection.colNo = topSelection.left;
                    toAdd.push(topSelection);
                }

                if (bottom > 0) {
                    let bottomSelection = {
                        top:   subSel.bottom - bottom + 1,
                        bottom: subSel.bottom,
                        left:  subSel.left,
                        right: subSel.right };
                    bottomSelection.rowNo = bottomSelection.top;
                    bottomSelection.colNo = bottomSelection.left;
                    toAdd.push(bottomSelection);
                }

                if (left > 0) {
                    let leftSelection = {
                        top:   subSel.top + top,
                        bottom: subSel.bottom - bottom,
                        left:  subSel.left,
                        right: subSel.left + left - 1 };
                    leftSelection.rowNo = leftSelection.top;
                    leftSelection.colNo = leftSelection.left;
                    toAdd.push(leftSelection);
                }

                if (right > 0) {
                    let rightSelection = {
                        top:   subSel.top + top,
                        bottom: subSel.bottom - bottom,
                        left:  subSel.right - right + 1,
                        right: subSel.right };
                    rightSelection.rowNo = rightSelection.top;
                    rightSelection.colNo = rightSelection.left;
                    toAdd.push(rightSelection);
                }

                this._selectionList.splice.apply(this._selectionList, [i, 0].concat(toAdd));
                //this._createSecondarySelections(toAdd, i);
                i += toAdd.length - 1;
            }
        }

        this._selectionNegative = false;
        this.$selection.removeClass('negative');

        if (this._selectionList.length > 0) {
            let $subSel = this.$body.find('.jmv-table-cell-secondary-selected');
            $($subSel[0]).remove();
            let mainSelection = this._selectionList[0];
            this._selectionList.splice(0, 1);
            this._setSelections(mainSelection, this._selectionList);
        }
        else
            this._setSelection(this.selection.rowNo, this.selection.colNo);

        return true;
    },
    _createSelectionsFromColumns(rowNo, columns, silent, ignoreTabStart) {
        columns.sort((a, b) => a.dIndex - b.dIndex);

        let selections = [];
        let selection = { };
        for (let column of columns) {
            if (selection.colNo !== undefined) {
                if (column.dIndex === selection.right + 1) {
                    selection.right += 1;
                }
                else {
                    selections.push(selection);
                    selection = { };
                }
            }

            if (selection.colNo === undefined) {
                selection = {
                    rowNo: rowNo,
                    top: rowNo,
                    bottom: rowNo,
                    left: column.dIndex,
                    right: column.dIndex,
                    colNo: column.dIndex
                };

            }
        }

        this._setSelections(selection, selections, silent, ignoreTabStart);
    },
    _clipSelection(selection) {
        for (let prop in selection) {
            if (selection[prop] < 0)
                selection[prop] = 0;
        }

        if (selection.colNo >= this.model.attributes.vColumnCount - 1)
            selection.colNo = this.model.attributes.vColumnCount - 1;
        if (selection.left >= this.model.attributes.vColumnCount - 1)
            selection.left = this.model.attributes.vColumnCount - 1;
        if (selection.right >= this.model.attributes.vColumnCount - 1)
            selection.right = this.model.attributes.vColumnCount - 1;
        if (selection.colFocus >= this.model.attributes.vColumnCount - 1)
            selection.colFocus = this.model.attributes.vColumnCount - 1;


        if (selection.rowNo >= this.model.attributes.vRowCount - 1)
            selection.rowNo = this.model.attributes.vRowCount - 1;
        if (selection.top >= this.model.attributes.vRowCount - 1)
            selection.top = this.model.attributes.vRowCount - 1;
        if (selection.bottom >= this.model.attributes.vRowCount - 1)
            selection.bottom = this.model.attributes.vRowCount - 1;
        if (selection.rowFocus >= this.model.attributes.vRowCount - 1)
            selection.rowFocus = this.model.attributes.vRowCount - 1;
    },
    _setSelections(mainSelection, subSelections, silent, ignoreTabStart) {

        if (mainSelection)
            this._clipSelection(mainSelection);

        if (subSelections) {
            for (let selection of subSelections)
                this._clipSelection(selection);
        }

        if (subSelections === undefined || Array.isArray(subSelections))
            this._clearSelectionList();

        if (subSelections && subSelections.length > 0) {
            this._selectionList = subSelections;
            this._createSecondarySelections(subSelections);
            if (this.$selection) {
                this.$selection.addClass('multi');
                this._selectionTransitionActive = false;
            }
        }
        else if (this._selectionList.length === 0) {
            if (this._selectionTransitionActive === false) {
                setTimeout(() => {
                    this.$selection.removeClass('multi');
                    this._selectionTransitionActive = true;
                }, 0);
            }
        }
        let promise = this._setSelectedRange(mainSelection, silent, ignoreTabStart);

        if ( !silent && this.model.get('editingVar') !== null) {
            this._updateEditingVarFromSelection();
        }

        return promise;
    },
    _mostCommonColumnType(ids) {
        let types = { };
        let greatest = null;
        for (let id of ids) {
            let column = this.model.getColumnById(id);
            let typeInfo = types[column.columnType];
            if (typeInfo === undefined) {
                typeInfo = { column: column, count: 1 };
                types[column.columnType] = typeInfo;
            }
            else
                typeInfo.count += 1;

            if (greatest === null || greatest.count < typeInfo.count)
                greatest = typeInfo;
        }
        return greatest;
    },
    _updateEditingVarFromSelection() {
        let types = { };
        let greatest = null;

        let countType = (column) => {
            let typeInfo = types[column.columnType];
            if (typeInfo === undefined) {
                typeInfo = { column: column, count: 1 };
                types[column.columnType] = typeInfo;
            }
            else
                typeInfo.count += 1;

            if (greatest === null || greatest.count < typeInfo.count)
                greatest = typeInfo;
        };

        let ids = [];
        for (let c = this.selection.left; c <= this.selection.right; c++) {
            let column = this.model.getColumn(c, true);
            countType(column);
            ids.push(column.id);
        }

        for (let selection of this._selectionList) {
            for (let c = selection.left; c <= selection.right; c++) {
                let column = this.model.getColumn(c, true);
                countType(column);
                if (ids.includes(column.id) === false)
                    ids.push(column.id);
            }
        }
        if (ids.length === 0)
            ids = null;
        else
            ids = ids.filter((id) => { return this.model.getColumnById(id).columnType === greatest.column.columnType; });


        this._modifiedFromSelection = true;
        this.model.set('editingVar', ids);
        this._modifiedFromSelection = false;
    },
    _addNewSelectionToList(range, type) {
        this._clipSelection(range);

        this._selectionNegative = type === 'negative';

        let prevSel = Object.assign({}, this.selection);
        this._selectionList.unshift(prevSel);
        if (this.$selection) {
            this.$selection.addClass('multi');
            this._selectionTransitionActive = false;
            if (this._selectionNegative)
                this.$selection.addClass('negative');
        }
        this._setSelectedRange(range);

        this._createSecondarySelections(prevSel, 0);

        if (this.model.get('editingVar') !== null)
            this._updateEditingVarFromSelection();
    },
    _createSecondarySelections(selections, index) {
        if (Array.isArray(selections) === false)
            selections = [ selections ];

        let $elements = [];
        for (let selection of selections) {
            let $secondarySelection = $('<div class="jmv-table-cell-secondary-selected"></div>');

            let nRows = selection.bottom - selection.top + 1;
            let x = this._lefts[selection.left];
            let y = selection.top * this._rowHeight;
            let width = this._lefts[selection.right] + this._widths[selection.right] - x;
            let height = this._rowHeight * nRows;

            $secondarySelection.css({ left: x, top: y, width: width, height: height});
            $elements.push($secondarySelection);
        }

        let $subSels = this.$body.find('.jmv-table-cell-secondary-selected');
        if (index === undefined || index === -1 || $subSels.length === 0 || index >= $subSels.length)
            this.$body.find('.jmv-sub-selections').append($elements);
        else
            $($subSels[index]).before($elements);
    },
    _selectionToColumnBlocks() {
        let blocks = [{ left: this.selection.left, right: this.selection.right }];

        let tryApply = (selection, index) => {
            let absorbed = false;
            let modified = false;
            for (let i = 0; i < blocks.length; i++) {
                let block = blocks[i];
                if (block === selection)
                    continue;
                let leftIn = selection.left >= block.left && selection.left <= (block.right + 1);
                let leftDown = selection.left < block.left;
                let rightIn = selection.right >= (block.left - 1) && selection.right <= block.right;
                let rightUp = selection.right > block.right;

                if (!leftIn && !rightIn && leftDown && rightUp) {
                    block.right = selection.right;
                    block.left = selection.left;
                    absorbed = true;
                    modified = true;
                }
                else if (leftIn && rightUp) {
                    block.right = selection.right;
                    absorbed = true;
                    modified = true;
                }
                else if (leftDown && rightIn) {
                    block.left = selection.left;
                    absorbed = true;
                    modified = true;
                }
                else if (leftIn && rightIn)
                    absorbed = true;

                if (absorbed) {
                    if (index !== undefined) {
                        blocks.splice(index, 1);
                        i = index <= i ? i - 1 : i;
                    }
                    if (modified)
                        tryApply(block, i);
                    break;
                }
            }
            if (absorbed === false && index === undefined)
                blocks.push({ left: selection.left, right: selection.right });
        };

        for (let selection of this._selectionList)
            tryApply(selection);

        blocks.sort((a,b) => {
            if (a.start < b.start)
                return -1;
            else if (a.start > b.start)
                return 1;
            else
                return 0;
        });

        return blocks;
    },
    _clearSelectionList() {
        if (this.$selection && this._selectionTransitionActive === false) {
            this.$selection.removeClass('multi');
            this._selectionTransitionActive = true;
        }
        this._selectionList = [];
        this.$body.find('.jmv-table-cell-secondary-selected').remove();
    },
    _applyHeaderHighlight(range, isSubSelection) {
        // add column header highlight
        for (let colNo = range.left; colNo <= range.right; colNo++) {
            let $header = $(this.$headers[colNo]);
            $header.addClass('highlighted');
            if (isSubSelection)
                $header.addClass('is-sub-selection');
        }

        // add row header highlight
        for (let rowNo = range.top; rowNo <= range.bottom; rowNo++) {
            if (rowNo <= this.viewport.bottom && rowNo >= this.viewport.top) {
                let vRowNo = rowNo - this.viewport.top;
                let $cell = this.$rhColumn.children(':nth-child(' + (vRowNo + 1) + ')');
                $cell.addClass('highlighted');
                if (isSubSelection)
                    $cell.addClass('is-sub-selection');
            }
        }
    },
    _updateHeaderHighlight() {

        this.$el.find('.jmv-column-header.highlighted, .jmv-row-header-cell.highlighted').removeClass('highlighted is-sub-selection');

        this._applyHeaderHighlight(this.selection, false);
        for (let range of this._selectionList) {
            this._applyHeaderHighlight(range, true);
        }
    },
    _currentSelectionToColumns() {
        let columnsObj = {};

        for (let c = this.selection.left; c <= this.selection.right; c++) {
            let column = this.model.getColumn(c, true);
            columnsObj[column.id] = column;
        }

        for (let selection of this._selectionList) {
            for (let c = selection.left; c <= selection.right; c++) {
                let column = this.model.getColumn(c, true);
                columnsObj[column.id] = column;
            }
        }

        let columns = [];
        for (let id in columnsObj)
            columns.push(columnsObj[id]);

        columns.sort((a, b) => a.dIndex - b.dIndex);

        return columns;
    },
    _currentSelectionToRowIndices() {
        let rowIndices = [];

        for (let r = this.selection.top; r <= this.selection.bottom; r++)
            rowIndices.push(r);

        for (let selection of this._selectionList) {
            for (let r = selection.top; r <= selection.bottom; r++) {
                if (rowIndices.includes(r) === false)
                    rowIndices.push(r);
            }
        }

        return rowIndices;
    },
    _setSelectedRange(range, silent, ignoreTabStart) {

        let rowNo = range.rowNo;
        let colNo = range.colNo;

        if ( ! ignoreTabStart)
            this._tabStart = { row: range.rowNo, col: range.colNo };

        if (this.selection === null)  {
            this.selection = {};
        }

        let oldSel = Object.assign({}, this.selection);

        Object.assign(this.selection, range);
        if (range.rowFocus === undefined)
            delete this.selection.rowFocus;
        if (range.colFocus === undefined)
            delete this.selection.colFocus;

        this._enableDisableActions();

        this.currentColumn = this.model.getColumn(colNo, true);

        this._updateHeaderHighlight();

        // move selection cell to new location
        let nRows = range.bottom - range.top + 1;
        let x = this._lefts[range.left];
        let y = range.top * this._rowHeight;
        let width = this._lefts[range.right] + this._widths[range.right] - x;
        let height = this._rowHeight * nRows;

        this.$selection.css({ left: x, top: y, width: width, height: height});

        this._abortEditing();

        if (this.selection.rowFocus !== undefined && this.selection.colFocus !== undefined)
            this._scrollToPosition({ rowNo: this.selection.rowFocus, colNo: this.selection.colFocus });

        // slide row/column highlight *lines* into position
        this.$selectionRowHighlight.css({ top: y, width: this._rowHeaderWidth, height: height });
        this.$selectionColumnHighlight.css({ left: x, width: width, height: this._rowHeight });

        if (oldSel.left === range.left &&
            oldSel.right === range.right &&
            oldSel.top === range.top &&
            oldSel.bottom === range.bottom)
                return Promise.resolve();

        this.$selection.removeClass('not-editable');
        if (this._selectionList.length === 0) {
            for (let c = this.selection.left; c <= this.selection.right; c++) {
                let column = this.model.getColumn(c, true);
                if (this._isColumnEditable(column) === false) {
                    this.$selection.addClass('not-editable');
                    break;
                }
            }
        }

        if ( ! this._selectionTransitioning) {
            this._selectionTransitioning = true;

            this._selectionTransitionPromise = new Promise((resolve, reject) => {
                if (this._selectionTransitionActive === false) {
                    this._selectionTransitioning = false;
                    resolve();
                }
                else {
                    this.$selection.one('transitionend', () => {
                        this._selectionTransitioning = false;
                        resolve();
                    });
                }
            });
        }

        return this._selectionTransitionPromise;
    },
    _isColumnEditable(column) {
        return ! (column.columnType === 'computed' || column.columnType === 'recoded' || column.columnType === 'filter');
    },
    _beginEditing(ch) {

        if (this._editing)
            return;
        if (this.selection.left !== this.selection.right)
            return;
        if (this.selection.top !== this.selection.bottom)
            return;

        let rowNo = this.selection.rowNo;
        let colNo = this.selection.colNo;
        let column = this.model.getColumn(colNo, true);

        if ( ! this._isColumnEditable(column)) {

            let columnType = column.columnType;
            columnType = columnType[0].toUpperCase() + columnType.substring(1);
            let err = {
                title: 'Column is not editable',
                message: columnType + ' columns may not be edited.',
                type: 'error' };
            this._notifyEditProblem(err);

            return;  // you can't edit computed columns
        }

        this._editing = true;
        keyboardJS.setContext('spreadsheet-editing');

        this.$selection.addClass('editing');
        this.$selection.attr('data-measuretype', column.measureType);

        if (ch === undefined) {
            let value = this.model.valueAt(rowNo, colNo);
            for (let levelInfo of this.currentColumn.levels) {
                if (value === levelInfo.value) {
                    value = levelInfo.label;
                    break;
                }
            }
            if (value)
                this._modifyingCellContents = true;

            this.$selection.val(value);
        }

        setTimeout(() => {
            this.$selection.select();
            if (ch !== undefined) {
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
                if (this.currentColumn.measureType === 'continuous') {
                    if ( ! Number.isNaN(number))
                        value = number;
                    else if ( ! this.currentColumn.autoMeasure)
                        throw {
                            message: 'Could not assign data',
                            cause: 'Cannot assign non-numeric value to column \'' + this.currentColumn.name + '\'',
                            type: 'error',
                        };
                }
                else if (this.currentColumn.dataType === 'text') {
                    // do nothing
                }
                else {
                    if (Number.isInteger(number))
                        value = number;
                    else if ( ! Number.isNaN(number))
                        value = number;
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
            this._edited = false;
            this._modifyingCellContents = false;
            keyboardJS.setContext('spreadsheet');
            this.$selection.val('');
            this.$selection.blur();
            this.$selection.removeClass('editing');
        }).catch(err => {
            this._notifyEditProblem({
                title: err.message,
                message: err.cause,
                type: 'error',
            });
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
        this._modifyingCellContents = false;
        keyboardJS.setContext('spreadsheet');
        this._edited = false;

        this.$selection.blur();
        this.$selection.val('');
        this.$selection.removeClass('editing');
    },
    _editingKeyPress(event) {

        switch(event.key) {
            case 'ArrowLeft':
                if (this._modifyingCellContents === false) {
                    this._endEditing().then(() => {
                        this._moveCursor('left');
                    }, () => {});
                }
                break;
            case 'ArrowRight':
                if (this._modifyingCellContents === false) {
                    this._endEditing().then(() => {
                        this._moveCursor('right');
                    }, () => {});
                }
                break;
            case 'ArrowUp':
                if (this._modifyingCellContents === false) {
                    this._endEditing().then(() => {
                        this._moveCursor('up');
                    }, () => {});
                }
                break;
            case 'ArrowDown':
                if (this._modifyingCellContents === false) {
                    this._endEditing().then(() => {
                        this._moveCursor('down');
                    }, () => {});
                }
                break;
            case 'Enter':
                this._endEditing().then(() => {
                    this._setSelection(this._tabStart.row, this._tabStart.col);
                    if (event.shiftKey)
                        this._moveCursor('up');
                    else
                        this._moveCursor('down');
                }, () => {});
                break;
            case 'Escape':
                this._abortEditing();
                break;
            case 'Tab':
                this._endEditing().then(() => {
                    if (event.shiftKey)
                        this._moveCursor('left', false, true);
                    else
                        this._moveCursor('right', false, true);
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
            if (event.key.toLowerCase() === 'c') {
                this._copySelectionToClipboard()
                    .done();
                event.preventDefault();
            }
            else if (event.key.toLowerCase() === 'v') {
                let promise = this._pasteClipboardToSelection();
                if (promise)
                    promise.done();
                event.preventDefault();
            }
            else if (event.key.toLowerCase() === 'x') {
                this._cutSelectionToClipboard()
                    .done();
                event.preventDefault();
            }
            else if (event.key.toLowerCase() === 'a') {
                this.selectAll();
                event.preventDefault();
            }
            else if (event.shiftKey && event.key === ' ') {
                this.selectAll();
            }
            else if (event.key === ' ') {
                let newSelection = Object.assign({}, this.selection);
                newSelection.left = 0;
                newSelection.right = this.model.visibleRealColumnCount() - 1;
                this._setSelections(newSelection);
            }

        }
        else if (event.shiftKey) {
            if (event.key === ' ') {
                let newSelection = Object.assign({}, this.selection);
                newSelection.top = 0;
                newSelection.bottom = this.model.attributes.rowCount - 1;
                this._setSelections(newSelection);
            }
        }

        if (event.altKey)
            return;

        if ((event.metaKey || event.ctrlKey) && ! (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown'))
            return;

        switch(event.key) {
            case 'PageDown':
                let bounds1 = this.$el[0].getBoundingClientRect();
                let count1 = Math.floor(bounds1.height / this._rowHeight) - 1;
                if (event.shiftKey) {
                    let newSelection = Object.assign({}, this.selection);
                    let topCells = Math.min(count1, newSelection.rowNo - newSelection.top);
                    newSelection.top += topCells;
                    newSelection.bottom += (count1 - topCells);
                    if (newSelection.bottom > this.model.attributes.rowCount - 1)
                        newSelection.bottom = this.model.attributes.rowCount - 1;

                    if (count1 - topCells > 0)
                        newSelection.rowFocus = newSelection.bottom;
                    else
                        newSelection.rowFocus = newSelection.top;

                    this._setSelections(newSelection);
                }
                else {
                    let rowNo = this.selection.rowNo + count1;
                    if (rowNo > this.model.attributes.rowCount - 1)
                        rowNo = this.model.attributes.rowCount - 1;
                    this._setSelection(rowNo, this.selection.colNo);
                }
                event.preventDefault();
                break;
            case 'PageUp':
                let bounds = this.$el[0].getBoundingClientRect();
                let count = Math.floor(bounds.height / this._rowHeight) - 1;
                if (event.shiftKey) {
                    let newSelection = Object.assign({}, this.selection);
                    let bottomCells = Math.min(count, newSelection.bottom - newSelection.rowNo);
                    newSelection.bottom -= bottomCells;
                    newSelection.top -= (count - bottomCells);
                    if (newSelection.top < 0)
                        newSelection.top = 0;

                    if (count - bottomCells > 0)
                        newSelection.rowFocus = newSelection.top;
                    else
                        newSelection.rowFocus = newSelection.bottom;
                    this._setSelections(newSelection);
                }
                else {
                    let rowNo = this.selection.rowNo - count;
                    if (rowNo < 0)
                        rowNo = 0;
                    this._setSelection(rowNo, this.selection.colNo);
                }
                event.preventDefault();
                break;
        case 'ArrowLeft':
            if (event.metaKey || event.ctrlKey) {
                if (event.shiftKey) {
                    let newSelection = Object.assign({}, this.selection);
                    newSelection.left = 0;
                    if (newSelection.right !== this.model.visibleRealColumnCount() - 1)
                        newSelection.colFocus = 0;
                    this._setSelections(newSelection);
                }
                else
                    this._setSelection(this.selection.rowNo, 0);
            }
            else
                this._moveCursor('left', event.shiftKey);
            event.preventDefault();
            break;
        case 'Tab':
            if (event.shiftKey)
                this._moveCursor('left', false, true);
            else
                this._moveCursor('right', false, true);
            event.preventDefault();
            break;
        case 'ArrowRight':
            if (event.metaKey || event.ctrlKey) {
                if (event.shiftKey) {
                    let newSelection = Object.assign({}, this.selection);
                    newSelection.right = this.model.visibleRealColumnCount() - 1;
                    if (newSelection.left !== 0)
                        newSelection.colFocus = this.model.visibleRealColumnCount() - 1;
                    this._setSelections(newSelection);
                }
                else
                    this._setSelection(this.selection.rowNo, this.model.visibleRealColumnCount() - 1);
            }
            else
                this._moveCursor('right', event.shiftKey);
            event.preventDefault();
            break;
        case 'ArrowUp':
            if (event.metaKey || event.ctrlKey) {
                if (event.shiftKey) {
                    let newSelection = Object.assign({}, this.selection);
                    newSelection.top = 0;
                    if (newSelection.bottom !== this.model.attributes.rowCount-1)
                        newSelection.rowFocus = 0;
                    this._setSelections(newSelection);
                }
                else
                    this._setSelection(0, this.selection.colNo);
            }
            else
                this._moveCursor('up', event.shiftKey);
            event.preventDefault();
            break;
        case 'ArrowDown':
            if (event.metaKey || event.ctrlKey) {
                if (event.shiftKey) {
                    let newSelection = Object.assign({}, this.selection);
                    newSelection.bottom = this.model.attributes.rowCount-1;
                    if (newSelection.top !== 0)
                        newSelection.rowFocus = this.model.attributes.rowCount-1;
                    this._setSelections(newSelection);
                }
                else
                    this._setSelection(this.model.attributes.rowCount-1, this.selection.colNo);
            }
            else
                this._moveCursor('down', event.shiftKey);
            event.preventDefault();
            break;
        case 'Enter':
            let editingIds = this.model.get('editingVar');
            if (editingIds !== null) {
                let column = this.model.getColumnById(editingIds[0]);
                if (column.hidden && column.columnType === 'filter') {
                    event.preventDefault();
                    break;
                }
            }

            if (this.model.get('varEdited') === false) {
                this._setSelection(this._tabStart.row, this._tabStart.col);
                if (event.shiftKey)
                    this._moveCursor('up');
                else
                    this._moveCursor('down');
            }
            event.preventDefault();
            break;
        case 'Delete':
        case 'Backspace':
            this._deleteCellContents(this.selection);

            for (let selection of this._selectionList)
                this._deleteCellContents(selection);
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
    _deleteCellContents(selection) {
        let viewport = {
            left:  selection.left,
            right: selection.right,
            top:   selection.top,
            bottom: selection.bottom };
        this.model.changeCells(viewport, null);
    },
    _deleteColumns() {

        let columns = this._currentSelectionToColumns();
        let contains = (nextColumn) => {
            return columns.some(element => { return element.id === nextColumn.id; });
        };

        for (let i = 0; i < columns.length; i++) {
            if (columns[i].columnType === 'none') {
                columns.splice(i, 1);
                i -= 1;
            }
            else if (columns[i].columnType === 'filter') {
                let prevColumn = this.model.getColumn(columns[i].dIndex - 1, true);
                if (!prevColumn || prevColumn.filterNo !== columns[i].filterNo) {
                    let index = this.model.indexFromDisplayIndex(columns[i].dIndex);
                    do {
                        index += 1;
                        let nextColumn = this.model.attributes.columns[index];
                        if (nextColumn.columnType === 'filter' && nextColumn.filterNo === columns[i].filterNo) {
                            if (contains(nextColumn) === false)
                                columns.push(nextColumn);
                        }
                        else
                            break;
                    }
                    while (index < this.model.attributes.columns.length - 1);
                }
            }
        }

        columns.sort((a, b) => a.dIndex - b.dIndex);

        let oldSelection = Object.assign({}, this.selection);
        let oldSubSelections = this._selectionList;

        let selections = [];
        let selection = { };
        for (let column of columns) {
            if (selection.colNo !== undefined) {
                if (column.dIndex === selection.right + 1) {
                    selection.right += 1;
                }
                else {
                    selections.push(selection);
                    selection = { };
                }
            }

            if (selection.colNo === undefined) {
                selection = {
                    rowNo: 0,
                    top: 0,
                    bottom: this.model.attributes.vRowCount - 1,
                    left: column.dIndex,
                    right: column.dIndex,
                    colNo: column.dIndex
                };

            }
        }

        return this._setSelections(selection, selections).then(() => {

            return new Promise((resolve, reject) => {

                keyboardJS.setContext('');

                let cb = (result) => {
                    keyboardJS.setContext('spreadsheet');
                    if (result)
                        resolve();
                    else
                        reject();
                };

                if (columns.length === 1) {
                    let column = columns[0];
                    dialogs.confirm('Delete column \'' + column.name + '\' ?', cb);
                }
                else {
                    dialogs.confirm('Delete ' + columns.length + ' columns?', cb);
                }
            });

        }).then(() => {
            let ids = [];
            for (let column of columns)
                ids.push(column.id);

            return this.model.deleteColumns(ids);

        }).then(() => {
            return this._setSelections(oldSelection, oldSubSelections);
        }).then(undefined, (error) => {
            if (error)
                console.log(error);
            return this._setSelections(oldSelection, oldSubSelections);
        });

    },
    _deleteRows() {

        let rows = this._currentSelectionToRowIndices();
        rows.sort((a, b) => a - b);

        let oldSelection = Object.assign({}, this.selection);
        let oldSubSelections = this._selectionList;

        let selections = [];
        let selection = { };
        for (let r of rows) {
            if (selection.rowNo !== undefined) {
                if (r === selection.bottom + 1) {
                    selection.bottom += 1;
                }
                else {
                    selections.push(selection);
                    selection = { };
                }
            }

            if (selection.rowNo === undefined) {
                selection = {
                    rowNo: r,
                    top: r,
                    bottom: r,
                    left: 0,
                    right: this.model.attributes.vColumnCount - 1,
                    colNo: 0
                };

            }
        }

        return this._setSelections(selection, selections).then(() => {

            return new Promise((resolve, reject) => {

                keyboardJS.setContext('');

                let cb = (result) => {
                    keyboardJS.setContext('spreadsheet');
                    if (result)
                        resolve();
                    else
                        reject();
                };

                if (rows.length === 1)
                    dialogs.confirm('Delete row ' + (rows[0]+1) + '?', cb);
                else
                    dialogs.confirm('Delete ' + rows.length + ' rows?', cb);
            });

        }).then(() => {

            return this.model.deleteRows(rows);

        }).then(() => {

            this._updateViewRange();
            this._refreshRHCells(this.viewport);
            this.model.readCells(this.viewport);

            return this._setSelections(oldSelection, oldSubSelections);

        }).then(undefined, (error) => {
            if (error)
                console.log(error);
            return this._setSelections(oldSelection, oldSubSelections);
        });
    },
    _insertColumn(properties, right) {
        let index = this.selection.colNo;
        if (right)
            index += 1;
        properties.index = index;
        return this.model.insertColumn(properties, true);
    },
    _columnsInserted(event, ignoreSelection) {
        let aNewFilterInserted = false;
        let indices = $.extend(true, {}, event.indices);

        if (event.ids.length === 0)
            return;

        let filterList = (list, exclude) => { return list.filter((i) => ! exclude.includes(i)); };

        let ids = event.ids.slice();
        ids.sort((a, b) => indices[a].dIndex - indices[b].dIndex);

        for (let id of ids) {
            let dIndex = indices[id].dIndex;
            let index = indices[id].index;

            if (dIndex >= this._lefts.length) {
                // append columns to end of data set
                let column = this.model.getColumn(index);
                if (column.columnType === 'filter')
                    aNewFilterInserted = true;
                if (column.hidden)
                    continue;
                this._addColumnToView(column);
            }
            else {

                let widthIncrease = 0;
                let nInserted = 0;

                let column = this.model.getColumn(index);
                if (column.columnType === 'filter')
                    aNewFilterInserted = true;

                if (column.hidden === false) {
                    let dIndex = column.dIndex;

                    let left = this._lefts[dIndex];
                    let html = this._createHeaderHTML(dIndex, left);

                    let $after = $(this.$headers[column.dIndex]);
                    let $header = $(html);
                    $header.insertBefore($after);
                    this.$headers.splice(column.dIndex, 0, $header);

                    this._addResizeListeners($header);

                    $after = $(this.$columns[column.dIndex]);
                    let $column = $('<div data-fmlaok="' + (this._isColumnOk(column) ? '1' : '0') + '" data-active="' + (column.active ? '1' : '0') + '" data-columntype="' + column.columnType + '" data-datatype="' + column.dataType + '" data-measuretype="' + column.measureType + '" class="jmv-column jmv-column-' + column.id + '" style="left: ' + left + 'px ; width: ' + column.width + 'px ; "></div>');
                    $column.insertBefore($after);
                    this.$columns.splice(column.dIndex, 0, $column);

                    this._lefts.splice(column.dIndex, 0, this._lefts[column.dIndex]);
                    this._widths.splice(column.dIndex, 0, column.width);

                    widthIncrease += column.width;
                    nInserted++;

                    for (let i = column.dIndex + 1; i < this._lefts.length; i++) {
                        this._lefts[i] += column.width;
                        let $header = $(this.$headers[i]);
                        let $column = $(this.$columns[i]);
                        $header.attr('data-index', i);
                        $header.children().attr('data-index', i);
                        $header.css('left', '' + this._lefts[i] + 'px');
                        $column.css('left', '' + this._lefts[i] + 'px');
                    }
                }

                if (nInserted > 0) {

                    this._bodyWidth += widthIncrease;
                    this.$body.css('width', this._bodyWidth);

                    this._refreshSelection();

                    let insertedAt = dIndex;
                    let nWereVisible = this.viewport.right - this.viewport.left + 1;
                    let wereVisible = new Array(nWereVisible);

                    for (let i = 0; i < nWereVisible; i++) {
                        let index = this.viewport.left + i;
                        if (index >= insertedAt)
                            index += nInserted;
                        wereVisible[i] = index;
                    }

                    let viewRange = this._getViewRange();

                    let nowVisible = [ ];
                    for (let i = 0; i < this._lefts.length; i++) {
                        let colLeft = this._lefts[i];
                        let colRight = colLeft + this._widths[i];
                        if (colLeft > viewRange.right)
                            break;
                        if (colLeft > viewRange.left && colLeft < viewRange.right)
                            nowVisible.push(i);
                        else if (colRight > viewRange.left && colRight < viewRange.right)
                            nowVisible.push(i);
                    }

                    let needsPopulation = filterList(nowVisible, wereVisible);
                    let needsClear = filterList(wereVisible, nowVisible);

                    for (let i of needsPopulation) {
                        let index = this.model.indexFromDisplayIndex(i);
                        let column = this.model.attributes.columns[index];
                        let $column = this.$columns[i];
                        for (let rowNo = this.viewport.top; rowNo <= this.viewport.bottom; rowNo++) {
                            let top   = rowNo * this._rowHeight;
                            let $cell = this._createCell(top, this._rowHeight, rowNo, column.dIndex);
                            $column.append($cell);
                        }
                    }

                    for (let i of needsClear)
                        this.$columns[i].empty();

                    this.viewport.left = nowVisible[0];
                    this.viewport.right = nowVisible[nowVisible.length - 1];
                    this.model.attributes.viewport = Object.assign({}, this.viewport);

                    this.$el.find(".highlighted").removeClass('highlighted');

                    this._updateViewRange();

                    if (aNewFilterInserted === false && needsPopulation.length > 0) {
                        this.model.readCells({
                            left: needsPopulation[0],
                            right: needsPopulation[needsPopulation.length - 1],
                            top: this.viewport.top,
                            bottom: this.viewport.bottom,
                        });
                    }
                }
            }
        }

        if (aNewFilterInserted)
            this.model.readCells(this.viewport);
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
    _appendColumn(columnType) {

        let rowNo = this.selection.rowNo;
        let colNo = this.model.visibleRealColumnCount();
        let column = this.model.getColumn(colNo, true);

        Promise.resolve().then(() => {

            let args;
            if (columnType === 'data')
                args = { name: '', columnType: 'data', measureType: 'nominal' };
            else if (columnType === 'computed')
                args = { name: '', columnType: 'computed', measureType: 'continuous' };
            else if (columnType === 'recoded')
                args = { name: '', columnType: 'recoded', measureType: 'nominal' };
            else
                args = { name: '', columnType: 'none', measureType: 'nominal' };

            return this.model.changeColumn(column.id, args);

        }).then(() => {

            return this._setSelection(rowNo, colNo);

        }).then(() => {

            let selRight = this._lefts[colNo] + this._widths[colNo];
            let scrollX = this.$container.scrollLeft();
            let containerRight = scrollX + (this.$container.width() - TableView.getScrollbarWidth());
            if (selRight > containerRight)
                this.$container.scrollLeft(scrollX + selRight - containerRight);

        }).catch((error) => {
            console.log(error);
            throw error;
        });
    },
    _enableDisableActions() {

        let selection = this.selection;

        if (selection === null)
            return;

        let dataSetBounds = {
            left: 0,
            right: this.model.visibleRealColumnCount() - 1,
            top: 0,
            bottom: this.model.attributes.rowCount - 1 };

        let column = this.model.getColumn(selection.colNo, true);

        ActionHub.get('delRow').set('enabled', selection.top <= dataSetBounds.bottom);
        ActionHub.get('delVar').set('enabled', selection.left <= dataSetBounds.right);
        ActionHub.get('insertVar').set('enabled', selection.right <= dataSetBounds.right && column.columnType !== 'filter');
        ActionHub.get('insertComputed').set('enabled', selection.right <= dataSetBounds.right && column.columnType !== 'filter');
        ActionHub.get('insertRecoded').set('enabled',  selection.right <= dataSetBounds.right && column.columnType !== 'filter');
        ActionHub.get('insertRow').set('enabled', selection.top === selection.bottom && selection.rowNo <= dataSetBounds.bottom);
        ActionHub.get('cut').set('enabled', column.columnType !== 'filter');
        ActionHub.get('paste').set('enabled', column.columnType !== 'filter');
        ActionHub.get('compute').set('enabled', column.columnType !== 'filter');
        ActionHub.get('transform').set('enabled', column.columnType !== 'filter');
    },
    _toggleFilterEditor() {
        let editingId = this.model.get('editingVar');
        let startId = editingId;
        if (startId === null)
            startId = [this.model.getColumn(this.selection.colNo, true).id];

        let column = this.model.getColumnById(startId[0]);
        if (column.columnType !== 'filter') {
            column = this.model.getColumn(0);
            startId = [column.id];
        }

        let isFilter = column.columnType === 'filter';
        if (editingId === null || isFilter === false || startId[0] !== editingId[0]) {
            if (isFilter)
                this.model.set('editingVar', [column.id]);
            else
                this.model.insertColumn({
                    index: 0,
                    columnType: 'filter',
                    hidden: this.model.get('filtersVisible') === false
                }).then(() => this.model.set('editingVar', [this.model.getColumn(0).id]));
        }
        else
            this.model.set('editingVar', null);
    },
    _findFirstVisibleColumn(index) {
        if (index === undefined)
            index = 0;
        let column = this.model.getColumn(index);
        while (column.hidden) {
            index += 1;
            column = this.model.getColumn(index);
        }
        return column;
    },
    _toggleVariableEditor() {
        let editingIds = this.model.get('editingVar');
        let editingColumn = null;
        if (editingIds !== null)
            editingColumn = this.model.getColumnById(editingIds[0]);

        if (editingIds === null || (editingColumn.columnType === 'filter' && editingColumn.hidden)) {
            let startIndex = this.model.indexFromDisplayIndex(this.selection.colNo);
            let column = this._findFirstVisibleColumn(startIndex);
            this.model.set('editingVar', [column.id]);
        }
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
                    text: csvifyCells(cells.cells),
                    html: htmlifyCells(cells.cells),
                });
                this.$selection.addClass('copying');
                setTimeout(() => this.$selection.removeClass('copying'), 200);
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
                range.colFocus = range.left;
                range.rowFocus = range.top;
                this._setSelections(range);

                this.$selection.addClass('copying');
                setTimeout(() => this.$selection.removeClass('copying'), 200);

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

        this.$el.addClass('resizing');

        // forcing a reflow
        this.$el[0].offsetHeight; // jshint ignore:line

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

        if (colNo <= this.selection.left) {
            let x = this._lefts[this.selection.colNo];
            let y = this.selection.rowNo * this._rowHeight;
            let width = this._widths[this.selection.colNo];
            let height = this._rowHeight;

            this.$selection.css({ left: x, top: y, width: width, height: height });
            this.$selectionColumnHighlight.css({ left: x, width: width, height: height });
        }

        this._bodyWidth += x;
        this.$body.css('width',  this._bodyWidth);

        this.$el.removeClass('resizing');

        this._resizeHandler();
    },
    _updateCells() {

        let colOffset = this.model.get('viewport').left;
        let rowOffset = this.model.get('viewport').top;
        let cells = this.model.get('cells');
        let filtered = this.model.get('filtered');

        for (let colNo = 0; colNo < cells.length; colNo++) {

            let column = cells[colNo];
            let $column = $(this.$columns[colOffset + colNo]);
            let $cells  = $column.children();

            let columnInfo = this.model.getColumn(colOffset + colNo, true);
            let dps = columnInfo.dps;
            let isFC = columnInfo.columnType === 'filter';

            for (let rowNo = 0; rowNo < column.length; rowNo++) {
                let $cell = $($cells[rowNo]);
                let content = this._rawValueToDisplay(column[rowNo], columnInfo);
                let filt = filtered[rowNo];

                this._updateCell($cell, content, dps, filt, isFC);
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
        let filtered = this.model.get('filtered');

        for (let colNo = 0; colNo < nCols; colNo++) {

            let column = cells[colOffset + colNo];
            let $column = $(this.$columns[range.left + colNo]);
            let $cells  = $column.children();

            let columnInfo = this.model.getColumn(range.left + colNo, true);
            let dps = columnInfo.dps;
            let isFC = columnInfo.columnType === 'filter';
            if (columnInfo.measureType !== 'continuous')
                dps = 0;

            for (let rowNo = 0; rowNo < nRows; rowNo++) {

                let $cell = $($cells[rowOffset + rowNo]);
                let content = this._rawValueToDisplay(column[rowOffset + rowNo], columnInfo);
                let filt = filtered[rowOffset + rowNo];

                this._updateCell($cell, content, dps, filt, isFC);
            }
        }
    },
    _rawValueToDisplay(raw, columnInfo) {
        if (columnInfo.measureType !== 'continuous') {
            for (let level of columnInfo.levels) {
                if (raw === level.value) {
                    return level.label;
                }
            }
        }

        return raw;
    },
    _updateCell($cell, content, dps, filtered, isFC = false) {

        let type;
        let asNumber = Number(content);

        if (content === null || content === '') {
            content = '';
            type = '';
        }
        else if (isFC) {
            if (content === 1 || content === '1' || content === 'true')
                content = '<div class="true"></div>';
            else
                content = '<div class="false"></div>';
            type = 'bool';
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

        if (type === 'bool')
            $cell.html(content);
        else
            $cell.text(content);

        $cell.attr('data-type', type);
        $cell.attr('data-filtered', (filtered ? '1' : '0'));
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
        if (rightColumn == columnCount - 1) // last column
            oRight = Infinity;
        else
            oRight = this._lefts[rightColumn] + this.model.getColumn(rightColumn, true).width;

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

        let column = this.model.getColumn(colNo, true);

        let html = '';

        html += '<div data-fmlaok="' + (this._isColumnOk(column) ? '1' : '0') + '" data-active="' + (column.active ? '1' : '0') + '" data-id="' + column.id + '" data-index="' + column.dIndex + '" data-columntype="' + column.columnType + '" data-datatype="' + column.dataType + '" data-measuretype="' + column.measureType + '" class="jmv-column-header jmv-column-header-' + column.id + '" style="left: ' + left + 'px ; width: ' + column.width + 'px ; height: ' + this._rowHeight + 'px">';
        html +=     '<div class="jmv-column-header-icon"></div>';
        html +=     '<div class="jmv-column-header-label">' + column.name + '</div>';
        html +=     '<div class="jmv-column-header-resizer" data-index="' + column.dIndex + '" draggable="true"></div>';
        html +=     '<div class="jmv-column-header-colour"></div>';
        html +=     '<div class="sub-selection-bar"></div>';
        html += '</div>';

        return html;
    },
    _createCell(top, height, rowNo, colNo) {

        let $cell = $('<div ' +
            ' class="jmv-column-cell"' +
            ' data-row="' + rowNo + '"' +
            ' data-col="' + colNo + '"' +
            ' style="top : ' + top + 'px ; height : ' + height + 'px ; line-height:' + (height-3) + 'px;">' +
            '</div>');

        return $cell;
    },
    _createRHCellHTML(top, height, content, rowNo) {

        let highlighted = '';
        if (this.selection && this.selection.rowNo === rowNo)
            highlighted = ' highlighted';

        let virtual = '';
        if (rowNo >= this.model.attributes.rowCount)
            virtual = ' virtual';

        let $cell = $('<div class="jmv-row-header-cell' + highlighted + virtual + '" style="top : ' + top + 'px ; height : ' + height + 'px; line-height:' + (height-3) + 'px;">' + content + '<div class="sub-selection-bar"></div></div>');

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

        let nDigits = Math.floor(Math.log(v.bottom) / Math.log(10)) + 1;
        if (this._rowHeaderDigits !== nDigits) {
            let newWidth = nDigits * this._rowHeaderWidthM + this._rowHeaderWidthB;
            let deltaWidth = newWidth - this._rowHeaderWidth;
            this._rowHeaderWidth = newWidth;
            this._rowHeaderDigits = nDigits;

            // group all dom queries together before dom changes
            // reduce reflow triggers
            let leftCol = this.$selectionColumnHighlight.position().left;
            let leftSel = this.$selection.position().left;

            // now dom changes
            this.$rhColumn.css('width', this._rowHeaderWidth);
            this.$topLeftCell.css('width', this._rowHeaderWidth);

            this.$selectionColumnHighlight.css('left', leftCol + deltaWidth);
            this.$selectionRowHighlight.css('width', this._rowHeaderWidth);
            this.$selection.css('left', leftSel + deltaWidth);

            let $selections = this.$body.find('.jmv-table-cell-secondary-selected');
            for (let i = 0; i < $selections.length; i++) {
                let $selection = $($selections[i]);
                leftSel = $selection.position().left;
                $selection.css('left', leftSel + deltaWidth);
            }

            this._lefts = this._lefts.map(x => x += deltaWidth);
            for (let i = 0; i < this._lefts.length; i++) {
                let $column = this.$columns[i];
                let $header = this.$headers[i];
                let left = this._lefts[i];
                $column.css('left', left);
                $header.css('left', left);
            }
        }

    },
    refreshCells(oldViewport, newViewport) {

        let o = oldViewport;
        let n = newViewport;


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

                let column  = this.model.getColumn(i, true);
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
                    let column = this.model.getColumn(colNo, true);
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
                    let column = this.model.getColumn(colNo, true);
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

                    let column  = this.model.getColumn(i, true);
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

                    let column  = this.model.getColumn(i, true);
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
