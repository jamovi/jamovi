//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const $ = require('jquery');
const ColourPalette = require('./editors/colourpalette');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');
const SilkyView = require('./view');
const Notify = require('./notification');
const ContextMenu = require('./contextmenu');
const Statusbar = require('./statusbar/statusbar');
const focusLoop = require('../common/focusloop');

const { s6e, contextMenuListener } = require('../common/utils');


const TableView = SilkyView.extend({
    className: 'tableview',
    initialize(options) {
        this._loaded = false;

        this.updateTouchMode();
        this._mouseUp = this._mouseUp.bind(this);
        this._resizeMoveHandler = this._resizeMoveHandler.bind(this);
        this._resizeUpHandler = this._resizeUpHandler.bind(this);

        $(window).on('resize', event => this._resizeHandler(event));
        this.$el.on('resized', event => this._resizeHandler(event));

        this.model.on('dataSetLoaded', this._dataSetLoaded, this);
        this.model.on('change:cells',  this._updateCells, this);
        this.model.on('cellsChanged', this._cellsChanged, this);
        this.model.on('rhChanged', this._rhChanged, this);
        this.model.on('rowsDeleted', event => this._rowsDeleted(event));
        this.model.on('rowsInserted', event => this._rowsInserted(event));
        this.model.on('refreshView', event => this.refreshView(event));
        this.model.on('columnsChanged', event => this._columnsChanged(event));
        this.model.on('columnsDeleted', event => this._columnsDeleted(event));
        this.model.on('columnsInserted', event => this._columnsInserted(event));
        this.model.on('columnsHidden', event => this._columnsDeleted(event));
        this.model.on('columnsVisible', event => this._columnsInserted(event));
        this.model.on('columnsActiveChanged', event => this._columnsActiveChanged(event));
        this.model.on('transformsChanged', event => this._transformsChanged(event));
        this.model.on('change:vRowCount', event => this._updateHeight());
        this.model.on('change:rowCount', event => this.statusbar.updateInfoLabel('rowCount', this.model.attributes.rowCount));
        this.model.on('change:editedCellCount', event => this.statusbar.updateInfoLabel('editedCells', this.model.attributes.editedCellCount));
        this.model.on('change:deletedRowCount', event => this.statusbar.updateInfoLabel('deletedRows', this.model.attributes.deletedRowCount));
        this.model.on('change:addedRowCount', event => this.statusbar.updateInfoLabel('addedRows', this.model.attributes.addedRowCount));
        this.model.on('change:rowCountExFiltered', event => this.statusbar.updateInfoLabel('filteredRows',  this.model.attributes.rowCount - this.model.attributes.rowCountExFiltered));
        this.model.on('change:filtersVisible', event => this._updateEyeButton());

        this._tabStart = { row: 0, col: 0 };
        this.viewport = null;
        this.viewOuterRange = { top: 0, bottom: -1, left: 0, right: -1 };

        this.$el.addClass('jmv-tableview');

        this.$el.html(`
            <div class="jmv-table-header">
                <div class="jmv-column-header place-holder" style="width: 110%">&nbsp;</div>
                <div class="jmv-table-header-background"></div>
                <div class="jmv-column-header select-all"></div>
                <div class="jmv-table-column-highlight"></div>
            </div>
            <div class="jmv-table-container">
                <div class="jmv-table-body">
                    <div class="jmv-column-row-header" style="left: 0 ;" aria-hidden="true");></div>
                    <div class="jmv-sub-selections"></div>
                    <div class="jmv-table-cell-selected">
                        <div class="selection-sizer top-left-sizer"></div>
                        <div class="selection-sizer bottom-right-sizer"></div>
                    </div>
                    <div class="jmv-table-row-highlight-wrapper"><div class="jmv-table-row-highlight"></div></div>
                </div>
            </div>`);

        this.$sizers = this.$el.find('.selection-sizer');
        this.$sizers.on('pointerdown', (event) => {
            if (event.target.classList.contains('bottom-right-sizer'))
                this._clickCoords = { rowNo: this.selection.top, colNo: this.selection.left };
            else
                this._clickCoords = { rowNo: this.selection.bottom, colNo: this.selection.right };

            this._isDragging = true;
            event.preventDefault();
        });

        this.statusbar = new Statusbar();
        this.$el.append(this.statusbar.$el);
        this.statusbar.addInfoLabel('editedCells', { label: _('Cells edited '), value: 0 });
        this.statusbar.addInfoLabel('addedRows', { label: _('Added'), value: 0 });
        this.statusbar.addInfoLabel('deletedRows', { label: _('Deleted'), value: 0 });
        this.statusbar.addInfoLabel('filteredRows', { label: _('Filtered'), value: 0 });
        this.statusbar.addInfoLabel('rowCount', { label: _('Row count'), value: 0 });
        this.statusbar.addInfoLabel('editStatus', { dock: 'left', value: _('Ready') });
        this.statusbar.addActionButton('editFilters', { dock: 'left' });
        this.statusbar.addActionButton('toggleFilterVisible', { dock: 'left' });
        this.statusbar.addInfoLabel('activeFilters', { dock: 'left', label: _('Filters'), value: 0 });

        this.$container = this.$el.find('.jmv-table-container');
        this.$header    = this.$el.find('.jmv-table-header');
        this.$body      = this.$container.find('.jmv-table-body');
        this.$rhColumn  = this.$body.find('.jmv-column-row-header');

        this.$topLeftCell = this.$el.find('.select-all');
        this.$topLeftCell.on('pointerdown', event => {
            this.selection.selectAll();
        });

        this.$selection = this.$body.find('.jmv-table-cell-selected');
        this.$selectionRowHighlight = this.$body.find('.jmv-table-row-highlight');
        this.$selectionRowHighlightWrapper = this.$body.find('.jmv-table-row-highlight-wrapper');
        this.$selectionColumnHighlight = this.$header.find('.jmv-table-column-highlight');

        this.$columns   = [ ];
        this.$headers   = [ ];

        this._bodyWidth = 0;

        this.$container.on('scroll', event => this._scrollHandler(event));

        let measureOne = this._createRHCell(0, 0, '', 0);
        measureOne.style.width = 'auto';
        this.$rhColumn[0].append(measureOne);

        let measureTwo = this._createRHCell(0, 0, '0', 1);
        measureTwo.style.width = 'auto';
        this.$rhColumn[0].append(measureTwo);

        this._rowHeaderDigits = 2;
        this._rowHeaderWidthB = measureOne.offsetWidth;
        this._rowHeaderWidthM = measureTwo.offsetWidth - this._rowHeaderWidthB;
        this._rowHeaderWidth = this._rowHeaderDigits * this._rowHeaderWidthM + this._rowHeaderWidthB;

        // read and store the row height
        // the -1 is so each cell underlaps the one above it by 1 pixel
        // this is so the cell at the bottom of each column has a border along
        // the bottom
        this._rowHeight = this.$header[0].offsetHeight - 1;

        this.$el.css('grid-template-rows', `${ this._rowHeight }px 1fr 22px`);

        this.$header.css('height', this._rowHeight);

        this.$rhColumn.css('width', this._rowHeaderWidth);
        this.$rhColumn.empty();

        this.$topLeftCell.css('height', this._rowHeight);
        this.$topLeftCell.css('width', this._rowHeaderWidth);

        this.controller = options.controller;
        this.controller.registerView('spreadsheet', this);
        this.selection = options.controller.selection;

        this.on('columnAppended', (colNo) => {
            let selRight = this._lefts[colNo] + this._widths[colNo];
            let scrollX = this.$container.scrollLeft();
            let containerRight = scrollX + (this.$container.width() - TableView.getScrollbarWidth());
            if (selRight > containerRight)
                this.$container.scrollLeft(scrollX + selRight - containerRight);
        });

        this.controller.on('copying', () => {
            this.$selection.addClass('copying');
            setTimeout(() => this.$selection.removeClass('copying'), 200);
        });

        this.selection.on('resolved', () => {
            this.$selection.removeClass('negative');
        });

        this.selection.on('selectionTypeChanged', (type) => {
            if (type === 'multi') {
                if (this.$selection) {
                    this.$selection.addClass('multi');
                    this._selectionTransitionActive = false;
                }
            }
            else {
                if (this._selectionTransitionActive === false) {
                    setTimeout(() => {
                        this.$selection.removeClass('multi');
                        this._selectionTransitionActive = true;
                    }, 0);
                }
            }
        });

        this.selection.on('subselectionChanged', () => {
            this._createSecondarySelections(this.selection.subSelections);
        });

        this.selection.on('selectionCleared', () => {
            if (this.$selection && this._selectionTransitionActive === false) {
                this.$selection.removeClass('multi');
                this._selectionTransitionActive = true;
            }
            this.$body.find('.jmv-table-cell-secondary-selected').remove();
        });

        this.selection.registerChangeEventHandler((oldSel, silent, ignoreTabStart) => {
            return this._setSelectedRange(this.selection, oldSel, ignoreTabStart);
        });

        this.selection.on('selectionAppended', (prevSel, subtract) => {
            if (this.$selection) {
                this.$selection.addClass('multi');
                this._selectionTransitionActive = false;
                if (subtract)
                    this.$selection.addClass('negative');
            }

            this._createSecondarySelections(prevSel, 0);
        });

        contextMenuListener(this.$body[0], event => {
            if (this._editing)
                return true;
            this._contextMenuPreparation(event);
            return this._bodyMenu(event);
        });
        contextMenuListener(this.$header[0], event => {
            this._contextMenuPreparation(event);
            return this._headerMenu(event);
        });

        this.$body.on('pointerdown', event => this._mouseDown(event));
        this.$header.on('pointerdown', event => this._mouseDown(event));
        this.$body.on('pointermove', event => this._mouseMove(event));

        this.$el.on('dblclick', event => this._dblClickHandler(event));

        this._active = true;

        keyboardJS.setContext('spreadsheet-editing');
        keyboardJS.bind('', event => this._editingKeyPress(event));
        keyboardJS.setContext('controller');

        this._edited = false;
        this._editing = false;
        this._modifyingCellContents = false;
        this._editNote = new Notify({ duration: 3000 });

        this.selection.clearSelectionList();
    },
    
    onEditingVarChanged(editingColumns) {
        if (this.selection !== null) {
            this._endEditing().then(() => {
                this.selection.createSelectionsFromColumns(this.selection.rowNo, editingColumns);
                this._updateScroll(this.selection);
            }, () => {});
        }
    },
    onViewControllerFocus() {
        setTimeout(() => {
            if (this.selection.rowNo !== undefined && this.selection.colNo !== undefined)
                this._scrollToPosition({ rowNo: this.selection.rowNo, colNo: this.selection.colNo });
        }, 100);

    },
    _updateEyeButton() {
        if (this.model.get('filtersVisible'))
            this.statusbar.$el.find('.jmv-statusbar-button[data-name=togglefiltervisible]').addClass('hide-filter-columns');
        else
            this.statusbar.$el.find('.jmv-statusbar-button[data-name=togglefiltervisible]').removeClass('hide-filter-columns');
    },
    _updateFilterInfo() {
        let count = this.model.filterCount(true);
        this.statusbar.updateInfoLabel('activeFilters', count);
        if (count === 0)
            this.statusbar.$el.find('.jmv-statusbar-button[data-name=editfilters]').addClass('gray');
        else
            this.statusbar.$el.find('.jmv-statusbar-button[data-name=editfilters]').removeClass('gray');
    },
    setActive(active) {
        this._active = active;
        if (this._active)
            keyboardJS.setContext('controller');
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
                $colour.attr('title', _('Transform: {name}', {name: transform.name}));
            }
            else {
                $colour.addClass('no-transform');
                $colour.css('background-color', '#acacac');
                $colour.attr('title', _('Transform: None'));
            }
        }
        else if (column.columnType === 'computed') {
            let $colour = $header.find('.jmv-column-header-colour');
            $colour.css('background-color', '#515151');
            $colour.attr('title', _('Computed variable'));
        }
    },
    _addColumnToView(column) {
        let width  = column.width;
        let left = this._bodyWidth;

        let html = this._createHeaderHTML(column.dIndex, left);

        let $header = $(html);
        this.$headers.push($header);

        this._addResizeListeners($header);

        let $column = $(
            `<div
                data-id="${ column.id }"
                data-datatype="${ column.dataType }"
                data-columntype="${ column.columnType }"
                data-measuretype="${ column.measureType }"
                data-fmlaok="${ this._isColumnOk(column) ? '1' : '0' }"
                data-active="${ column.active ? '1' : '0' }"
                class="jmv-column"
                style="
                    left: ${ left }px ;
                    width: ${ column.width }px ;
                "
            >
            </div>`);

        this.$columns.push($column);

        this._lefts[column.dIndex] = left;
        this._widths[column.dIndex] = width;
        this._bodyWidth += width;

        this.$body.css('width',  this._bodyWidth);

        this._updateColumnColour(column, $header, $column);

        this.controller.enableDisableActions();
    },
    _dataSetLoaded() {

        for (let header of this.$headers)
            header.remove();
        for (let column of this.$columns)
            column.remove();
        this.$rhColumn[0].innerHTML = '';

        this.$columns = [ ];
        this.$headers = [ ];

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

        this.viewport = null; // reset
        this._updateViewRange();

        this._loaded = true;
        this.selection.setSelection(0, 0);

        this.statusbar.updateInfoLabel('rowCount', this.model.attributes.rowCount);
        this.statusbar.updateInfoLabel('editedCells', this.model.attributes.editedCellCount);
        this.statusbar.updateInfoLabel('deletedRows', this.model.attributes.deletedRowCount);
        this.statusbar.updateInfoLabel('addedRows', this.model.attributes.addedRowCount);
        this.statusbar.updateInfoLabel('filteredRows', this.model.attributes.rowCount - this.model.attributes.rowCountExFiltered);
        this._updateFilterInfo();
        this._updateEyeButton();
    },
    _addResizeListeners($element) {
        this.$resizers = $element.find('.jmv-column-header-resizer');
        this.$resizers.on('pointerdown', event => {
            event.target.setPointerCapture(event.pointerId);

            event.target.addEventListener('pointerup', this._resizeUpHandler);
            event.target.addEventListener('pointercancel', this._resizeUpHandler);
            event.target.addEventListener('pointermove', this._resizeMoveHandler);

            let columnId = parseInt(event.target.parentNode.dataset.id);
            let column = this.model.getColumnById(columnId);
            this._resizingColumn = { $resizer: $(event.target), startPageX: event.pageX, column: column };
            event.stopPropagation();
        });

    },
    _resizeMoveHandler(event) {
        this._columnResizeHandler(event, this._resizingColumn);
    },
    _resizeUpHandler(event) {
        let column = this._resizingColumn.column;
        if (column.name !== '')  // not virtual
            this.model.changeColumn(column.id, { width: column.width });
        this._resizingColumn = null;

        event.target.removeEventListener('pointerup', this._resizeUpHandler);
        event.target.removeEventListener('pointercancel', this._resizeUpHandler);
        event.target.removeEventListener('pointermove', this._resizeMoveHandler);
    },
    _updateHeight() {
        let vRowCount = this.model.get('vRowCount');
        let totalHeight = vRowCount * this._rowHeight;
        this.$body.css('height', totalHeight);
    },
    _columnsActiveChanged(event) {
        this._updateFilterInfo();

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

        let indices = event.indices;

        if (event.ids.length === 0)
            return;

        this._updateFilterInfo();

        let ids = event.ids.slice();
        ids.sort((a,b) => indices[b].dIndex - indices[a].dIndex);

        let lowestIndex = -1;
        let totalWidthReduction = 0;
        for (let id of ids) {
            let dIndex = indices[id].dIndex;
            if (dIndex === -1)
                continue;

            this.$el.find('[data-id="' + id + '"]').remove();

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

        this.selection.refreshSelection();

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

                this._updateColumnColour(column, $header, $column);
                let ok = this._isColumnOk(column);

                $column.attr('data-fmlaok', ok ? '1' : '0');
                $header.attr('data-fmlaok', ok ? '1' : '0');
                let $icon = $header.find('.jmv-column-header-icon');
                if ( ! ok)
                    $icon.attr('title', _('Issue with formula'));
                else
                    $icon.removeAttr('title');
            }
        }
    },
    refreshView() {
        let viewport = this.viewport;
        if ( ! viewport)
            return;

        for (let colNo = viewport.left; colNo <= viewport.right; colNo++) {

            let column = this.model.getColumn(colNo - viewport.left, true);

            if (column.hidden)
                continue;

            let $header = $(this.$headers[column.dIndex]);
            let $column = $(this.$columns[column.dIndex]);

            let $cells  = $column.children();
            for (let rowNo = viewport.top; rowNo <= viewport.bottom; rowNo++) {
                let cell = $cells[rowNo - viewport.top];
                this.refreshCellColour(cell, column, rowNo);
            }

            $header.attr('data-measuretype', column.measureType);
            $header.attr('data-columntype', column.columnType);
            $header.attr('data-datatype', column.dataType);
            $column.attr('data-measuretype', column.measureType);

            this._updateColumnColour(column, $header, $column);
            let ok = this._isColumnOk(column);

            $column.attr('data-fmlaok', ok ? '1' : '0');
            $header.attr('data-fmlaok', ok ? '1' : '0');
            let $icon = $header.find('.jmv-column-header-icon');
            if ( ! ok)
                $icon.attr('title', _('Issue with formula'));
            else
                $icon.removeAttr('title');

            let $label = $header.find('.jmv-column-header-label');
            $label.text(column.name);
        }

        this.controller.enableDisableActions();
        this._updateViewRange();
        this.model.readCells(this.model.attributes.viewport);
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

            let viewport = this.viewport;
            let $cells  = $column.children();
            for (let rowNo = viewport.top; rowNo <= viewport.bottom; rowNo++) {
                let cell = $cells[rowNo - viewport.top];
                this.refreshCellColour(cell, column, rowNo);
            }

            if (changes.levelsChanged || changes.measureTypeChanged || changes.dataTypeChanged || changes.columnTypeChanged) {
                $header.attr('data-columntype', column.columnType);
                $header.attr('data-datatype', column.dataType);
                $header.attr('data-measuretype', column.measureType);

                $column.attr('data-columntype', column.columnType);
                $column.attr('data-datatype', column.dataType);
                $column.attr('data-measuretype', column.measureType);
            }

            this._updateColumnColour(column, $header, $column);
            let ok = this._isColumnOk(column);

            $column.attr('data-fmlaok', ok ? '1' : '0');
            $header.attr('data-fmlaok', ok ? '1' : '0');
            let $icon = $header.find('.jmv-column-header-icon');
            if ( ! ok)
                $icon.attr('title', _('Issue with formula'));
            else
                $icon.removeAttr('title');

            if (changes.nameChanged) {
                let $label = $header.find('.jmv-column-header-label');
                $label.text(column.name);
            }
        }

        this.controller.enableDisableActions();
        this._updateViewRange();

        if (aFilterChanged)
            this.model.readCells(this.model.attributes.viewport);
    },
    _getPos(x, y) {

        let rowNo, colNo, vx, vy, tiltX, tiltY;
        let rowHeader = false;
        let colHeader = false;

        let bounds = this.$el[0].getBoundingClientRect();
        let bodyBounds = this.$body[0].getBoundingClientRect();

        if (y - bounds.top >= 0 && y - bounds.top < this._rowHeight) // on column header
            colHeader = true;
        vy = y - bodyBounds.top;
        rowNo = Math.floor(vy / this._rowHeight);
        tiltY = (vy / this._rowHeight) - rowNo < 0.5 ? 'top' : 'bottom';
        rowNo = rowNo < 0 ? 0 : rowNo;
        rowNo = rowNo > this.model.attributes.vRowCount - 1 ? this.model.attributes.vRowCount - 1 : rowNo;

        if (x - bounds.left >= 0 && x - bounds.left < this._rowHeaderWidth) // on row header
            rowHeader = true;
        vx = x - bodyBounds.left;
        for (colNo = 0; colNo < this._lefts.length; colNo++) {
            if (vx < this._lefts[colNo]) {
                tiltX = (vx - this._lefts[colNo - 1] < this._lefts[colNo] - vx) ? 'left' : 'right';
                break;
            }
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

        return { rowNo: rowNo, colNo: colNo, x: vx, y: vy, onHeader: onHeader, tiltX: tiltX, tiltY: tiltY };
    },
    _contextMenuPreparation(event) {
        this._contextMenuOpened = true;

        let pos = this._getPos(event.clientX, event.clientY);
        let rowNo = pos.rowNo;
        let colNo = pos.colNo;

        if (! this.selection.cellInSelection(rowNo, colNo))
            this.selection.clearSelectionList();
        
        event.preventDefault();
    },
    _headerMenu(event) {
        let colNo = this.selection === null ? 0 : this.selection.colNo;
        let column = this.model.getColumn(colNo, true);
        if (column.columnType === 'filter')
            ContextMenu.showFilterMenu(event.clientX, event.clientY);
        else
            ContextMenu.showVariableMenu(event.clientX, event.clientY, this.selection.left !== this.selection.right);
        event.stopPropagation();
        return false;
    },
    _bodyMenu(event) {
        let colNo = this.selection === null ? 0 : this.selection.colNo;
        let column = this.model.getColumn(colNo, true);
        if (column.columnType === 'filter')
            ContextMenu.showFilterRowMenu(event.clientX, event.clientY);
        else {
            if (this.selection.top === 0 && this.selection.bottom === this.model.visibleRowCount() - 1)
                ContextMenu.showVariableMenu(event.clientX, event.clientY, this.selection.left !== this.selection.right);
            else
                ContextMenu.showDataRowMenu(event.clientX, event.clientY, this.selection.top !== this.selection.bottom);
        }

        return false;
    },

    updateTouchMode() {
        let pointerType = window.matchMedia('(pointer: coarse)');
        this.touchMode = pointerType.matches;
        pointerType.addEventListener("change", this.updateTouchMode.bind(this), { once: true });
    },

    _mouseDown(event) {

        this.$body[0].setPointerCapture(event.pointerId);

        this.$body[0].addEventListener('pointerup', this._mouseUp);
        this.$body[0].addEventListener('pointercancel', this._mouseUp);

        if (this.touchMode) {
            if ( ! this.dblTapTimer) {
                this.tapCount = 1;
                this.dblTapTimer = setTimeout(async () => {
                    this.dblTapTimer = null;
                }, 300);
            }
            else
                this.tapCount += 1;

            return Promise.resolve();
        }

        if (event.button === 2) {
            let pos = this._getPos(event.clientX, event.clientY);
            let rowNo = pos.rowNo;
            let colNo = pos.colNo;
            if ((pos.onHeader === 'none' && this.selection.cellInSelection(rowNo, colNo)) ||
                 (pos.onHeader === 'columns' && this.selection.isFullColumnSelectionClick(colNo)) ||
                 (pos.onHeader === 'rows' && this.selection.isFullRowSelectionClick(rowNo))) {
                     return Promise.resolve();
                 }
        }

        return this._selectionMade(event);
    },
    async _selectionMade(event) {
        let pos = this._getPos(event.clientX, event.clientY);
        let rowNo = pos.rowNo;
        let colNo = pos.colNo;

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
            if (this.selection.cellInSelection(rowNo, colNo))
                this.selection.addNewSelectionToList(range, 'negative');
            else
                this.selection.addNewSelectionToList(range);
        }
        else
            this.selection.clearSelectionList();

        this._draggingType = pos.onHeader === 'none' ? 'both' : pos.onHeader;

        if (this._editing &&
            rowNo === this.selection.rowNo &&
            colNo === this.selection.colNo)
                return Promise.resolve();

        return this._endEditing().then(() => {

            let _isClicking = false;
            if (pos.onHeader === 'none') {

                this._isDragging = true;

                if (event.shiftKey) {
                    this._clickCoords = this.selection.clone();
                    this._mouseMove(event);
                }
                else {
                    _isClicking = true;
                    this._clickCoords = pos;
                }

            }
            else if (pos.onHeader === 'columns') {

                let left = colNo;
                let right = colNo;
                this._isDragging = true;
                _isClicking = true;
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
                    bottom: this.model.visibleRowCount() - 1,
                    colFocus: pos.colNo,
                    rowFocus: pos.rowNo };
            }
            else if (pos.onHeader === 'rows') {

                let top = rowNo;
                let bot = rowNo;
                this._isDragging = true;
                _isClicking = true;
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

            if (_isClicking) {
                if (this._draggingType === 'both') {
                    this.selection.setSelection(this._clickCoords.rowNo, this._clickCoords.colNo, false);
                }
                else if (this._draggingType === 'rows' || this._draggingType === 'columns') {
                    this.selection.setSelections(this._clickRange, null);
                }
            }

            this.selection.resolveSelectionList(this.$body);

        }, () => {});
    },
    async _mouseUp(event) {
        this.$body[0].removeEventListener('pointerup', this._mouseUp);
        this.$body[0].removeEventListener('pointercancel', this._mouseUp);

        this.$body[0].releasePointerCapture(event.pointerId);
        if (this.controller.focusedOn !== this)
            return;

        this.$selection.removeClass('dragging');
        if (this._applySelectionOnUp) {
            this._applyDragToSelection(event);
            this._applySelectionOnUp = false;
        }

        if (event.type !== 'pointercancel' && ! this._contextMenuOpened) {
            if (this.touchMode && ! this._isDragging) {
                switch(this.tapCount) {
                    case 1:
                        await this._selectionMade(event);
                        break;
                    case 2:
                        this._dblClickHandler(event);
                        event.preventDefault();
                        break;
                }
            }
        }
        else
            this.tapCount = 0;

        this._contextMenuOpened = false;

        this._isDragging = false;
    },
    _applyDragToSelection(event) {
        let pos = this._getPos(event.clientX, event.clientY);

        let dragBoth = this._draggingType === 'both';
        let dragRows = dragBoth || this._draggingType === 'rows';
        let dragCols = dragBoth || this._draggingType === 'columns';


        if ( ! this._applySelectionOnUp && this._lastPos) {
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
        if (this._applySelectionOnUp) {
            if (this._clickCoords.colNo < colNo && pos.tiltX === 'left')
                colNo -= 1;
            else if (this._clickCoords.colNo > colNo && pos.tiltX === 'right')
                colNo += 1;

            if (this._clickCoords.rowNo < rowNo && pos.tiltY === 'top')
                rowNo -= 1;
            else if (this._clickCoords.rowNo > rowNo && pos.tiltY === 'bottom')
                rowNo += 1;
        }

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

        this.selection.setSelections(range, this.selection.subSelections);
    },

    _mouseMove(event) {

        if (this.controller.focusedOn !== this)
            return;

        if ( ! this._isDragging)
            return;

        this.$selection.addClass('dragging');

        if (this.touchMode) {
            this._applySelectionOnUp = true;
            let rect = this.$selection[0].getBoundingClientRect();
            let anchor = {
                top: (this._clickCoords.rowNo ) * this._rowHeight,
                left: this._lefts[this._clickCoords.colNo],
                right: this._lefts[this._clickCoords.colNo] + this._widths[this._clickCoords.colNo],
                bottom: (this._clickCoords.rowNo + 1) * this._rowHeight,
                height: this._rowHeight,
                width: this._widths[this._clickCoords.colNo]
            };
            let fixedX = 'right';
            if (event.offsetX > anchor.left)
                fixedX = 'left';

            let fixedY = 'bottom';
            if (event.offsetY > anchor.top)
                fixedY = 'top';

            let newRect = {
                top:    fixedY == 'top' ? anchor.top : event.offsetY,
                bottom: fixedY == 'bottom' ? anchor.bottom : event.offsetY,
                left:   fixedX == 'left' ? anchor.left : event.offsetX,
                right:  fixedX == 'right' ? anchor.right : event.offsetX,
            };

            if (fixedY == 'bottom' && newRect.bottom - newRect.top < anchor.height)
                newRect.top = newRect.bottom - anchor.height;
            if (fixedY == 'top' && newRect.bottom - newRect.top < anchor.height)
                newRect.bottom = newRect.top + anchor.height;
            if (fixedX == 'left' && newRect.right - newRect.left < anchor.width)
                newRect.right = newRect.left + anchor.width;
            if (fixedX == 'right' && newRect.right - newRect.left < anchor.width)
                newRect.left = newRect.right - anchor.width;

                if (this.selection.isFullRowSelection())
                    this.$selection.css({ top: newRect.top, height: newRect.bottom - newRect.top });
                else if (this.selection.isFullColumnSelection())
                    this.$selection.css({ left: newRect.left, width: newRect.right - newRect.left });
                else
                    this.$selection.css({ top: newRect.top, height: newRect.bottom - newRect.top, left: newRect.left, width: newRect.right - newRect.left });

        }
        else
            this._applyDragToSelection(event);
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
    _scrollToPosition(pos) {
        let range = { left: pos.colNo, right: pos.colNo, colNo: pos.colNo, top: pos.rowNo, bottom: pos.rowNo, rowNo: pos.rowNo };

        this._updateScroll(range);
    },
    _updateScroll(targetRange) {

        let range = targetRange === undefined ? this.selection : targetRange;

        if ( ! this._lefts)
            return;

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
    _applyHeaderHighlight(range, isSubSelection) {
        // add column header highlight
        for (let colNo = range.left; colNo <= range.right; colNo++) {
            let $header = $(this.$headers[colNo]);
            $header.addClass('highlighted');
            if (isSubSelection)
                $header.addClass('is-sub-selection');
        }

        // add row header highlight
        if (this.viewport !== null) {
            for (let rowNo = range.top; rowNo <= range.bottom; rowNo++) {
                if (rowNo <= this.viewport.bottom && rowNo >= this.viewport.top) {
                    let vRowNo = rowNo - this.viewport.top;
                    let $cell = this.$rhColumn.children(':nth-child(' + (vRowNo + 1) + ')');
                    $cell.addClass('highlighted');
                    if (isSubSelection)
                        $cell.addClass('is-sub-selection');
                }
            }
        }
    },
    _updateHeaderHighlight() {

        for (let $header of this.$headers)
            $($header).removeClass('highlighted');

        this.$el.find('.jmv-row-header-cell.highlighted').removeClass('highlighted is-sub-selection');

        this._applyHeaderHighlight(this.selection, false);
        for (let range of this.selection.subSelections) {
            this._applyHeaderHighlight(range, true);
        }
    },
    _pasteEventHandler(event) {
        const text = event.clipboardData.getData('text/plain');
        const html = event.clipboardData.getData('text/html');
        let content = { text: text, html: html };
        this.controller.pasteClipboardToSelection(this, content);
        event.preventDefault();
    },
    _inputEventHandler(event) {
        if (this._editing)
            this._edited = true;
    },
    _keypressHandler(event) {
        if (event.which === 13)
            event.preventDefault();
    },
    _setFocusCell(select, populate) {

        if (this._editing)
            return false;

        if ( ! this._focusCell) {
            this._focusCell = this._createCell(0, 0, -1, -1, true);
            this._focusCell.setAttribute('role', 'gridcell');
            this._focusCell.id = 'focusCell';
            this._focusCell.classList.add('temp-focus-cell');
            let pasteEventHandle = this._pasteEventHandler.bind(this);
            let inputEventHandle = this._inputEventHandler.bind(this);
            let keypressEventHandle = this._keypressHandler.bind(this);
            this._focusCell.addEventListener('paste', pasteEventHandle);
            this._focusCell.addEventListener('input', inputEventHandle);
            this._focusCell.addEventListener('keydown', keypressEventHandle);
            this._focusCell.addEventListener('beforeinput', (event) => {
                if (this._delayedEditing && this._editing === false) {
                    if (event.data.length > 1) {
                        let content = { text: event.data, html: '' };
                        this.controller.pasteClipboardToSelection(this, content);
                    }
                    else
                        this._beginEditing();
                }
                this._delayedEditing = false;
            });
            this._focusCell.addEventListener('blur', async (event) => {
                if (this._editing) {
                    this._focusValue = this._focusCell.value;
                    await this._endEditing();
                }
            });

            this._focusCell.addEventListener('focus', (event) => {
                this._focusCell.select();
            });

            /*this._focusGrid = document.createElement('div');
            this._focusGrid.setAttribute('role', 'grid');*/

            this._focusRow = document.createElement('div');
            this._focusRow.setAttribute('role', 'row');

            this._focusRow.append(this._focusCell);

            this.$body.append(this._focusRow);
            focusLoop.setDefaultFocusControl(this._focusCell);
        }

        let sel = this.selection;

        let selColumn = this.model.getColumn(sel.colNo, true);
        this._focusCell.setAttribute('aria-describedby', `column-${ selColumn.id } row-${ sel.rowNo }`);
        this._focusRow.setAttribute('aria-owns', `row-${ sel.rowNo } focusCell`);

        let x = this._lefts[sel.colNo];
        let y = sel.rowNo * this._rowHeight;
        let width = this._widths[sel.colNo];
        let height = this._rowHeight;

        this._focusCell.style.top = `${y+1}px`;
        this._focusCell.style.left = `${x}px`;
        this._focusCell.style.width = `${width-1}px`;
        this._focusCell.style.height = `${height-2}px`;
        this._focusCell.style.lineHeight = `${height-3}px`;

        let value = this.model.valueAt(sel.rowNo, sel.colNo);
        if (value) {
            for (let levelInfo of this.currentColumn.levels) {
                if (value === levelInfo.value) {
                    value = levelInfo.label;
                    break;
                }
            }
        }
        else
            value = '';

        this._updateCell(this._focusCell, value, populate, null, false, false, false);

        if (focusLoop.focusMode === 'default') {
            if (document.activeElement !== this._focusCell)
                this._focusCell.focus({preventScroll: true});

        }
    },
    _updateSizers() {
        let fullRow = this.$selection.hasClass('full-row');
        let fullCol = this.$selection.hasClass('full-col');
        this.$selection.removeClass('all-selected');
        if (fullCol && fullRow) {
            this.$selection.addClass('all-selected');
            return;
        }

        let $sizerLeft = this.$selection.find('.top-left-sizer');
        let $sizerRight= this.$selection.find('.bottom-right-sizer');
        if (fullRow) {

            let width = this.$container.width();
            let leftScroll = this.$container.scrollLeft();
            let selectionWidth = this.$selection.width() - leftScroll;
            if (selectionWidth < width)
                width = selectionWidth;
            $sizerLeft.css('left', `${leftScroll + (width/2) - ($sizerLeft.width()/2)}px` );
            $sizerRight.css('left', `${leftScroll + (width/2) - ($sizerRight.width()/2)}px` );
        }
        else {
            $sizerLeft.css('left', '' );
            $sizerRight.css('left', '' );
        }

        if (fullCol) {
            let height = this.$container.height();
            let topScroll = this.$container.scrollTop();
            let selectionHeight = this.$selection.height() - topScroll;
            if (selectionHeight < height)
                height = selectionHeight;
            $sizerLeft.css('top', `${topScroll + (height/2) - ($sizerLeft.height()/2)}px` );
            $sizerRight.css('top', `${topScroll + (height/2) - ($sizerRight.height()/2)}px` );
        }
        else {
            $sizerLeft.css('top', '' );
            $sizerRight.css('top', '' );
        }
    },
    _setSelectedRange(range, oldSel, ignoreTabStart) {

        if (this._loaded === false)
            return Promise.resolve();

        this.$selection.removeClass('full-row');
        this.$selection.removeClass('full-col');
        if (this.selection.isFullRowSelection())
            this.$selection.addClass('full-row');
        if (this.selection.isFullColumnSelection())
            this.$selection.addClass('full-col');

        let rowNo = range.rowNo;
        let colNo = range.colNo;

        if ( ! ignoreTabStart)
            this._tabStart = { row: range.rowNo, col: range.colNo };

        this.currentColumn = this.model.getColumn(colNo, true);

        this._setFocusCell(true, true);

        this._updateHeaderHighlight();

        // move selection cell to new location
        let nRows = range.bottom - range.top + 1;
        let x = this._lefts[range.left];
        let y = range.top * this._rowHeight;
        let width = this._lefts[range.right] + this._widths[range.right] - x;
        let height = this._rowHeight * nRows;

        if (this.touchMode && (this.$selection[0].offsetWidth != width - 1 || this.$selection[0].offsetHeight != height)) {
            this.$selection.addClass('resizing');
            setTimeout(() => { //remove the class incase its not removed but the transitionend
                this.$selection.removeClass('resizing');
            }, 300);
        }

        this.$selection.css({ left: x, top: y, width: width - 1, height: height });

        this._abortEditing();

        if (this.selection.rowFocus !== undefined && this.selection.colFocus !== undefined)
            this._scrollToPosition({ rowNo: this.selection.rowFocus, colNo: this.selection.colFocus });

        // slide row/column highlight *lines* into position
        this.$selectionRowHighlightWrapper.css({ width: this._rowHeaderWidth });
        this.$selectionRowHighlight.css({ top: y, height: height });
        this.$selectionColumnHighlight.css({ left: x, width: width, height: this._rowHeight });

        if (oldSel.left === range.left &&
            oldSel.right === range.right &&
            oldSel.top === range.top &&
            oldSel.bottom === range.bottom)
                return Promise.resolve();

        this.$selection.removeClass('not-editable');
        if (this.selection.subSelections.length === 0) {
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
                //When in multi-select mode there are no css transitions so the selection promise is immediately resolved.
                if (this._selectionTransitionActive === false) {
                    this._selectionTransitioning = false;
                    if (this.touchMode) {
                        this.$selection.removeClass('resizing');
                        this._updateSizers();
                    }
                    resolve();
                }
                else {
                    this.$selection.one('transitionend', () => {
                        this._selectionTransitioning = false;
                        if (this.touchMode) {
                            this.$selection.removeClass('resizing');
                            this._updateSizers();
                        }
                        resolve();
                    });
                }
            });
        }

        return this._selectionTransitionPromise;
    },
    _isColumnEditable(column) {
        return (column.columnType === 'data' || column.columnType === 'none');
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

            let err = {
                title: _('Column is not editable'),
                message: _('{columnType} columns may not be edited.', { columnType: this.model.columnTypeLabel(column.columnType) }),
                type: 'error' };
            this._notifyEditProblem(err);

            return;  // you can't edit computed columns
        }

        this._setFocusCell(ch === undefined, ch === undefined);

        this._editing = true;
        keyboardJS.setContext('spreadsheet-editing');
        this.statusbar.updateInfoLabel('editStatus', _('Edit'));

        this._focusCell.classList.add('editing');
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

            this._focusCell.value = value;
            this._focusCell.select();
            /*let selection = window.getSelection();
            let range = document.createRange();
            range.selectNodeContents(this._focusCell);
            selection.removeAllRanges();
            selection.addRange(range);*/
        }

        this._modifyingCellContents = true;

        if (ch !== undefined)
            this._edited = true;
    },
    _applyEdit() {
        if ( ! this._edited)
            return Promise.resolve();

        return Promise.resolve().then(() => {

            let value = '';
            if (this._focusCell)
                value = this._focusCell.value.trim();
            else
                value = this._focusValue.trim();

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
                            message: _('Could not assign data'),
                            cause: _('Cannot assign non-numeric value to column \'{columnName}\'', {columnName:this.currentColumn.name}),
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

            return this.selection.applyValuesToSelection([viewport], value);
        });
    },
    _endEditing() {
        if (this._editing === false)
            return Promise.resolve();

        let finaliseEdit = () => {
            this._editing = false;
            this.statusbar.updateInfoLabel('editStatus', _('Ready'));
            this._edited = false;
            this._modifyingCellContents = false;
            keyboardJS.setContext('controller');
            this.$selection.removeClass('editing');
            if (this._focusCell) {
                this._focusCell.classList.remove('editing');
                this._focusCell.value = '';
            }
        };

        return Promise.resolve().then(() => {
            return this._applyEdit();
        }).then(() => {
            finaliseEdit();
        }).catch(err => {
            this._notifyEditProblem({
                title: err.message,
                message: err.cause,
                type: 'error',
            });

            if (this._focusCell) {
                this._focusCell.select();
                /*let selection = window.getSelection();
                let range = document.createRange();
                range.selectNodeContents(this._focusCell);
                selection.removeAllRanges();
                selection.addRange(range);*/
            }
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
        this.statusbar.updateInfoLabel('editStatus', _('Edit'));
        this._modifyingCellContents = false;
        keyboardJS.setContext('controller');
        this._edited = false;
        this.$selection.removeClass('editing');
        if (this._focusCell)
            this._focusCell.classList.remove('editing');
    },
    _editingKeyPress(event) {

        switch(event.key) {
            case 'ArrowLeft':
                if (this._modifyingCellContents === false) {
                    this._endEditing().then(() => {
                        this.selection.moveCursor('left');
                    }, () => {});
                }
                break;
            case 'ArrowRight':
                if (this._modifyingCellContents === false) {
                    this._endEditing().then(() => {
                        this.selection.moveCursor('right');
                    }, () => {});
                }
                break;
            case 'ArrowUp':
                if (this._modifyingCellContents === false) {
                    this._endEditing().then(() => {
                        this.selection.moveCursor('up');
                    }, () => {});
                }
                break;
            case 'ArrowDown':
                if (this._modifyingCellContents === false) {
                    this._endEditing().then(() => {
                        this.selection.moveCursor('down');
                    }, () => {});
                }
                break;
            case 'Enter':
                this._endEditing().then(() => {
                    this.selection.setSelection(this._tabStart.row, this._tabStart.col);
                    if (event.shiftKey)
                        this.selection.moveCursor('up');
                    else
                        this.selection.moveCursor('down');
                }, () => {});
                break;
            case 'Escape':
                this._abortEditing();
                break;
            case 'Tab':
                this._endEditing().then(() => {
                    if (event.shiftKey)
                        this.selection.moveCursor('left', false, true);
                    else
                        this.selection.moveCursor('right', false, true);
                }, () => {});
                event.preventDefault();
                break;
            case 'Delete':
            case 'Backspace':
                this._edited = true;
                break;
            default:
                if (event.metaKey === false && event.altKey === false && event.ctrlKey === false && event.key.length === 1)
                    this._edited = true;
                break;
        }
        event.stopPropagation();
    },
    _notEditingKeyPress(event) {

        //touch screens don't have keycodes
        if (event.keyCode === 0 || event.keyCode === 229) {
            this._delayedEditing = true;
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            if (event.key.toLowerCase() === 'c') {
                this.controller.copySelectionToClipboard();
                event.preventDefault();
            }
            else if (event.key.toLowerCase() === 'x') {
                this.controller.cutSelectionToClipboard();
                event.preventDefault();
            }
            else if (event.shiftKey && event.key === ' ') {
                this.selection.selectAll();
            }
            else if (event.key === ' ') {
                let newSelection = this.selection.clone();
                newSelection.left = 0;
                newSelection.right = this.model.visibleRealColumnCount() - 1;
                this.selection.setSelections(newSelection);
            }

        }
        else if (event.shiftKey) {
            if (event.key === ' ') {
                let newSelection = this.selection.clone();
                newSelection.top = 0;
                newSelection.bottom = this.model.visibleRowCount() - 1;
                this.selection.setSelections(newSelection);
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
                    let newSelection = this.selection.clone();
                    let topCells = Math.min(count1, newSelection.rowNo - newSelection.top);
                    newSelection.top += topCells;
                    newSelection.bottom += (count1 - topCells);
                    if (newSelection.bottom > this.model.visibleRowCount() - 1)
                        newSelection.bottom = this.model.visibleRowCount() - 1;

                    if (count1 - topCells > 0)
                        newSelection.rowFocus = newSelection.bottom;
                    else
                        newSelection.rowFocus = newSelection.top;

                    this.selection.setSelections(newSelection);
                }
                else {
                    let rowNo = this.selection.rowNo + count1;
                    if (rowNo > this.model.visibleRowCount() - 1)
                        rowNo = this.model.visibleRowCount() - 1;
                    this.selection.setSelection(rowNo, this.selection.colNo);
                }
                event.preventDefault();
                break;
            case 'PageUp':
                let bounds = this.$el[0].getBoundingClientRect();
                let count = Math.floor(bounds.height / this._rowHeight) - 1;
                if (event.shiftKey) {
                    let newSelection = this.selection.clone();
                    let bottomCells = Math.min(count, newSelection.bottom - newSelection.rowNo);
                    newSelection.bottom -= bottomCells;
                    newSelection.top -= (count - bottomCells);
                    if (newSelection.top < 0)
                        newSelection.top = 0;

                    if (count - bottomCells > 0)
                        newSelection.rowFocus = newSelection.top;
                    else
                        newSelection.rowFocus = newSelection.bottom;
                    this.selection.setSelections(newSelection);
                }
                else {
                    let rowNo = this.selection.rowNo - count;
                    if (rowNo < 0)
                        rowNo = 0;
                    this.selection.setSelection(rowNo, this.selection.colNo);
                }
                event.preventDefault();
                break;
            case 'ArrowLeft':
                if (event.metaKey || event.ctrlKey) {
                    if (event.shiftKey) {
                        let newSelection = this.selection.clone();
                        newSelection.left = 0;
                        if (newSelection.right !== this.model.visibleRealColumnCount() - 1)
                            newSelection.colFocus = 0;
                        this.selection.setSelections(newSelection);
                    }
                    else
                        this.selection.setSelection(this.selection.rowNo, 0);
                }
                else
                    this.selection.moveCursor('left', event.shiftKey);
                event.preventDefault();
                break;
            case 'Tab':
                if (event.shiftKey)
                    this.selection.moveCursor('left', false, true);
                else
                    this.selection.moveCursor('right', false, true);
                event.preventDefault();
                break;
            case 'ArrowRight':
                if (event.metaKey || event.ctrlKey) {
                    if (event.shiftKey) {
                        let newSelection = this.selection.clone();
                        newSelection.right = this.model.visibleRealColumnCount() - 1;
                        if (newSelection.left !== 0)
                            newSelection.colFocus = this.model.visibleRealColumnCount() - 1;
                        this.selection.setSelections(newSelection);
                    }
                    else
                        this.selection.setSelection(this.selection.rowNo, this.model.visibleRealColumnCount() - 1);
                }
                else
                    this.selection.moveCursor('right', event.shiftKey);
                event.preventDefault();
                break;
            case 'ArrowUp':
                if (event.metaKey || event.ctrlKey) {
                    if (event.shiftKey) {
                        let newSelection = this.selection.clone();
                        newSelection.top = 0;
                        if (newSelection.bottom !== this.model.visibleRowCount()-1)
                            newSelection.rowFocus = 0;
                        this.selection.setSelections(newSelection);
                    }
                    else
                        this.selection.setSelection(0, this.selection.colNo);
                }
                else
                    this.selection.moveCursor('up', event.shiftKey);
                event.preventDefault();
                break;
            case 'ArrowDown':
                if (event.metaKey || event.ctrlKey) {
                    if (event.shiftKey) {
                        let newSelection = this.selection.clone();
                        newSelection.bottom = this.model.visibleRowCount()-1;
                        if (newSelection.top !== 0)
                            newSelection.rowFocus = this.model.visibleRowCount()-1;
                        this.selection.setSelections(newSelection);
                    }
                    else
                        this.selection.setSelection(this.model.visibleRowCount()-1, this.selection.colNo);
                }
                else
                    this.selection.moveCursor('down', event.shiftKey);
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
                    this.selection.setSelection(this._tabStart.row, this._tabStart.col);
                    if (event.shiftKey)
                        this.selection.moveCursor('up');
                    else
                        this.selection.moveCursor('down');
                }
                event.preventDefault();
                break;
            case 'Delete':
            case 'Backspace':
                this.selection.deleteCellContents();
                break;
            case 'F2':
                this._beginEditing();
                break;
            case ' ':
                event.preventDefault();
                break;
            default:
                if (event.key.length === 1 || event.key === 'Process')
                    this._beginEditing(event.key);
                break;
        }
    },
    _rowsDeleted(event) { },
    _rowsInserted(event) {

    },
    _columnsInserted(event, ignoreSelection) {
        this._updateFilterInfo();

        let aNewFilterInserted = false;
        let indices = event.indices;

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
                    let $column = $(`
                        <div
                            data-id="${ column.id }"
                            data-columntype="${ column.columnType }"
                            data-datatype="${ column.dataType }"
                            data-measuretype="${ column.measureType }"
                            data-fmlaok="${ this._isColumnOk(column) ? '1' : '0' }"
                            data-active="${ column.active ? '1' : '0' }"
                            class="jmv-column"
                            style="
                                left: ${ left }px ;
                                width: ${ column.width }px ;
                            "
                        >
                        </div>`);
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
                        let $header = this.$headers[i];
                        let $column = this.$columns[i];
                        for (let rowNo = this.viewport.top; rowNo <= this.viewport.bottom; rowNo++) {
                            let top   = rowNo * this._rowHeight;
                            let cell = this._createCell(top, this._rowHeight, rowNo, column.dIndex);
                            this.refreshCellColour(cell, column, rowNo);
                            $column.append(cell);
                        }
                        this.$header.append($header);
                        this.$body.append($column);
                    }

                    for (let i of needsClear) {
                        let $column = this.$columns[i];
                        $column.detach();
                        $column.empty();
                    }

                    this.selection.refreshSelection();

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
    _columnResizeHandler(event, data) {
        if (event.clientX === 0 && event.clientY === 0)
            return;

        let column = data.column;
        let $target = data.$resizer;
        let $parent = $target.parent();
        let x = event.pageX - data.startPageX; // event.offsetX - 6;
        data.startPageX = event.pageX;

        if (x === 0)
            return;

        let colNo = parseInt($target.attr('data-index'));

        let newWidth = this._widths[colNo] + x;
        if (newWidth < 32) {
            newWidth = 32;
            x = newWidth - this._widths[colNo];
        }

        column.width = Math.floor(newWidth);

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

        let range = this.selection;
        let nRows = range.bottom - range.top + 1;
        let left = this._lefts[range.left];
        let top = range.top * this._rowHeight;
        let width = this._lefts[range.right] + this._widths[range.right] - left;
        let height = this._rowHeight * nRows;

        this.$selection.css({ left: left, top: top, width: width - 1, height: height });
        this.$selectionColumnHighlight.css({ left: left, width: width/*, height: height*/ });

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
                let cell = $cells[rowNo];
                let cellInfo = column[rowNo];
                let content = this._rawValueToDisplay(cellInfo.value, columnInfo);
                let filt = filtered[rowNo];
                let missing = cellInfo.missing;

                this._updateCell(cell, content, true, dps, filt, missing, isFC);
            }
        }

    },
    _isCellEdited(column, rowNo) {
        for (let range of column.editedCellRanges) {
            if (rowNo >= range.start && rowNo <= range.end)
                return true;
        }
        return false;
    },
    _rhChanged(changed) {

        if (changed.length === 0)
            return;

        let rowNums = this.model.attributes.rowNums;
        let rowHeaders = this.$rhColumn[0].children;
        if (rowHeaders.length === 0)
            return;

        for (let index of changed) {
            let currentNum = rowNums[index];
            let aboveNum = rowNums[index - 1];
            let current = rowHeaders[index];

            current.textContent = (currentNum + 1);

            if (currentNum >= this.model.attributes.rowCount)
                current.classList.add('virtual');
            else
                current.classList.remove('virtual');

            if (Number.isFinite(aboveNum)) {
                if (currentNum !== aboveNum + 1)
                    current.classList.add('split-above');
                else
                    current.classList.remove('split-above');
            }
        }

        // update what was previously top row header
        // when the row numbers are received, we don't know if the top row
        // needs a 'split-above' because the row number above isn't known yet
        // the following checks if we *should* have added it previously, and
        // adds it if necessary
        let index = changed[changed.length - 1];
        let currentNum = rowNums[index];
        let belowNum = rowNums[index + 1];

        if (Number.isFinite(belowNum)) {
            let below = rowHeaders[index + 1];
            if (currentNum !== belowNum - 1)
                below.classList.add('split-above');
            else
                below.classList.remove('split-above');
        }

        // adds a split to the very first visible row in the data set
        // (if necessary)
        if (changed[0] === 0 && this.viewport.top === 0) {
            if (rowNums[0] !== 0)
                rowHeaders[0].classList.add('split-above');
            else
                rowHeaders[0].classList.remove('split-above');
        }

        // widen row headers if necessary
        let lastNum = rowNums[rowNums.length - 1];
        if (lastNum !== null) {

            let nDigits = Math.floor(Math.log10(lastNum + 1)) + 1;
            if (nDigits < 2)
                nDigits = 2;

            if (this._rowHeaderDigits !== nDigits) {

                let newWidth = nDigits * this._rowHeaderWidthM + this._rowHeaderWidthB;
                let deltaWidth = newWidth - this._rowHeaderWidth;
                this._rowHeaderWidth = newWidth;
                this._rowHeaderDigits = nDigits;

                let leftCol = this.$selectionColumnHighlight.position().left;
                let leftSel = this.$selection.position().left;

                this.$rhColumn.css('width', this._rowHeaderWidth);
                this.$topLeftCell.css('width', this._rowHeaderWidth);

                this.$selectionColumnHighlight.css('left', leftCol + deltaWidth);
                this.$selectionRowHighlightWrapper.css('width', this._rowHeaderWidth);
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
        }
    },
    _cellsChanged(changedCells) {

        let cells = this.model.get('cells');
        let filtered = this.model.get('filtered');
        let viewportLeft = this.model.get('viewport').left;

        for (let changed of changedCells) {
            let cellList = cells[changed.colIndex];
            if (! cellList || cellList.length < changed.rowIndex + 1)
                continue;

            let dIndex = viewportLeft + changed.colIndex;
            let columnInfo = this.model.getColumn(dIndex, true);
            let dps = columnInfo.dps;
            let isFC = columnInfo.columnType === 'filter';
            if (columnInfo.measureType !== 'continuous')
                dps = 0;

            let $column = $(this.$columns[dIndex]);
            let cell = $column[0].children[changed.rowIndex];
            let cellInfo = cellList[changed.rowIndex];
            if (cell && cellInfo) {
                let content = this._rawValueToDisplay(cellInfo.value, columnInfo);
                let filt = filtered[changed.rowIndex];
                let missing = cellInfo.missing;

                this._updateCell(cell, content, true, dps, filt, missing, isFC);
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
    _updateCell(cell, content, populate, dps, filtered, missing, isFC = false) {

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
            if (dps !== null)
                content = asNumber.toFixed(dps);
            type = 'number';
        }
        else if (Number.isNaN(asNumber)) {
            type = 'string';
        }
        else {
            type = 'number';
        }

        if (cell.type === 'textarea') {
            if ( ! populate)
                content = '';
            cell.value = content;
        }
        else if (type === 'bool')
            cell.innerHTML = content;
        else {
            if ( ! populate)
                content = '';
            cell.textContent = content;
        }

        cell.dataset.type = type;
        cell.dataset.filtered = (filtered ? '1' : '0');
        cell.dataset.missing = (missing ? '1' : '0');
    },
    _scrollHandler(event) {

        if (this.scrollTimer)
            clearTimeout(this.scrollTimer);
        else
            this.$selection.addClass('scrolling');

        this.scrollTimer = setTimeout(() => {
            this._updateSizers();
            this.$selection.removeClass('scrolling');
            this.scrollTimer = null;
        }, 200);

        if (this.model.get('hasDataSet') === false)
            return;

        let currentViewRange = this._getViewRange();
        if (this._encloses(this.viewOuterRange, currentViewRange) === false)
            this._updateViewRange();

        let left = this.$container.scrollLeft();
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
    },
    sortedIndex(array, value) {
        let i = 0;
        for (i = 0; i < array.length; i++) {
            if (array[i] >= value)
                return i;
        }
        return array.length;
    },
    _updateViewRange() {

        let v = this._getViewRange();

        let topRow = Math.floor(v.top / this._rowHeight) - 1;
        let botRow = Math.ceil(v.bottom / this._rowHeight) - 1;

        let rowCount = this.model.get('vRowCount');
        let columnCount = this.model.get('vColumnCount');


        let leftColumn  = this.sortedIndex(this._lefts, v.left) - 1;
        let rightColumn = this.sortedIndex(this._lefts, v.right) - 1;

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

        return `
            <div
                data-fmlaok="${ this._isColumnOk(column) ? '1' : '0' }"
                data-active="${ column.active ? '1' : '0' }"
                data-index="${ column.dIndex }"
                data-columntype="${ column.columnType }"
                data-datatype="${ column.dataType }"
                data-measuretype="${ column.measureType }"
                data-id="${ column.id }"
                class="jmv-column-header"
                style="
                    left: ${ left }px ;
                    width: ${ column.width }px ;
                    height: ${ this._rowHeight }px ;
                "
            >
                <div class="jmv-column-header-icon"></div>
                <div class="jmv-column-header-label" id="column-${column.id}" role="columnheader">${ s6e(column.name) }</div>
                <div class="jmv-column-header-resizer" data-index="${ column.dIndex }"></div>
                <div class="jmv-column-header-colour"></div>
                <div class="sub-selection-bar"></div>
            </div>`;
    },
    _createCell(top, height, rowNo, colNo, isInput) {

        let cell = document.createElement(isInput ? 'input' : 'div');
        //cell.setAttribute('tabindex', -1);
        /*if (rowNo !== -1) {
            this._focusCell.setAttribute('role', 'gridcell');
            this._focusCell.setAttribute('aria-colindex', colNo + 1);
            this._focusCell.setAttribute('aria-rowindex', rowNo + 1);
        }*/
        cell.classList.add('jmv-column-cell');
        cell.dataset.row = rowNo;
        cell.style.top = `${ top }px`;
        cell.style.height = `${ height }px`;
        cell.style.lineHeight = `${ height-3 }px`;

        return cell;
    },
    _createRHCell(top, height, content, rowNo) {

        let highlighted = '';
        if (this.selection && this.selection.rowNo === rowNo)
            highlighted = ' highlighted';

        let cell = document.createElement('div');
        cell.classList.add('jmv-row-header-cell');
        cell.setAttribute('role', 'rowheader');
        cell.id = 'row-' + rowNo;
        if (highlighted != '')
            cell.classList.add('highlighted');
        cell.style.top = `${ top }px`;
        cell.style.height = `${ height + 1}px`;
        cell.style.lineHeight = `${ height - 3 }px`;

        let bar = document.createElement('div');
        bar.classList.add('sub-selection-bar');

        cell.innerText = content;
        cell.appendChild(bar);

        return cell;
    },
    refreshCellColour(cell, columnInfo, rowNo) {
        if ( ! cell)
            return;
        if (this._isCellEdited(columnInfo, rowNo))
            cell.classList.add('cell-edited');
        else
            cell.classList.remove('cell-edited');
    },
    refreshCells(oldViewport, newViewport) {

        let o = oldViewport;
        let n = newViewport;

        if (o === null || this._overlaps(o, n) === false) { // entirely new cells

            if (o !== null) {  // clear old cells

                for (let i = o.left; i <= o.right; i++) {
                    let $column = $(this.$columns[i]);
                    let $header = $(this.$headers[i]);
                    $header.detach();
                    $column.detach();
                    $column.empty();
                }
                this.$rhColumn.empty();
            }

            let nRows = n.bottom - n.top + 1;

            for (let j = 0; j < nRows; j++) {
                let rowNo = n.top + j;
                let top   = rowNo * this._rowHeight;
                let cell = this._createRHCell(top, this._rowHeight, '', rowNo);
                this.$rhColumn.append(cell);
            }

            for (let i = n.left; i <= n.right; i++) {

                let column  = this.model.getColumn(i, true);
                let $column = $(this.$columns[i]);
                let $header = $(this.$headers[i]);

                for (let j = 0; j < nRows; j++) {
                    let rowNo = n.top + j;
                    let top   = rowNo * this._rowHeight;
                    let cell = this._createCell(top, this._rowHeight, rowNo, i);
                    this.refreshCellColour(cell, column, rowNo);
                    $column.append(cell);
                }

                this.$header.append($header);
                this.$body.append($column);
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
                    let $header = $(this.$headers[colNo]);

                    for (let j = 0; j < nRows; j++) {
                        let rowNo = n.top + j;
                        let top = this._rowHeight * rowNo;
                        let cell = this._createCell(top, this._rowHeight, rowNo, colNo);
                        this.refreshCellColour(cell, column, rowNo);
                        $column.append(cell);
                    }

                    this.$header.append($header);
                    this.$body.append($column);
                }
            }
            else if (n.right < o.right) {  // delete columns from the right
                let nCols = o.right - n.right;
                let count = this.$columns.length;
                for (let i = 0; i < nCols; i++) {
                    let $column = $(this.$columns[o.right - i]);
                    let $header = $(this.$headers[o.right - i]);
                    $header.detach();
                    $column.detach();
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
                    let $header = $(this.$headers[colNo]);

                    for (let j = 0; j < nRows; j++) {
                        let rowNo = n.top + j;
                        let top = this._rowHeight * rowNo;
                        let cell = this._createCell(top, this._rowHeight, rowNo, colNo);
                        this.refreshCellColour(cell, column, rowNo);
                        $column.append(cell);
                    }

                    this.$header.append($header);
                    this.$body.append($column);
                }
            }
            else if (n.left > o.left) {  // delete columns from the left
                let nCols = n.left - o.left;
                let count = this.$columns.length;
                for (let i = 0; i < nCols; i++) {
                    let $column = $(this.$columns[o.left + i]);
                    let $header = $(this.$headers[o.left + i]);
                    $header.detach();
                    $column.detach();
                    $column.empty();
                }
            }

            if (n.bottom > o.bottom) {

                let nRows = n.bottom - o.bottom;  // to add rows to the bottom

                let left  = Math.max(o.left,  n.left);
                let right = Math.min(o.right, n.right);

                for (let j = 0; j < nRows; j++) {
                    let rowNo = o.bottom + j + 1;
                    let top   = rowNo * this._rowHeight;
                    let cell = this._createRHCell(top, this._rowHeight, '', rowNo);
                    this.$rhColumn.append(cell);
                }

                for (let i = left; i <= right; i++) {

                    let column  = this.model.getColumn(i, true);
                    let $column = $(this.$columns[i]);

                    for (let j = 0; j < nRows; j++) {
                        let rowNo = o.bottom + j + 1;
                        let top   = rowNo * this._rowHeight;
                        let cell = this._createCell(top, this._rowHeight, rowNo, i);
                        this.refreshCellColour(cell, column, rowNo);
                        $column.append(cell);
                    }
                }
            }

            if (n.bottom < o.bottom) {

                let nRows = o.bottom - n.bottom;  // to remove from the bottom

                let left  = Math.max(o.left,  n.left);
                let right = Math.min(o.right, n.right);

                let rhCells = [...this.$rhColumn[0].children];
                let count = rhCells.length;
                for (let j = 0; j < nRows; j++)
                    rhCells[count - j - 1].remove();

                for (let i = left; i <= right; i++) {

                    let column = this.$columns[i][0];
                    let cells = [...column.children];
                    let count = cells.length;

                    for (let j = 0; j < nRows; j++)
                        cells[count - j - 1].remove();
                }
            }

            if (n.top < o.top) {

                let nRows = o.top - n.top;  // add to top

                let left  = Math.max(o.left,  n.left);
                let right = Math.min(o.right, n.right);

                for (let j = 0; j < nRows; j++) {
                    let rowNo = o.top - j - 1;
                    let top   = rowNo * this._rowHeight;
                    let cell = this._createRHCell(top, this._rowHeight, '', rowNo);
                    this.$rhColumn.prepend(cell);
                }

                for (let i = left; i <= right; i++) {

                    let column  = this.model.getColumn(i, true);
                    let $column = $(this.$columns[i]);

                    for (let j = 0; j < nRows; j++) {
                        let rowNo = o.top - j - 1;
                        let top   = rowNo * this._rowHeight;
                        let cell = this._createCell(top, this._rowHeight, rowNo, i);
                        this.refreshCellColour(cell, column, rowNo);
                        $column.prepend(cell);
                    }
                }
            }

            if (n.top > o.top) {  // remove from the top

                let nRows = n.top - o.top;

                let left  = Math.max(o.left,  n.left);
                let right = Math.min(o.right, n.right);

                let rhCells = [...this.$rhColumn[0].children];
                for (let j = 0; j < nRows; j++)
                    rhCells[j].remove();

                for (let c = left; c <= right; c++) {
                    let column = this.$columns[c][0];
                    let cells = [...column.children];
                    for (let r = 0; r < nRows; r++)
                        cells[r].remove();
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
