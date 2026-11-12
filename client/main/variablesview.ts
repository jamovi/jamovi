//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import ColourPalette from './editors/colourpalette';

import ContextMenu from './contextmenu';
import Statusbar from './statusbar/statusbar';
import { contextMenuListener } from '../common/utils';
import interactionManager from '../common/interactionmanager';
import DataSetViewModel, { Column, ColumnActiveChangedEvent } from './dataset';
import { h }  from '../common/htmlelementcreator';
import ViewController, { DataSetView } from './viewcontroller';
import Selection, { ISelection } from './selection';

type VaraibleRow = {
    column: Column;
    $elements: HTMLElement[];
    $select: HTMLInputElement;
    $name: HTMLDivElement;
    $description: HTMLDivElement;
    $editableTexts: HTMLDivElement[];
    $dot: HTMLElement;
    nameReadOnly: boolean;
    visible: boolean;
    editableTimer?: NodeJS.Timeout;
}

const SEARCH_HIGHLIGHT = 'jmv-variables-search';

function cloneMouseEvent(e: MouseEvent, overrides: MouseEventInit = {}): MouseEvent {
  return new MouseEvent(e.type, {
    bubbles: e.bubbles,
    cancelable: e.cancelable,
    composed: e.composed,
    view: e.view,
    detail: e.detail,
    screenX: e.screenX,
    screenY: e.screenY,
    clientX: e.clientX,
    clientY: e.clientY,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    button: e.button,
    buttons: e.buttons,
    relatedTarget: e.relatedTarget,
    ...overrides, // apply your changes here
  });
}


class VariablesView extends HTMLElement  implements DataSetView {
    model: DataSetViewModel;
    statusbar: Statusbar;
    controller: ViewController;
    selection: Selection;

    $body: HTMLElement;
    $container: HTMLElement;
    $search: HTMLInputElement;

    searchingInProgress: NodeJS.Timeout;
    _selectionChanging: NodeJS.Timeout;
    _topIndex: number;
    internalBluring: boolean;
    internalFocus: boolean;
    _dblClicked: boolean;
    _focusing: boolean;
    _editingColumn: Column;
    _mouseDownClicked: boolean;
    _delayClear: boolean;
    _dragging: boolean;
    selectionIncludesHidden: boolean;

    rows: VaraibleRow[];
    rowsById: Map<number, VaraibleRow>;
    selectedRows: VaraibleRow[];
    _hoverRow: VaraibleRow;
    $noMatches: HTMLElement;
    _scrollPending: boolean;
    _clickRangeList: ISelection[];
    _clickRange: ISelection;


    constructor(controller: ViewController, model: DataSetViewModel) {
        super();

        this.model = model;
        this.controller = controller;

        this.textElementFocus = this.textElementFocus.bind(this);
        this.textElementBlur = this.textElementBlur.bind(this);
        this.textElementKeyDown = this.textElementKeyDown.bind(this);

        this.classList.add('variablesview');

        this.rows = [ ];
        this.rowsById = new Map();
        this.selectedRows = [];
        this._hoverRow = null;
        this._scrollPending = false;
        this.internalBluring = false;
        this.internalFocus = false;

        this.model.on('dataSetLoaded', this._dataSetLoaded, this);
        this.model.on('columnsChanged', event => this._columnsChanged(event));
        this.model.on('columnsDeleted', event => this._columnsDeleted(event));
        this.model.on('columnsInserted', event => this._columnsInserted(event));
        this.model.on('columnsHidden', event => this._columnsDeleted(event));
        this.model.on('columnsVisible', event => this._columnsInserted(event));
        this.model.on('columnsActiveChanged', (event: ColumnActiveChangedEvent) => this._columnsActiveChanged(event));
        this.model.on('transformsChanged', event => this._transformsChanged(event));
        this.model.on('change:filtersVisible', event => this._updateEyeButton());

        this.classList.add('jmv-variablesview');
        this.setAttribute('role', 'region');
        this.setAttribute('aria-label', `${_('Variables List View')}`);
        this.setAttribute('aria-hidden', 'true');

        this.append(
            h('div', { class: 'jmv-variables-searchbox', role: 'presentation' },
                h('div', { class: 'image' }),
                h('input', {
                    type: 'search',
                    class: 'search',
                    placeholder: _('Search variables'),
                    'aria-description': _('Search variables')
                })),
            h('div', { class: 'jmv-variables-container', role: 'none' },
                h('div', {
                    class: 'jmv-variables-body',
                    role: 'listbox',
                    'aria-label': 'Variables List',
                    'aria-multiselectable': 'true',
                    tabindex: '0'
                })));

        this.statusbar = new Statusbar();
        this.append(this.statusbar);
        this.statusbar.addInfoLabel('editStatus', { dock: 'left', value: _('Ready') });
        this.statusbar.addActionButton('editFilters', { dock: 'left' });
        this.statusbar.addActionButton('toggleFilterVisible', { dock: 'left' });
        this.statusbar.addInfoLabel('activeFilters', { dock: 'left', label: _('Filters'), value: 0 });
        this.statusbar.addInfoLabel('columnCount', { dock: 'right', label: _('Variables'), value: 0 });
        this.statusbar.addInfoLabel('selectedCount', { dock: 'right', label: _('Selected'), value: 0 });

        this.$body      = this.querySelector('.jmv-variables-body');
        this.$container = this.querySelector('.jmv-variables-container');

        let $newVariable = h('div', { class: 'add-new-variable' },
            h('span', { class: 'mif-plus' }));
        this.$container.append(this._createCell($newVariable, 0, 1, 'new-variable', false, 4));

        $newVariable.addEventListener('click', (event) => {
            const rect = $newVariable.getBoundingClientRect();

            const left = rect.left + window.scrollX;
            const top = rect.top + window.scrollY;
            const width = rect.width;
            const height = rect.height;

            ContextMenu.showAppendVariableMenu(left + width + 10, top + height - 10, 'right');
        });

        this.$search = this.querySelector('.search');

        this.$search.addEventListener('input', (event) => {
            if (this.searchingInProgress)
                clearTimeout(this.searchingInProgress);
            
            this.searchingInProgress = setTimeout(() => {
                this._applySearch();
                if (this._topIndex !== -1)
                    this.selection.setSelection(0, this._topIndex, true);
                this.searchingInProgress = null;
            }, 600);
        });

        this.$search.addEventListener('focus', () => {
            this.$search.select();
        });

        this.$body.addEventListener('mouseleave', (event) => {
            this._setHoverRow(null);
        });

        contextMenuListener(this, (event) => {
            let element = document.elementFromPoint(event.clientX, event.clientY);
            let $view = element.closest('.jmv-variables-container');
            if ($view) {
                let colNo = this.selection === null ? 0 : this.selection.getColumnStart();
                let column = this.model.getColumn(colNo);
                if (column !== null && column.columnType === 'filter')
                    ContextMenu.showFilterMenu(event.clientX, event.clientY, true);
                else
                    ContextMenu.showVariableMenu(event.clientX, event.clientY, this.selection.getColumnStart() !== this.selection.getColumnEnd(), true);
                event.preventDefault();
            }
        });

        this.controller.registerView('variables', this, { title: _('Variables View') });
        this.selection = this.controller.selection;
        this.selectionIncludesHidden = true;

        this.selection.registerChangeEventHandler((oldSel, silent, ignoreTabStart) => {
            if (this.rows.length === 0)
                return;

            this._clearRowSelections();

            let selectedCount = this._updateRowSelections();
            this.statusbar.updateInfoLabel('selectedCount', selectedCount);

            // scrolling forces a layout, so while the list is hidden it's
            // deferred until the view is shown again
            if (this.controller.focusedOn === this)
                this._scrollToSelection('smooth');
            else
                this._scrollPending = true;
        });

        document.addEventListener('mousemove', event => this._mouseMove(event));
        document.addEventListener('mouseup', event => this._mouseUp(event));
    }

    getFocusControl() {
        return this.$body;
    }

    onViewControllerFocus() {
        if (this._scrollPending) {
            this._scrollPending = false;
            // wait for the view to be displayed before measuring
            requestAnimationFrame(() => this._scrollToSelection('instant'));
        }
    }

    _scrollToSelection(behavior: ScrollBehavior) {
        if (this.selectedRows.length > 0) {
            let focusCell = this.selectedRows[0].$elements[0];
            if (focusCell)
                focusCell.scrollIntoView({block: 'nearest', inline: 'center', behavior });
        }
    }

    _setHoverRow(row: VaraibleRow) {
        if (row === this._hoverRow)
            return;
        if (this._hoverRow)
            this._hoverRow.$elements.forEach(el => el.classList.remove('hovering'));
        this._hoverRow = row;
        if (row)
            row.$elements.forEach(el => el.classList.add('hovering'));
    }

    _selectRow(row: VaraibleRow, editable: boolean = false) {
        this.selectedRows.push(row);

        let $row = row.$elements;
        $row.forEach(el => el.classList.add('selected'));
        row.$select.checked = true;
        row.$select.setAttribute('aria-checked', 'true');

        if (this.controller.focusedOn === this)
            interactionManager.announce(`${row.column.name} ${row.column.measureType} ${row.column.dataType}`);

        if (editable && ! row.editableTimer) {
            row.editableTimer = setTimeout(function () {
                row.$editableTexts.forEach(el => el.setAttribute('contenteditable', 'true'));
                if (row.nameReadOnly === false)
                    row.$name.setAttribute('placeholder', _('Enter name'));
                row.$description.setAttribute('placeholder', _('Enter description'));
                row.editableTimer = null;
            }, 10);
        }
    }

    _clearRowSelections() {
        for (let row of this.selectedRows) {
            let $row = row.$elements;
            row.$editableTexts.forEach(el => el.removeAttribute('contenteditable'));
            row.$name.removeAttribute('placeholder');
            row.$description.removeAttribute('placeholder');
            row.$select.checked = false;
            row.$select.setAttribute('aria-checked', 'false');
            $row.forEach(el => el.classList.remove('selected'));
            if (row.editableTimer) {
                clearTimeout(row.editableTimer);
                row.editableTimer = null;
            }
        }
        this.selectedRows = [];
    }

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
    }

    _selectionChanged() {
        if (this._selectionChanging)
            return;

        this._selectionChanging = setTimeout(() => {

            let editingIds = this.model.get('editingVar');
            //let editingColumn: Column = null;
            //if (editingIds !== null)
            //    editingColumn = this.model.getColumnById(editingIds[0]);

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
    }

    _currentSelectionToColumns() {
        return this.selectedRows.map(row => row.column);
    }

    _updateEyeButton() {
        if (this.model.get('filtersVisible'))
            this.statusbar.querySelector('.jmv-statusbar-button[data-name="togglefiltervisible"]')?.classList.add('hide-filter-columns');
        else
            this.statusbar.querySelector('.jmv-statusbar-button[data-name="togglefiltervisible"]')?.classList.remove('hide-filter-columns');
    }

    _updateFilterInfo() {
        let count = this.model.filterCount(true);
        this.statusbar.updateInfoLabel('activeFilters', count);
        if (count === 0)
            this.statusbar.querySelector('.jmv-statusbar-button[data-name="editfilters"]')?.classList.add('gray');
        else
            this.statusbar.querySelector('.jmv-statusbar-button[data-name="editfilters"]')?.classList.remove('gray');
    }

    _applyColumnData($element: HTMLElement, column: Column, index: number) {
        $element.setAttribute('data-id', column.id.toString());
        $element.setAttribute('data-index', index.toString());
        $element.setAttribute('data-datatype', column.dataType);
        $element.setAttribute('data-columntype', column.columnType);
        $element.setAttribute('data-measuretype', column.measureType);
        $element.setAttribute('data-fmlaok', this._isColumnOk(column) ? '1' : '0');
        $element.setAttribute('data-active', column.active.toString());
        $element.setAttribute('data-hidden', column.hidden.toString());

        return $element;
    }

    _isColumnOk(column: Column) {
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
    }

    _createColumnResizer(gridIndex: number) {
        let $resizer = h('div', { class: 'resizer', style: `grid-area: 1 / ${ gridIndex } / -1 / span 1;` });

        return $resizer;
    }

    _createRow(column: Column, row: number, $parent: DocumentFragment) {
        let $measureType = h('div', { role: 'none', class: 'measure-box' },
            h('div', { class: 'measure-type-icon' }));

        let $dot: HTMLElement = null;
        if (column.columnType === 'computed' || column.columnType === 'recoded' || column.columnType === 'output') {
            $dot = h('div', { class: 'dot' });
            this._updateColumnColour(column, $dot);
            $measureType.append($dot);
        }

        let labelId = interactionManager.nextAriaId('label');

        let $name = h('div', { role: 'none', id: labelId, class: 'name text', 'data-property': 'name', 'data-columnindex': column.index.toString(), tabindex: '0' }, column.name);
        if (column.columnType === 'filter')
            $name.classList.add('readonly');
        this._addTextEvents($name);

        let $desc = h('div', { role: 'none', class: 'description text', 'data-property': 'description', 'data-columnindex': column.index.toString(), tabindex: '0' }, column.description);
        this._addTextEvents($desc);

        let colNo = column.index;

        let editingIds = this.model.get('editingVar');

        let $select = h('input', { role: 'option', 'aria-labelledby': labelId, type: 'checkbox', 'data-index': colNo.toString(), class: 'select', tabindex: '-1' });
        this._addSelectEvents($select);

        let $elements = [
            this._applyColumnData(this._createCell($select, row, 1, '', true), column, colNo),
            this._applyColumnData(this._createCell($measureType, row, 2, '', true), column, colNo),
            this._applyColumnData(this._createCell($name, row, 3, '', true), column, colNo),
            this._applyColumnData(this._createCell($desc, row, 4, '', true), column, colNo),
        ];
        $parent.append(...$elements);

        let nameReadOnly = column.columnType === 'filter';
        let $editableTexts = nameReadOnly ? [ $desc ] : [ $name, $desc ];

        let variableRow: VaraibleRow = {
            column: column,
            $elements: $elements,
            $select: $select,
            $name: $name,
            $description: $desc,
            $editableTexts: $editableTexts,
            $dot: $dot,
            nameReadOnly: nameReadOnly,
            visible: true,
        };

        this.rows[colNo] = variableRow;
        this.rowsById.set(column.id, variableRow);
    }

    _updateList() {
        this._clearRowSelections();
        this._hoverRow = null;

        let columnCount = this.model.get('columnCount');
        this.$body.replaceChildren();

        this.rows = [];
        this.rowsById = new Map();

        let $measureTypeHeader = h('div', { style: 'width:10px;' });
        let $nameHeader = h('div', {}, _('Name'));
        let $descHeader = h('div', {}, _('Description'));
        let $selectHeader = h('input', { type: 'checkbox', class: 'select-header-checkbox' });

        $selectHeader.addEventListener('change', (event) => {
            if ($selectHeader.checked)
                this.selection.selectAll();
            else
                this.selection.setSelection(0, this.selection.getColumnStart(), true);
        });

        this.$body.append(this._createCell($selectHeader, 1, 1, 'column-header', false));
        this.$body.append(this._createCell($measureTypeHeader, 1, 2, 'column-header', false));
        this.$body.append(this._createCell($nameHeader, 1, 3, 'column-header', false));
        this.$body.append(this._createCell($descHeader, 1, 4, 'column-header', false));

        // every column gets a row; the search only shows/hides them
        let $fragment = document.createDocumentFragment();
        for (let colNo = 0; colNo < columnCount; colNo++) {
            let column = this.model.getColumn(colNo, false);
            this._createRow(column, colNo + 2, $fragment);
        }

        this.$noMatches = h('div', { class: 'msg' }, _('No variables match your query.'));
        $fragment.append(this.$noMatches);

        this.$body.append($fragment);

        this._applySearch();
    }

    _applySearch() {
        this._clearRowSelections();
        this._setHoverRow(null);

        let searchText = this.$search.value.toLowerCase();

        let finalColumnCount = 0;
        let row = 2;
        this._topIndex = -1;
        for (let variableRow of this.rows) {
            if (variableRow === undefined)
                continue;

            let column = variableRow.column;
            let visible = searchText === ''
                || column.name.toLowerCase().includes(searchText)
                || column.description.toLowerCase().includes(searchText);

            if (visible !== variableRow.visible) {
                variableRow.visible = visible;
                let display = visible ? '' : 'none';
                for (let $cell of variableRow.$elements)
                    $cell.style.display = display;
            }

            if ( ! visible)
                continue;

            let gridRow = row.toString();
            for (let $cell of variableRow.$elements) {
                if ($cell.style.gridRowStart !== gridRow)
                    $cell.style.gridRowStart = gridRow;
            }

            if (this._topIndex === -1)
                this._topIndex = column.index;

            row += 1;
            if (column.columnType !== 'filter')
                finalColumnCount += 1;
        }

        if (row === 2) {
            this.$noMatches.style.display = '';
            this.statusbar.updateInfoLabel('selectedCount', 0);
        }
        else {
            this.$noMatches.style.display = 'none';
            let selectedCount = this._updateRowSelections();
            this.statusbar.updateInfoLabel('selectedCount', selectedCount);
        }

        this.$body.style.gridTemplateRows = `repeat(${row}, auto)`;
        this.statusbar.updateInfoLabel('columnCount', finalColumnCount);

        this._updateSearchHighlights();
    }

    // highlights the search matches using the CSS custom highlight API, which
    // paints ranges without modifying the DOM (so contenteditable editing of
    // the name and description is unaffected)
    _updateSearchHighlights() {
        if ( ! ('highlights' in CSS))
            return;

        let searchText = this.$search.value.toLowerCase();
        if (searchText === '') {
            CSS.highlights.delete(SEARCH_HIGHLIGHT);
            return;
        }

        let ranges: Range[] = [];
        let addMatches = ($el: HTMLElement) => {
            let node = $el.firstChild;
            if ( ! (node instanceof Text))
                return;
            let text = node.data;
            let lower = text.toLowerCase();
            if (lower.length !== text.length)  // lowercasing changed the offsets
                return;
            let index = lower.indexOf(searchText);
            while (index !== -1) {
                let range = new Range();
                range.setStart(node, index);
                range.setEnd(node, index + searchText.length);
                ranges.push(range);
                index = lower.indexOf(searchText, index + searchText.length);
            }
        };

        for (let row of this.rows) {
            if (row === undefined || ! row.visible)
                continue;
            addMatches(row.$name);
            addMatches(row.$description);
        }

        CSS.highlights.set(SEARCH_HIGHLIGHT, new Highlight(...ranges));
    }

    // returns the row only if it is currently shown (i.e. matches the search)
    _getRowByIndex(index: number) {
        let row = this.rows[index];
        if (row && row.visible)
            return row;
        return undefined;
    }

    _getRowById(id: number) {
        return this.rowsById.get(id);
    }

    async textElementFocus(event: Event) {
        if (event.target instanceof HTMLElement) {
            let $el = event.target;
            if ($el.hasAttribute('contenteditable') === false) {
                this.internalBluring = true;
                $el.blur();
                return;
            }

            if (this.internalFocus === false) {
                this.internalBluring = true;
                $el.blur();

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
                    this.internalFocus = true;
                    this._focusing = false;
                    $el.focus();
                    return;
                }
            }
        

            this.internalFocus = false;

            document.execCommand('selectAll', false, null);
            let column = this._getRowByIndex(parseInt($el.getAttribute('data-columnindex'))).column;
            this._editingColumn = column;
        }
    }

    textElementBlur(event: Event) {
        if (event.target instanceof HTMLElement) {
            let $el = event.target;
            let propertyName = $el.getAttribute('data-property');
            if (this.internalBluring === false) {
                let data = { };
                data[propertyName] = $el.textContent;
                let column = this._getRowByIndex(parseInt($el.getAttribute('data-columnindex'))).column;
                if (column[propertyName] !== data[propertyName])
                    this.model.changeColumn(column.id, data);
                window.clearTextSelection();
                this._editingColumn = null;
            }
            this.internalBluring = false;
        }
    }

    textElementKeyDown(event: KeyboardEvent) {
        if (event.target instanceof HTMLElement) {
            let $el = event.target;
            let propertyName = $el.getAttribute('data-property');
            let column = this._getRowByIndex(parseInt($el.getAttribute('data-columnindex'))).column;
            var keypressed = event.keyCode || event.which;
            if (keypressed === 13) { // enter key
                $el.blur();
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
                    const el = this.querySelector<HTMLInputElement>(`.selected > .${ propertyName }.text`);
                    el.focus();
                    el.select();
                }, 10);
                event.preventDefault();
                event.stopPropagation();
            }
            else if (keypressed === 27) { // escape key
                $el.textContent = column[propertyName];
                $el.blur();
                event.preventDefault();
                event.stopPropagation();
            }
        }
    }

    _addTextEvents($element: HTMLDivElement) {

        $element.addEventListener('focus', this.textElementFocus);

        $element.addEventListener('blur', this.textElementBlur);

        $element.addEventListener('keydown', this.textElementKeyDown);
    }

    _updateColumnColour(column, $dot: HTMLElement) {
        if (column.columnType === 'recoded') {
            let transform = this.model.getTransformById(column.transform);
            if (transform) {
                $dot.classList.remove('no-transform');
                $dot.style.backgroundColor = ColourPalette.get(transform.colourIndex);
                $dot.setAttribute('title', 'Transform: ' + transform.name);
            }
            else {
                $dot.classList.add('no-transform');
                $dot.style.backgroundColor = '#acacac';
                $dot.setAttribute('title', 'Transform: None');
            }
        }
        else if (column.columnType === 'computed') {
            $dot.style.backgroundColor = '#515151';
            $dot.setAttribute('title', 'Computed variable');
        }
    }

    _addSelectEvents($checkbox: HTMLInputElement) {
        $checkbox.addEventListener('change', (event: MouseEvent) => {
            let cloneEvent = cloneMouseEvent(event, { ctrlKey: true, metaKey: true, shiftKey: false, button: 0 })
            let colNo = parseInt($checkbox.getAttribute('data-index'));
            this._mouseDown(cloneEvent, colNo);
            this._mouseUp(cloneEvent);
        });

        $checkbox.addEventListener('mousedown', event => {
            event.stopPropagation();
            event.preventDefault();
        });

        $checkbox.addEventListener('mouseup', event => {
            event.stopPropagation();
            event.preventDefault();
        });
    }

    _createCell($contents: HTMLElement, row: number, column: number, classes: string, hasEvents: boolean, columnSpan=1) {
        if (columnSpan ===undefined)
            columnSpan = 1;
        let $cell = h('div', { role: 'none', class: `cell ${ classes }`, style: `grid-area: ${ row } / ${ column } / span 1 / span ${ columnSpan };` });
        if (hasEvents) {
            $cell.addEventListener('mouseover', event => {
                let id = parseInt($cell.getAttribute('data-id'));
                this._setHoverRow(this._getRowById(id) ?? null);
            });
            $cell.addEventListener('mousedown', event => {
                let colNo = parseInt($cell.getAttribute('data-index'));
                this._mouseDown(event, colNo);
            });
            $cell.addEventListener('dblclick', event => {
                let id = parseInt($cell.getAttribute('data-id'));
                if (this._editingColumn && this._editingColumn.id === id)
                    return;

                this._dblClicked = true;
                this.model.set('editingVar', [id]);
            });
        }
        $cell.append($contents);

        return $cell;
    }

    _mouseDown(event: MouseEvent, colNo: number) {
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

            let searchText = this.$search.value;
            if (searchText && left + 1 < right) {
                this._clickRangeList = [];
                let s = null;
                let e = null;
                for (let c = left; c <= right; c++) {
                    if (this._getRowByIndex(c)) {
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
    }

    _mouseUp(event: MouseEvent) {
        if (this.controller.focusedOn !== this)
            return;

        if ( ! this._mouseDownClicked && event.button === 2) {
            let element = document.elementFromPoint(event.clientX, event.clientY);
            let $element = element;
            let $cell = $element.closest('.cell');
            let index = this.model.get('columnCount');
            if ($cell)
                index = parseInt($cell.getAttribute('data-index'));
            this._mouseDown(event, index);
        }

        if (this._delayClear === true) {
            this.selection.clearSelectionList();
            this.selection.setSelections(this._clickRange, this._clickRangeList);
        }
        else if (! this._dragging)
            this.selection.resolveSelectionList(this);
        this._delayClear = false;
        this._dragging = false;

        this._mouseDownClicked = false;
    }

    _mouseMove(event: MouseEvent) {
        if (this.controller.focusedOn !== this)
            return;

        if (this._delayClear === true) {
            this._delayClear = false;
            this._dragging = true;
        }
    }

    _dataSetLoaded() {
        this._updateList();

        this._updateFilterInfo();
        this._updateEyeButton();
    }

    _columnsActiveChanged(event: ColumnActiveChangedEvent) {
        this._updateFilterInfo();
    }

    _columnsDeleted(event) {
        this._updateList();
        this._updateFilterInfo();
    }

    _transformsChanged(event) {


    }

    _columnsChanged(event) {

        let textChanged = false;
        for (let i = 0; i < event.changes.length; i++) {
            let change = event.changes[i];
            if (change.created)
                continue;

            let id = change.id;
            let row = this._getRowById(id);

            if (row) {
                if (change.nameChanged) {
                    row.$name.innerText = change.name;
                    textChanged = true;
                }

                if (change.descriptionChanged) {
                    row.$description.innerText = row.column.description;
                    textChanged = true;
                }

                if (change.measureTypeChanged)
                    row.$elements.forEach(el => el.setAttribute('data-measuretype', row.column.measureType));

                if (change.transformChanged && row.$dot)
                    this._updateColumnColour(row.column, row.$dot);
            }
        }

        // replacing the text replaces the text nodes the highlights refer to
        if (textChanged)
            this._updateSearchHighlights();
    }

    _columnsInserted(event) {
        this.$search.value = '';
        this._updateFilterInfo();
        this._updateList();
    }

    _notEditingKeyPress(event: KeyboardEvent) {
        if (event.altKey)
            return;

        if ((event.metaKey || event.ctrlKey) && ! (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown'))
            return;

        const dir = getComputedStyle(this).direction;

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
                    this.selection.moveCursor((dir === 'rtl' && event.key !== 'ArrowUp') ? 'forward' : 'back', event.shiftKey);
                event.preventDefault();
                break;
            case 'Tab':
                if (event.shiftKey)
                    this.selection.moveCursor(dir === 'rtl' ? 'forward' : 'back', false, true);
                else
                    this.selection.moveCursor(dir === 'rtl' ? 'back' : 'forward', false, true);
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
                    this.selection.moveCursor((dir === 'rtl' && event.key !== 'ArrowDown') ? 'back' : 'forward', event.shiftKey);
                event.preventDefault();
                break;
        }
    }
}

customElements.define('jmv-variablesview', VariablesView);

export default VariablesView;
