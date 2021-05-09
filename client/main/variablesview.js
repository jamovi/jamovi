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
const { csvifyCells, htmlifyCells } = require('../common/utils/formatio');
const host = require('./host');
const ActionHub = require('./actionhub');
const ContextMenu = require('./contextmenu');
const Statusbar = require('./statusbar/statusbar');

const VariablesView = SilkyView.extend({
    className: 'variablesview',
    initialize(options) {
        this.selectionModel = null;
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
                <input class="search" placeholder="Search variables"></input>
            </div>
            <div class="jmv-variables-container">
                <div class="jmv-variables-body">

                </div>
            </div>`);

        this.statusbar = new Statusbar();
        this.$el.append(this.statusbar.$el);
        this.statusbar.addInfoLabel('editStatus', { dock: 'left', value: 'Ready' });
        this.statusbar.addActionButton('editFilters', { dock: 'left' });
        this.statusbar.addActionButton('toggleFilterVisible', { dock: 'left' });
        this.statusbar.addInfoLabel('activeFilters', { dock: 'left', label: 'Filters', value: 0 });
        this.statusbar.addInfoLabel('columnCount', { dock: 'right', label: 'Variables', value: 0 });
        this.statusbar.addInfoLabel('selectedCount', { dock: 'right', label: 'Selected', value: 0 });

        this.$body      = this.$el.find('.jmv-variables-body');
        this.$container = this.$el.find('.jmv-variables-container');

        let $newVariable = $(`<div class="add-new-variable"><span class="mif-plus"></span></div>`);
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
            this.$body.find(`.cell.hovering`).removeClass('hovering');
        });

        this.controller = options.controller;
        this.controller.registerView('variables', this);
        this.selection = options.controller.selection;
        this.selectionIncludesHidden = true;

        this.selection.registerChangeEventHandler((oldSel, silent, ignoreTabStart) => {
            this.$el.find(`.selected .text`).removeAttr('contenteditable');
            this.$el.find(`.cell.selected .text.name`).removeAttr('placeholder');
            this.$el.find(`.cell.selected .text.description`).removeAttr('placeholder');
            this.$el.find('.selected').removeClass('selected');
            let $current = this.$body.find(`.select:checked`);
            $current.prop('checked', false);

            let selectedCount = 0;
            let selectLog = { };

            let range = this.selection.getRange(this.selection, true);
            for (let i = range.start; i <= range.end; i++) {
                this.$el.find(`.cell[data-index=${i}]`).addClass('selected');
                this.$el.find(`.cell[data-index=${i}] .select`).prop('checked', true);
                selectLog[i] = 1;
                selectedCount += 1;
            }

            for (let subsection of this.selection.subSelections) {
                let subRange = this.selection.getRange(subsection, true);
                for (let i = subRange.start; i <= subRange.end; i++) {
                    this.$el.find(`.cell[data-index=${i}]`).addClass('selected');
                    this.$el.find(`.cell[data-index=${i}] .select`).prop('checked', true);
                    if (selectLog[i] === undefined) {
                        selectLog[i] = 1;
                        selectedCount += 1;
                    }
                    else
                        selectLog[i] += 1;
                }
            }
            this.statusbar.updateInfoLabel('selectedCount', selectedCount);

            if (range.start === range.end && this.selection.subSelections.length == 0) {
                setTimeout(() => {
                    this.$el.find(`.cell.selected .text:not(.readonly)`).attr('contenteditable', true);
                    this.$el.find(`.cell.selected .text.name:not(.readonly)`).attr('placeholder', 'Enter name');
                    this.$el.find(`.cell.selected .text.description:not(.readonly)`).attr('placeholder', 'Enter description');
                }, 10);
            }


            let focusCell = this.$el.find(`.cell[data-index=${range.start}]`)[0];
            if (focusCell)
                focusCell.scrollIntoView({block: 'nearest', inline: 'center', behavior: 'smooth'});
        });

        $(document).on('mousemove', event => this._mouseMove(event));
        $(document).on('mouseup', event => this._mouseUp(event));
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
        let $selections = this.$body.find('.select:checked');
        let columns = [];
        for (let select of $selections) {
            let $cell = $(select.parentNode);
            let id = parseInt($cell.attr('data-id'));
            let column = this.model.getColumnById(id);
            if (column)
                columns.push(column);
        }
        return columns;
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

    _updateList() {
        let columnCount = this.model.get('columnCount');
        this.$body.empty();

        let $measureTypeHeader = $(`<div style="width:10px;"></div>`);
        let $nameHeader = $(`<div>Name</div>`);
        let $descHeader = $(`<div>Description</div>`);
        let $selectHeader =$(`<input type="checkbox" class="select-header-checkbox"></input>`);

        $selectHeader.on('change', (event) => {
            if ($selectHeader.prop("checked"))
                this.selection.selectAll();
            else
                this.selection.setSelection(0, this.selection.getColumnStart(), true);
        });

        this.$body.append(this._createCell($selectHeader, 1, 1, 'column-header', false));
        this.$body.append(this._createCell($measureTypeHeader, 1, 2, 'column-header', false));
        this.$body.append(this._createCell($nameHeader, 1, 3, 'column-header', false));
        //this.$body.append(this._createColumnResizer(4));
        this.$body.append(this._createCell($descHeader, 1, 4, 'column-header', false));

        let editingIds = this.model.get('editingVar');

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
            let $measureType = $(`<div class="measure-box"><div class="measure-type-icon"></div>`);

            if (column.columnType === 'computed' || column.columnType === 'recoded' || column.columnType === 'output') {
                let $dot = $('</div><div class="dot"></div>');
                this._updateColumnColour(column, $dot);
                $measureType.append($dot);
            }

            let $name = $(`<div class="name text" tabindex="0">${ column.name }</div>`);
            if (column.columnType === 'filter')
                $name.addClass('readonly');
            this._addTextEvents($name, 'name', column);

            let $desc = $(`<div class="description text" tabindex="0">${ column.description }</div>`);
            this._addTextEvents($desc, 'description', column);

            let selected = editingIds != null ? editingIds.includes(column.id) : false;
            let $select = $(`<input type="checkbox" data-index="${colNo}" class="select" tabindex="-1" ${ selected ? 'checked' : '' }></input>`);
            this._addSelectEvents($select);

            this.$body.append(this._applyColumnData(this._createCell($select, row, 1, '', true), column, colNo));
            this.$body.append(this._applyColumnData(this._createCell($measureType, row, 2, '', true), column, colNo));
            this.$body.append(this._applyColumnData(this._createCell($name, row, 3, '', true), column, colNo));
            this.$body.append(this._applyColumnData(this._createCell($desc, row, 4, '', true), column, colNo));

            row += 1;
            if (column.columnType !== 'filter')
                finalColumnCount += 1;
        }

        if (row === 2) {
            this.$body.append($(`<div class="msg">No variables match your query.</div>`));
            this.statusbar.updateInfoLabel('selectedCount', 0);
        }
        else {
            let selectedCount = 0;
            let selectLog = { };

            let range = this.selection.getRange(this.selection, true);
            for (let i = range.start; i <= range.end; i++) {
                this.$el.find(`.cell[data-index=${i}]`).addClass('selected');
                this.$el.find(`.cell[data-index=${i}] .select`).prop('checked', true);
                selectLog[i] = 1;
                selectedCount += 1;
            }

            for (let subsection of this.selection.subSelections) {
                let subRange = this.selection.getRange(subsection, true);
                for (let i = subRange.start; i <= subRange.end; i++) {
                    this.$el.find(`.cell[data-index=${i}]`).addClass('selected');
                    this.$el.find(`.cell[data-index=${i}] .select`).prop('checked', true);
                    if (selectLog[i] === undefined) {
                        selectLog[i] = 1;
                        selectedCount += 1;
                    }
                    else
                        selectLog[i] += 1;
                }
            }

            if (range.start === range.end && this.selection.subSelections.length == 0) {
                this.$el.find(`.cell.selected .text:not(.readonly)`).attr('contenteditable', true);
                this.$el.find(`.cell.selected .text.name:not(.readonly)`).attr('placeholder', 'Enter name');
                this.$el.find(`.cell.selected .text.description:not(.readonly)`).attr('placeholder', 'Enter description');
            }
            this.statusbar.updateInfoLabel('selectedCount', selectedCount);
        }

        this.$body.css( { 'grid-template-rows': `repeat(${row}, auto)` });
        this.statusbar.updateInfoLabel('columnCount', finalColumnCount);
    },
    _addTextEvents($element, propertyName, column) {
        let internalBluring = false;
        let internalFocus = false;

        $element.focus(async () => {

            if ($element[0].hasAttribute('contenteditable') === false) {
                internalBluring = true;
                $element.blur();
                return;
            }

            if (internalFocus === false) {
                internalBluring = true;
                $element.blur();

                if (this._focusing)
                    return;

                this._focusing = true;

                await new Promise((resolve) => setTimeout(resolve, 300));

                if (this._dblClicked) {
                    this._dblClicked = null;
                    this._focusing = false;
                    return;
                }
                else {
                    internalFocus = true;
                    this._focusing = false;
                    $element.focus();
                    return;
                }
            }

            internalFocus = false;

            keyboardJS.pause('varview-' + propertyName);
            document.execCommand('selectAll', false, null);
            this._editingColumn = column;
        } );

        $element.blur(() => {
            if (internalBluring === false) {
                let data = { };
                data[propertyName] = $element.text();
                if (column[propertyName] !== data[propertyName])
                    this.model.changeColumn(column.id, data);
                window.clearTextSelection();
                this._editingColumn = null;
            }
            internalBluring = false;
            keyboardJS.resume('varview-' + propertyName);
        } );

        $element.keydown((event) => {
            var keypressed = event.keyCode || event.which;
            if (keypressed === 13) { // enter key
                $element.blur();
                let columnCount = this.model.get('columnCount');
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

                this.selection.setSelection(0, index, true);
                setTimeout(() => {
                    this.$el.find(`.selected > .${ propertyName }.text`).focus().select();
                }, 10);
                event.preventDefault();
                event.stopPropagation();
            }
            else if (keypressed === 27) { // escape key
                $element.text(column[propertyName]);
                $element.blur();
                event.preventDefault();
                event.stopPropagation();
            }
        });
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
                this.$body.find(`.cell.hovering`).removeClass('hovering');
                let id = $cell.attr('data-id');
                let $row = this.$body.find(`.cell[data-id=${ id }]`);
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

        if (event.button === 0) {
            if (event.ctrlKey || event.metaKey) {
                let range = this.selection.createRange(colNo, colNo, colNo);
                if (this.selection.cellInSelection(0, colNo, true))
                    this.selection.addNewSelectionToList(range, 'negative');
                else
                    this.selection.addNewSelectionToList(range);
                added = true;
            }
            else if (this.selection.cellInSelection(0, colNo, true)) {
                if (this.selection.getColumnStart() !== this.selection.getColumnEnd() || this.selection.subSelections.length > 0)
                    this._delayClear = true;
                else
                    noChange = true;
            }
            else
                this.selection.clearSelectionList();
        }
        else {
            if (! this.selection.cellInSelection(0, colNo, true))
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
                    if (this.$el.find(`[data-index=${ c }]`).length > 0) {
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

        if (event.button === 2) {
            let colNo = this.selection === null ? 0 : this.selection.getColumnStart();
            let column = this.model.getColumn(colNo);
            if (column !== null && column.columnType === 'filter')
                ContextMenu.showFilterMenu(event.clientX, event.clientY, true);
            else
                ContextMenu.showVariableMenu(event.clientX, event.clientY, this.selection.getColumnStart() !== this.selection.getColumnEnd(), true);
        }
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
            let id = change.id;
            if (change.nameChanged) {
                let $element = this.$el.find(`.cell[data-id=${ id }] .name`);
                $element.text(change.name);
            }

            if (change.descriptionChanged) {
                let column = this.model.getColumnById(id);
                let $element = this.$el.find(`.cell[data-id=${ id }] .description`);
                $element.text(column.description);
            }

            if (change.measureTypeChanged) {
                let column = this.model.getColumnById(id);
                let $element = this.$el.find(`.cell[data-id=${ id }]`);
                $element.attr('data-measuretype', column.measureType);
            }

            if (change.transformChanged) {
                let column = this.model.getColumnById(id);
                let $dot = this.$el.find(`.cell[data-id=${ id }] .dot`);
                this._updateColumnColour(column, $dot);
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
