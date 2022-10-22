//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const $ = require('jquery');
const ColourPalette = require('./editors/colourpalette');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');
const dialogs = require('dialogs')({cancel:false});

const SilkyView = require('./view');
const Notify = require('./notification');
const { csvifyCells, htmlifyCells } = require('../common/utils/formatio');
const ActionHub = require('./actionhub');
const ContextMenu = require('./contextmenu');
const Statusbar = require('./statusbar/statusbar');
const { contextMenuListener } = require('../common/utils');

const VariablesView = SilkyView.extend({
    className: 'variablesview',
    initialize(options) {
        this.selectionModel = null;

        this.rows = [ ];
        this.selectedRows = [];
        this.internalBluring = false;
        this.internalFocus = false;

        this.model.on('dataSetLoaded', this._dataSetLoaded, this);
        this.model.on('columnsChanged', event => this._columnsChanged(event));
        this.model.on('columnsDeleted', event => this._columnsDeleted(event));
        this.model.on('columnsInserted', event => this._columnsInserted(event));
        this.model.on('columnsHidden', event => this._columnsDeleted(event));
        this.model.on('columnsVisible', event => this._columnsInserted(event));
        this.model.on('columnsActiveChanged', event => this._columnsActiveChanged(event));
        this.model.on('transformsChanged', event => this._transformsChanged(event));
        this.model.on('change:filtersVisible', event => this._updateEyeButton());

        this.$el.addClass('jmv-variablesview');

        this.$el.html(`
            <div class="jmv-variables-searchbox">
                <div class="image"></div>
                <input class="search" placeholder="${_('Search variables')}"></input>
            </div>
            <div class="jmv-variables-container">
                <div class="jmv-variables-body">

                </div>
            </div>`);

        this.statusbar = new Statusbar();
        this.$el.append(this.statusbar.$el);
        this.statusbar.addInfoLabel('editStatus', { dock: 'left', value: _('Ready') });
        this.statusbar.addActionButton('editFilters', { dock: 'left' });
        this.statusbar.addActionButton('toggleFilterVisible', { dock: 'left' });
        this.statusbar.addInfoLabel('activeFilters', { dock: 'left', label: _('Filters'), value: 0 });
        this.statusbar.addInfoLabel('columnCount', { dock: 'right', label: _('Variables'), value: 0 });
        this.statusbar.addInfoLabel('selectedCount', { dock: 'right', label: _('Selected'), value: 0 });

        this.$body      = this.$el.find('.jmv-variables-body');
        this.$container = this.$el.find('.jmv-variables-container');

        let $newVariable = $('<div class="add-new-variable"><span class="mif-plus"></span></div>');
        this.$container.append(this._createCell($newVariable, 0, 1, 'new-variable', false, 4));

        $newVariable.on('click', (event) => {
            ContextMenu.showAppendVariableMenu($newVariable.offset().left + $newVariable.outerWidth(false) + 10, $newVariable.offset().top + $newVariable.outerHeight(false) - 10, 'right');
        });

        this.$search      = this.$el.find('.search');

        this.$search.on('input', (event) => {
            this._updateList();
            if (this._topIndex !== -1)
                this.selection.setSelection(0, this._topIndex, true);
        });

        this.$search.on('focus', () => {
            keyboardJS.pause('variable-search');
            this.$search.select();
        });

        this.$search.on('blur', () => {
            keyboardJS.resume('variable-search');
        });

        this.$body.on('mouseleave', (event) => {
            this.$body.find('.cell.hovering').removeClass('hovering');
        });

        contextMenuListener(this.$el[0], (event) => {
            let element = document.elementFromPoint(event.clientX, event.clientY);
            let $view = $(element).closest('.jmv-variables-container');
            if ($view.length > 0) {
                let colNo = this.selection === null ? 0 : this.selection.getColumnStart();
                let column = this.model.getColumn(colNo);
                if (column !== null && column.columnType === 'filter')
                    ContextMenu.showFilterMenu(event.clientX, event.clientY, true);
                else
                    ContextMenu.showVariableMenu(event.clientX, event.clientY, this.selection.getColumnStart() !== this.selection.getColumnEnd(), true);
                event.preventDefault();
            }
        });

        this.controller = options.controller;
        this.controller.registerView('variables', this);
        this.selection = options.controller.selection;
        this.selectionIncludesHidden = true;

        this.selection.registerChangeEventHandler((oldSel, silent, ignoreTabStart) => {
            if (this.rows.length === 0)
                return;

            this._clearRowSelections();

            let selectedCount = this._updateRowSelections();
            this.statusbar.updateInfoLabel('selectedCount', selectedCount);

            if (this.selectedRows.length > 0) {
                let firstSelectedRow = this.selectedRows[0];
                let focusCell = firstSelectedRow.$elements[0];
                if (focusCell)
                    focusCell.scrollIntoView({block: 'nearest', inline: 'center', behavior: 'smooth'});
            }
        });

        $(document).on('mousemove', event => this._mouseMove(event));
        $(document).on('mouseup', event => this._mouseUp(event));
    },
    _selectRow(row, editable) {
        this.selectedRows.push(row);

        let $row = row.$elements;
        $row.addClass('selected');
        row.$select.prop('checked', true);

        if (editable && ! row.editableTimer) {
            row.editableTimer = setTimeout(function () {
                row.$editableTexts.attr('contenteditable', true);
                if (row.nameReadOnly === false)
                    row.$name.attr('placeholder', _('Enter name'));
                row.$description.attr('placeholder', _('Enter description'));
                row.editableTimer = null;
            }, 10);
        }
    },
    _clearRowSelections() {
        for (let row of this.selectedRows) {
            let $row = row.$elements;
            row.$editableTexts.removeAttr('contenteditable');
            row.$name.removeAttr('placeholder');
            row.$description.removeAttr('placeholder');
            row.$select.prop('checked', false);
            $row.removeClass('selected');
            if (row.editableTimer) {
                clearTimeout(row.editableTimer);
                row.editableTimer = null;
            }
        }
        this.selectedRows = [];
    },
    _updateRowSelections() {
        this.selectedRows = [];

        let selectedCount = 0;
        let selectLog = { };

        let range = this.selection.getRange(this.selection, true);
        let editable = range.start === range.end && this.selection.subSelections.length == 0;
        for (let i = range.start; i <= range.end; i++) {
            let row = this._getRowByIndex(i);
            if (row) {
                this._selectRow(row, editable);
                selectLog[i] = 1;
                selectedCount += 1;
            }
        }

        for (let subsection of this.selection.subSelections) {
            let subRange = this.selection.getRange(subsection, true);
            for (let i = subRange.start; i <= subRange.end; i++) {
                if (selectLog[i] === undefined) {
                    let row = this._getRowByIndex(i);
                    if (row) {
                        this._selectRow(row);
                        selectLog[i] = 1;
                        selectedCount += 1;
                    }
                }
                else
                    selectLog[i] += 1;
            }
        }

        return selectedCount;
    },

    _selectionChanged() {
        if (this._selectionChanging)
            return;

        this._selectionChanging = setTimeout(() => {

            let editingIds = this.model.get('editingVar');
            let editingColumn = null;
            if (editingIds !== null)
                editingColumn = this.model.getColumnById(editingIds[0]);

            if (editingIds !== null /*&& (editingColumn.columnType === 'filter' && editingColumn.hidden)*/) {
                let columns = this._currentSelectionToColumns();
                if (columns.length === 0)
                    this.model.set('editingVar', null);
                else {
                    let ids = columns.map(x => x.id);
                    this.model.set('editingVar', ids);
                }
            }

            this._selectionChanging = null;
        }, 0);
    },
    _currentSelectionToColumns() {
        return this.selectedRows.map(row => row.column);
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

    _applyColumnData($element, column, index) {
        $element.attr('data-id', column.id);
        $element.attr('data-index', index);
        $element.attr('data-datatype', column.dataType);
        $element.attr('data-columntype', column.columnType);
        $element.attr('data-measuretype', column.measureType);
        $element.attr('data-fmlaok', this._isColumnOk(column) ? '1' : '0');
        $element.attr('data-active', column.active);
        $element.attr('data-hidden', column.hidden);

        return $element;
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

    _createColumnResizer(gridIndex) {
        let $resizer = $(`<div class="resizer"  style="grid-area: 1 / ${ gridIndex } / -1 / span 1;"></div>`);

        return $resizer;
    },

    _createRow(column, row) {
        let $measureType = $('<div class="measure-box"><div class="measure-type-icon"></div>');

        if (column.columnType === 'computed' || column.columnType === 'recoded' || column.columnType === 'output') {
            let $dot = $('</div><div class="dot"></div>');
            this._updateColumnColour(column, $dot);
            $measureType.append($dot);
        }

        let $name = $(`<div class="name text" data-property="name" data-columnindex="${column.index}" tabindex="0">${ column.name }</div>`);
        if (column.columnType === 'filter')
            $name.addClass('readonly');
        this._addTextEvents($name, 'name', column);

        let $desc = $(`<div class="description text" data-property="description" data-columnindex="${column.index}" tabindex="0">${ column.description }</div>`);
        this._addTextEvents($desc, 'description', column);

        let colNo = column.index;

        let editingIds = this.model.get('editingVar');

        let $select = $(`<input type="checkbox" data-index="${colNo}" class="select" tabindex="-1"></input>`);
        this._addSelectEvents($select);

        this.$body.append(this._applyColumnData(this._createCell($select, row, 1, '', true), column, colNo));
        this.$body.append(this._applyColumnData(this._createCell($measureType, row, 2, '', true), column, colNo));
        this.$body.append(this._applyColumnData(this._createCell($name, row, 3, '', true), column, colNo));
        this.$body.append(this._applyColumnData(this._createCell($desc, row, 4, '', true), column, colNo));

        let $elements = this.$el.find(`.cell[data-index=${colNo}]`);
        let $editableTexts = $elements.find('.text:not(.readonly)');
        let $dot = $elements.find(`.dot`);

        this.rows[colNo] = {
            column: column,
            $elements: $elements,
            $select: $select,
            $name: $name,
            $description: $desc,
            $editableTexts: $editableTexts,
            $dot: $dot,
            nameReadOnly: column.columnType === 'filter'
        };
    },

    _updateList() {
        this._clearRowSelections();

        let columnCount = this.model.get('columnCount');
        this.$body.empty();

        this.rows = [];

        let $measureTypeHeader = $('<div style="width:10px;"></div>');
        let $nameHeader = $(`<div>${_('Name')}</div>`);
        let $descHeader = $(`<div>${_('Description')}</div>`);
        let $selectHeader =$('<input type="checkbox" class="select-header-checkbox"></input>');

        $selectHeader.on('change', (event) => {
            if ($selectHeader.prop("checked"))
                this.selection.selectAll();
            else
                this.selection.setSelection(0, this.selection.getColumnStart(), true);
        });

        this.$body.append(this._createCell($selectHeader, 1, 1, 'column-header', false));
        this.$body.append(this._createCell($measureTypeHeader, 1, 2, 'column-header', false));
        this.$body.append(this._createCell($nameHeader, 1, 3, 'column-header', false));
        this.$body.append(this._createCell($descHeader, 1, 4, 'column-header', false));

        let finalColumnCount = 0;
        let row = 2;
        this._topIndex = -1;
        for (let colNo = 0; colNo < columnCount; colNo++) {
            let column = this.model.getColumn(colNo, false);

            let searchText = this.$search.val().toLowerCase();
            if (searchText !== '' && ! column.name.toLowerCase().includes(searchText) && ! column.description.toLowerCase().includes(searchText))
                continue;

            if (this._topIndex === -1)
                this._topIndex = column.index;

            this._createRow(column, row);

            row += 1;
            if (column.columnType !== 'filter')
                finalColumnCount += 1;
        }

        if (row === 2) {
            this.$body.append($(`<div class="msg">${_('No variables match your query.')}</div>`));
            this.statusbar.updateInfoLabel('selectedCount', 0);
        }
        else {
            let selectedCount = this._updateRowSelections();
            this.statusbar.updateInfoLabel('selectedCount', selectedCount);
        }

        this.$body.css( { 'grid-template-rows': `repeat(${row}, auto)` });
        this.statusbar.updateInfoLabel('columnCount', finalColumnCount);
    },
    _getRowByIndex(index) {
        return this.rows[index];
    },
    _getRowById(id) {
        for (let rowIndex in this.rows) {
            let row = this.rows[rowIndex];
            if (row.column.id === id)
                return row;
        }
    },

    async textElementFocus(event) {
        let self = event.data;
        let $el = $(event.target);
        if ($el[0].hasAttribute('contenteditable') === false) {
            self.internalBluring = true;
            $el.blur();
            return;
        }

        if (self.internalFocus === false) {
            self.internalBluring = true;
            $el.blur();

            if (self._focusing)
                return;

            self._focusing = true;

            await new Promise((resolve) => setTimeout(resolve, 300));

            if (self._dblClicked) {
                self._dblClicked = null;
                self._focusing = false;
                return;
            }
            else {
                self.internalFocus = true;
                self._focusing = false;
                $el.focus();
                return;
            }
        }

        self.internalFocus = false;

        let propertyName = $el.attr('data-property');
        keyboardJS.pause('varview-' + propertyName);
        document.execCommand('selectAll', false, null);
        let column = self._getRowByIndex(parseInt($el.attr('data-columnindex'))).column;
        self._editingColumn = column;
    },

    textElementBlur(event) {
        let self = event.data;
        let $el = $(event.target);
        let propertyName = $el.attr('data-property');
        if (self.internalBluring === false) {
            let data = { };
            data[propertyName] = $el.text();
            let column = self._getRowByIndex(parseInt($el.attr('data-columnindex'))).column;
            if (column[propertyName] !== data[propertyName])
                self.model.changeColumn(column.id, data);
            window.clearTextSelection();
            self._editingColumn = null;
        }
        self.internalBluring = false;
        keyboardJS.resume('varview-' + propertyName);
    },

    textElementKeyDown(event) {
        let self = event.data;
        let $el = $(event.target);
        let propertyName = $el.attr('data-property');
        let column = self._getRowByIndex(parseInt($el.attr('data-columnindex'))).column;
        var keypressed = event.keyCode || event.which;
        if (keypressed === 13) { // enter key
            $el.blur();
            let columnCount = self.model.get('columnCount');
            let index = column.index;
            if (event.shiftKey) {
                if (column.index > 0)
                    index = index - 1;
                else
                    index = columnCount - 1;
            }
            else {
                if (column.index < columnCount - 1)
                    index = index + 1;
                else
                    index = 0;
            }

            self.selection.setSelection(0, index, true);
            setTimeout(() => {
                self.$el.find(`.selected > .${ propertyName }.text`).focus().select();
            }, 10);
            event.preventDefault();
            event.stopPropagation();
        }
        else if (keypressed === 27) { // escape key
            $el.text(column[propertyName]);
            $el.blur();
            event.preventDefault();
            event.stopPropagation();
        }
    },

    _addTextEvents($element) {

        $element.focus(this, this.textElementFocus);

        $element.blur(this, this.textElementBlur);

        $element.keydown(this, this.textElementKeyDown);
    },
    _updateColumnColour(column, $dot) {
        if (column.columnType === 'recoded') {
            let transform = this.model.getTransformById(column.transform);
            if (transform) {
                $dot.removeClass('no-transform');
                $dot.css('background-color', ColourPalette.get(transform.colourIndex));
                $dot.attr('title', 'Transform: ' + transform.name);
            }
            else {
                $dot.addClass('no-transform');
                $dot.css('background-color', '#acacac');
                $dot.attr('title', 'Transform: None');
            }
        }
        else if (column.columnType === 'computed') {
            $dot.css('background-color', '#515151');
            $dot.attr('title', 'Computed variable');
        }
    },
    _addSelectEvents($checkbox) {
        $checkbox.on('change', event => {
            event.ctrlKey = true;
            event.shiftKey = false;
            event.button = 0;
            let colNo = parseInt($checkbox.attr('data-index'));
            this._mouseDown(event, colNo);
            this._mouseUp(event);
        });

        $checkbox.on('mousedown', event => {
            event.stopPropagation();
            event.preventDefault();
        });

        $checkbox.on('mouseup', event => {
            event.stopPropagation();
            event.preventDefault();
        });
    },

    _createCell($contents, row, column, classes, hasEvents, columnSpan) {
        if (columnSpan ===undefined)
            columnSpan = 1;
        let $cell = $(`<div class="cell ${ classes }" style="grid-area: ${ row } / ${ column } / span 1 / span ${ columnSpan };"></div>`);
        if (hasEvents) {
            $cell.on('mouseover', event => {
                this.$body.find('.cell.hovering').removeClass('hovering');
                let id = parseInt($cell.attr('data-id'));
                let $row = this._getRowById(id).$elements;
                $row.addClass('hovering');
            });
            $cell.on('mousedown', event => {
                let colNo = parseInt($cell.attr('data-index'));
                this._mouseDown(event, colNo);
            });
            $cell.on('dblclick', event => {
                let id = parseInt($cell.attr('data-id'));
                if (this._editingColumn && this._editingColumn.id === id)
                    return;

                this._dblClicked = true;
                this.model.set('editingVar', [id]);
            });
        }
        $cell.append($contents);

        return $cell;
    },

    _mouseDown(event, colNo) {
        this._mouseDownClicked = true;
        this._clickRange = null;
        this._clickRangeList = null;
        let added = false;
        let noChange = false;
        this._delayClear = false;

        let range = this.selection.createRange(colNo, colNo, colNo);
        if (range === null)
            return;

        if (event.button === 0) {
            if (event.ctrlKey || event.metaKey) {
                if (this.selection.rangeOverlaps(range)) {
                    if (this.selection.singleColumnSelected() === false) {
                        this.selection.addNewSelectionToList(range, 'negative');
                        added = true;
                    }
                }
                else {
                    this.selection.addNewSelectionToList(range);
                    added = true;
                }
            }
            else if (this.selection.rangeOverlaps(range)) {
                if (this.selection.getColumnStart() !== this.selection.getColumnEnd() || this.selection.subSelections.length > 0)
                    this._delayClear = true;
                else
                    noChange = true;
            }
            else
                this.selection.clearSelectionList();
        }
        else {
            if (! this.selection.rangeOverlaps(range))
                this.selection.clearSelectionList();
            else
                added = true;  // leave selection unchanged
        }

        if (added === false) {
            let left = colNo;
            let right = colNo;

            if (event.shiftKey) {
                let range = this.selection.getRange(this.selection, true);
                if (range.start > colNo)
                    right = range.start;
                else if (range.start < colNo)
                    left = range.start;
                colNo = range.start;
            }

            let searchText = this.$search.val();
            if (searchText && left + 1 < right) {
                this._clickRangeList = [];
                let s = null;
                let e = null;
                for (let c = left; c <= right; c++) {
                    let $row = this._getRowByIndex(c).$elements;
                    if ($row.length > 0) {
                        if (s === null)
                            s = c;
                        if (e === null)
                            e = c;
                        else if (c === e + 1)
                            e = c;
                        else {
                            this._clickRangeList.push(this.selection.createRange(s, e, s));
                            s = c;
                            e = c;
                        }
                    }
                }
                this._clickRangeList.push(this.selection.createRange(s, e, s));
                this._clickRange = this._clickRangeList.pop();
            }
            else
                this._clickRange = this.selection.createRange(left, right, colNo);

             if (this._clickRange.bottom < 0)
                this._clickRange.bottom = 0;

             if (noChange === false && this._delayClear === false)
                this.selection.setSelections(this._clickRange, this._clickRangeList);
         }
    },

    _mouseUp(event) {
        if (this.controller.focusedOn !== this)
            return;

        if ( ! this._mouseDownClicked && event.button === 2) {
            let element = document.elementFromPoint(event.clientX, event.clientY);
            let $element = $(element);
            let $cell = $element.closest('.cell');
            let index = this.model.get('columnCount');
            if ($cell.length !== 0)
                index = parseInt($cell.attr('data-index'));
            this._mouseDown(event, index);
        }

        if (this._delayClear === true) {
            this.selection.clearSelectionList();
            this.selection.setSelections(this._clickRange, this._clickRangeList);
        }
        else if (! this._dragging)
            this.selection.resolveSelectionList(this.$el);
        this._delayClear = false;
        this._dragging = false;

        this._mouseDownClicked = false;
    },

    _mouseMove(event) {
        if (this.controller.focusedOn !== this)
            return;

        if (this._delayClear === true) {
            this._delayClear = false;
            this._dragging = true;
        }
    },

    _dataSetLoaded() {
        this._updateList();

        this._updateFilterInfo();
        this._updateEyeButton();
    },
    _columnsActiveChanged(event) {
        this._updateFilterInfo();
    },
    _columnsDeleted(event) {
        this._updateList();
        this._updateFilterInfo();
    },
    _transformsChanged(event) {


    },
    _columnsChanged(event) {

        for (let i = 0; i < event.changes.length; i++) {
            let change = event.changes[i];
            if (change.created)
                continue;

            let id = change.id;
            let row = this._getRowById(id);

            if (row) {
                if (change.nameChanged)
                    row.$name.text(change.name);

                if (change.descriptionChanged)
                    row.$description.text(row.column.description);

                if (change.measureTypeChanged)
                    row.$elements.attr('data-measuretype', row.column.measureType);

                if (change.transformChanged)
                    this._updateColumnColour(row.column, row.$dot);
            }
        }
    },

    _columnsInserted(event, ignoreSelection) {
        this.$search.val('');
        this._updateFilterInfo();
        this._updateList();
    },

    _notEditingKeyPress(event) {

        if (event.altKey)
            return;

        if ((event.metaKey || event.ctrlKey) && ! (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown'))
            return;

        switch(event.key) {
            case 'ArrowUp':
            case 'ArrowLeft':
                if (event.metaKey || event.ctrlKey) {
                    if (event.shiftKey) {
                        let newSelection = this.selection.clone();
                        newSelection.left = 0;
                        newSelection.columnStart = 0;
                        this.selection.legitimise(newSelection);
                        this.selection.setSelections(newSelection);
                    }
                    else
                        this.selection.setSelection(this.selection.rowNo, 0, false);
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
            case 'ArrowDown':
            case 'ArrowRight':
                if (event.metaKey || event.ctrlKey) {
                    if (event.shiftKey) {
                        let newSelection = this.selection.clone();
                        newSelection.right = this.model.visibleRealColumnCount() - 1;
                        newSelection.columnEnd = this.model.attributes.columnCount - 1;
                        this.selection.legitimise(newSelection);
                        this.selection.setSelections(newSelection);
                    }
                    else
                        this.selection.setSelection(this.selection.rowNo, this.model.attributes.columnCount - 1, false);
                }
                else
                    this.selection.moveCursor('right', event.shiftKey);
                event.preventDefault();
                break;
        }
    }
});

module.exports = VariablesView;
