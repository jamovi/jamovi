'use strict';

import keyboardJS from 'keyboardjs';
import host from './host';
import Notify from './notification';
import _dialogs from 'dialogs';
const dialogs = _dialogs({cancel:false});
import { csvifyCells, htmlifyCells } from '../common/utils/formatio';

import ActionHub from './actionhub';

import focusLoop from '../common/focusloop';
import { EventEmitter } from 'tsee';
import DataSetViewModel, { Column, ColumnType, MeasureType } from './dataset';
import Selection, { ISelection } from './selection';
import Settings from './settings';

export type DataSetView = HTMLElement & {
    selectionIncludesHidden?: boolean;
    onEditingVarChanged?: (columns: Column[]) => void;
    onViewControllerFocus?: () => void;
    getFocusControl: () => HTMLElement;
    _notEditingKeyPress: (event: KeyboardEvent) => void;
}

class ViewController extends EventEmitter {
    model: DataSetViewModel;
    selection: Selection;
    _editNote: Notify;
    focusedOn: DataSetView;
    _modifiedFromSelection: boolean;
    _views: { [name: string]: { view: DataSetView, options: { title: string } }} = { };
    constructor(model, selection, public settings: Settings) {
        super();

        this.model = model;
        this.selection = selection;

        this.selection.registerChangeEventHandler((oldSel, silent, ignoreTabStart) => {
            if ( !silent && this.model.get('editingVar') !== null) {
                this._updateEditingVarFromSelection(this.selection.hiddenIncluded);
            }

            this.enableDisableActions();
        });

        this.model.on('change:editingVar', event => {
            if (this._modifiedFromSelection)
                return;

            let now  = this.model.getEditingColumns(! this.selection.hiddenIncluded);
            if (now !== null && now.length > 0) {
                if (this.focusedOn !== null && this.focusedOn.onEditingVarChanged) {
                    this.focusedOn.onEditingVarChanged(now);
                }
                else if (this.selection !== null)
                    this.selection.createSelectionsFromColumns(this.selection.rowNo, now);
            }
        });

        this.focusedOn = null;
        this._views = { };

        this._editNote = new Notify({ duration: 3000 });

        keyboardJS.setContext('controller');
        keyboardJS.bind('', event => this._notEditingKeyPress(event));

        this.model.on('dataSetLoaded', this._dataSetLoaded, this);
        this.model.on('change:changesCount change:changesPosition', event => this.enableDisableActions());

        ActionHub.get('delVar').on('request', () => this._deleteColumns());
        ActionHub.get('delRow').on('request', this._deleteRows, this);

        ActionHub.get('cut').on('request', this.cutSelectionToClipboard, this);
        ActionHub.get('copy').on('request', this.copySelectionToClipboard, this);
        ActionHub.get('paste').direct(this.pasteClipboardToSelection, this);
        ActionHub.get('undo').on('request', () => {
            this._undo();
        }, this);
        ActionHub.get('redo').on('request', () => {
            this._redo();
        }, this);

        ActionHub.get('insertRow').on('request', this._insertRows, this);
        ActionHub.get('appendRow').on('request', this._appendRows, this);
        ActionHub.get('appendVar').on('request', () => this._appendColumn(ColumnType.DATA));
        ActionHub.get('appendComputed').on('request', () => this._appendColumn(ColumnType.COMPUTED));
        ActionHub.get('appendRecoded').on('request', () => this._appendColumn(ColumnType.RECODED));
        ActionHub.get('appendOutput').on('request', () => this._appendColumn(ColumnType.OUTPUT));

        ActionHub.get('insertVar').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = ColumnType.DATA; }, 'left'));
        ActionHub.get('insertComputed').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = ColumnType.COMPUTED; }, 'left'));
        ActionHub.get('insertRecoded').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = ColumnType.RECODED; }, 'left'));
        ActionHub.get('insertOutput').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = ColumnType.OUTPUT; }, 'left'));
        ActionHub.get('compute').on('request', () => {
            this._insertFromSelectedColumns((item, column) => {
                item.columnType = ColumnType.COMPUTED;
            }, 'right');
        });
        ActionHub.get('transform').on('request', () => {
            this._insertFromSelectedColumns((item, column) => {
                item.columnType = ColumnType.RECODED;
                item.parentId = column.id;
            }, 'right');
        });

        ActionHub.get('toggleFilterVisible').on('request', () => {
            this.model.toggleFilterVisibility();
        });

        ActionHub.get('editFilters').on('request', this._toggleFilterEditor, this);

        ActionHub.get('editVar').on('request', this._toggleVariableEditor, this);
    }

    _toggleVariableEditor() {
        let editingIds = this.model.get('editingVar');
        let editingColumn = null;
        if (editingIds !== null)
            editingColumn = this.model.getColumnById(editingIds[0]);

        if (editingIds === null || (editingColumn.columnType === 'filter' && editingColumn.hidden)) {
            let columns = this.selection.currentSelectionToColumns();
            let ids = columns.map(x => x.id);
            this.model.set('editingVar', ids);
        }
        else
            this.model.set('editingVar', null);
    }

    showVariableEditor() {
        if ( ! this.model.get('editingVar')) {
            let columns = this.selection.currentSelectionToColumns();
            let ids = columns.map(x => x.id);
            this.model.set('editingVar', ids);
        }
    }

    enableDisableActions() {

        let selection = this.selection;

        if (selection === null)
            return;

        let dataSetBounds = {
            left: 0,
            right: this.model.visibleRealColumnCount() - 1,
            top: 0,
            bottom: this.model.visibleRowCount() - 1 };

        let column = this.model.getColumn(selection.colNo, true);

        let columns = this.selection.currentSelectionToColumns();
        let hasFilters = columns.some(a => a.columnType === 'filter');

        ActionHub.get('delRow').set('enabled', selection.top <= dataSetBounds.bottom);
        ActionHub.get('delVar').set('enabled', selection.left <= dataSetBounds.right);
        ActionHub.get('insertVar').set('enabled', selection.right <= dataSetBounds.right && hasFilters === false);
        ActionHub.get('insertComputed').set('enabled', selection.right <= dataSetBounds.right && hasFilters === false);
        ActionHub.get('insertRecoded').set('enabled',  selection.right <= dataSetBounds.right && hasFilters === false);
        ActionHub.get('insertOutput').set('enabled',  selection.right <= dataSetBounds.right && hasFilters === false);
        ActionHub.get('insertRow').set('enabled', selection.rowNo <= dataSetBounds.bottom);
        ActionHub.get('cut').set('enabled', hasFilters === false);
        ActionHub.get('paste').set('enabled', hasFilters === false);
        ActionHub.get('compute').set('enabled', hasFilters === false);
        ActionHub.get('transform').set('enabled', hasFilters === false);

        ActionHub.get('undo').set('enabled', this.model.attributes.changesPosition > 0);
        ActionHub.get('redo').set('enabled', this.model.attributes.changesPosition < (this.model.attributes.changesCount - 1));
        ActionHub.get('toggleFilterVisible').set('enabled', this.model.filterCount() > 0);
    }

    async _toggleFilterEditor() {
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
            else {
                try {
                    await this.model.insertColumn({
                        index: 0,
                        columnType: ColumnType.FILTER,
                        hidden: this.model.get('filtersVisible') === false
                    });
                    await this.model.set('editingVar', [this.model.getColumn(0).id]);
                }
                catch (error) {
                    this._notifyEditProblem({
                        title: error.message,
                        message: error.cause,
                        type: 'error',
                    });
                }
            }
        }
        else
            this.model.set('editingVar', null);
    }

    _dataSetLoaded() {
        this.selection.setSelection(0, 0);
    }

    async _deleteColumns() {

        let columns = this.selection.currentSelectionToColumns();
        let contains = (nextColumn) => {
            return columns.some(element => { return element.id === nextColumn.id; });
        };

        for (let i = 0; i < columns.length; i++) {
            if (columns[i].columnType === 'none') {
                columns.splice(i, 1);
                i -= 1;
            }
            else if (columns[i].columnType === 'filter') {
                let prevColumn = this.model.getColumn(columns[i].index - 1);
                if ( ! prevColumn || prevColumn.filterNo !== columns[i].filterNo) { // if a child filter just delete, if parent filter with children filters, delete all children as well
                    let index = columns[i].index;
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

        columns.sort((a, b) => a.index - b.index);

        let oldSelection = this.selection.clone();
        let oldSubSelections = this.selection.subSelections;

        let selections = [];
        let selection: ISelection = null;
        for (let column of columns) {
            if (selection !== null) {
                if (column.index === selection.columnEnd + 1) {
                    selection.columnEnd += 1;
                    if (column.dIndex === selection.right + 1) {
                        selection.right += 1;
                    }
                }
                else {
                    selections.push(selection);
                    selection = null;
                }
            }

            if (selection === null) {
                selection = {
                    rowNo: 0,
                    top: 0,
                    bottom: this.model.attributes.vRowCount - 1,
                    left: column.dIndex,
                    right: column.dIndex,
                    colNo: column.dIndex,
                    columnStart: column.index,
                    columnEnd: column.index,
                    columnPos: column.index
                };
                this.selection.applyKey(selection);
            }
        }

        try {
            await this.selection.setSelections(selection, selections);
            await new Promise<void>((resolve, reject) => {

                    let cb = (result) => {
                        let widget = document.body.querySelector<HTMLElement>('.dialog-widget.confirm');
                        focusLoop.leaveFocusLoop(widget);
                        if (result)
                            resolve();
                        else
                            reject();
                    };

                    let column = columns[0];
                    let msg = n_(`Delete column '{columnName}'?`, 'Delete {n} columns?', columns.length, {columnName : column.name, n: columns.length });
                    focusLoop.speakMessage(msg)
                    dialogs.confirm(msg, cb);
                    let widget = document.body.querySelector<HTMLElement>('.dialog-widget.confirm');
                    focusLoop.addFocusLoop(widget, { level: 2, modal: true });
                    focusLoop.enterFocusLoop(widget);
                });

            let ids = columns.map(column => column.id);
            await this.model.deleteColumns(ids);
            let column = columns[0];
            focusLoop.speakMessage(n_(`Column {columnName} deleted`, '{n} columns deleted', columns.length, {columnName : column.name, n: columns.length }));
            await this.selection.setSelections(oldSelection, oldSubSelections);
        }
        catch(error) {
            if (error)
                console.log(error);
            await this.selection.setSelections(oldSelection, oldSubSelections);
        }
    }

    async _deleteRows() {
        let oldSelection = this.selection.clone();
        let oldSubSelections = this.selection.subSelections;

        let selections = [];
        let rowCount = 0;
        let rowRanges = this.selection.currentSelectionToRowBlocks();
        rowRanges.sort((a, b) => a.rowStart - b.rowStart);
        for (let range of rowRanges) {
            selections.push({
                rowNo: range.rowStart,
                top: range.rowStart,
                bottom: range.rowStart + range.rowCount - 1,
                left: 0,
                right: this.model.attributes.vColumnCount - 1,
                colNo: 0
            });
            rowCount += range.rowCount;
        }

        try {
            await this.selection.setSelections(selections[0], selections.slice(1));
            await new Promise<void>((resolve, reject) => {

                let cb = (result) => {
                    let widget = document.body.querySelector<HTMLElement>('.dialog-widget.confirm');
                    focusLoop.leaveFocusLoop(widget);
                    if (result)
                        resolve();
                    else
                        reject();
                };

                let msg = n_('Delete row {index}?', 'Delete {n} rows?', rowCount, { index: selections[0].top+1, n: rowCount });
                focusLoop.speakMessage(msg);
                dialogs.confirm(msg, cb);
                let widget = document.body.querySelector<HTMLElement>('.dialog-widget.confirm');
                focusLoop.addFocusLoop(widget, { level: 2, modal: true });
                focusLoop.enterFocusLoop(widget);
            });
            await this.model.deleteRows(rowRanges);
            focusLoop.speakMessage(n_('row {index} deleted.', '{n} rows deleted.', rowCount, { index: selections[0].top+1, n: rowCount }));
            await this.selection.setSelections(oldSelection, oldSubSelections);
        }
        catch(error) {
            if (error) {
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            }
            await this.selection.setSelections(oldSelection, oldSubSelections);
        }
    }

    _notifyCopying() {
        this.emit('copying');
    }

    async pasteClipboardToSelection(source, content) {

        if (content === undefined)
            content = host.pasteFromClipboard();

        if (content === null) {
            let notification = new Notify({
                title: _('Paste is unavailable using the menus'),
                message: _('Please use ctrl-v to paste into the spreadsheet.'),
                duration: 4000,
            });
            this.emit('notification', notification);
            return;
        }

        if ( ! (content.html || content.text))
            content = await content;

        let text = content.text;
        let html = content.html;

        if (text.trim() === '' && html.trim() === '')
            return;

        if ((text.length + html.length) > (9 * 1024 * 1024)) {
            let notification = new Notify({
                title: _('Unable to paste'),
                message: _('Too much data, use import instead'),
                duration: 4000,
            });
            this.emit('notification', notification);
            return;
        }

        try {
            let data = await this.model.changeCells(text, html, this.selection, this.selection.subSelections);
            let selections = this.selection.convertAreaDataToSelections(data.data);

            selections[0].colFocus = selections[0].left;
            selections[0].rowFocus = selections[0].top;
            this.selection.setSelections(selections[0], selections.slice(1));

            this._notifyCopying();
        }
        catch (error) {
            if (error) {
                let notification = new Notify({
                    title: error.message,
                    message: error.cause,
                    duration: 4000,
                });
                this.emit('notification', notification);
            }
        }
    }

    async _undo() {
        try {
            let events = await this.model.undo();
            this.selection.undoRedoDataToSelection(events);
        }
        catch (error) {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        }
    }

    async _redo() {
        try {
            let events = await this.model.redo();
            this.selection.undoRedoDataToSelection(events);
        }
        catch(error) {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        }
    }

    _notifyEditProblem(details) {
        this._editNote.set(details);
        this.emit('notification', this._editNote);
    }

    async cutSelectionToClipboard() {
        await this.copySelectionToClipboard();
        this.selection.applyValuesToSelection([this.selection], null);
    }

    async copySelectionToClipboard() {
        try {
            let cells = await this.model.requestCells(this.selection);
            let values = cells.data[0].values;
            values = values.map(col => col.map(cell => cell.value));
            let data = { text: csvifyCells(values, this.settings.getSetting('decSymbol', '.')), html: htmlifyCells(values, { decSymbol: this.settings.getSetting('decSymbol', '.') }) };

            await host.copyToClipboard(data);
            this._notifyCopying();
        }
        catch(error) {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        }
    }

    registerView(name: string, view: DataSetView, options: { title: string }) {
        this._views[name] = { view, options };
    }

    focusView(name: string) {
        if (this.focusedOn)
            this.focusedOn.setAttribute('aria-hidden', 'true');

        this.focusedOn = this._views[name].view;

        this.selection.hiddenIncluded = this.focusedOn.selectionIncludesHidden === true;
        if (this.model.attributes.hasDataSet)
            this.enableDisableActions();

        if (this.focusedOn.onViewControllerFocus)
            this.focusedOn.onViewControllerFocus();

        if (this.focusedOn) {
            if (this._views[name].options.title)
                focusLoop.speakMessage(this._views[name].options.title);
            this.focusedOn.setAttribute('aria-hidden', 'false');
            focusLoop.setDefaultFocusControl(this.focusedOn.getFocusControl());
            
        }

    }

    _updateEditingVarFromSelection(allowHidden) {
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

        let left = this.selection.left;
        let right = this.selection.right;
        if (allowHidden) {
            left = this.selection.columnStart;
            right = this.selection.columnEnd;
        }

        for (let c = left; c <= right; c++) {
            let column = this.model.getColumn(c, ! allowHidden);
            countType(column);
            ids.push(column.id);
        }

        for (let selection of this.selection.subSelections) {
            let left = selection.left;
            let right = selection.right;
            if (allowHidden) {
                left = selection.columnStart;
                right = selection.columnEnd;
            }
            for (let c = left; c <= right; c++) {
                let column = this.model.getColumn(c, ! allowHidden);
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
    }

    _notEditingKeyPress(event: KeyboardEvent) {

        if (this.focusedOn._notEditingKeyPress && this.focusedOn._notEditingKeyPress(event))
            return;

        if (event.ctrlKey || event.metaKey) {
            if (event.key.toLowerCase() === 'a') {
                this.selection.selectAll();
                event.preventDefault();
            }
            else if (event.key.toLowerCase() === 'z') {
                if (event.shiftKey)
                    this._redo();
                else
                    this._undo();
                event.preventDefault();
            }
            else if (event.key.toLowerCase() === 'y') {
                this._redo();
                event.preventDefault();
            }
        }
    }

    async _insertRows() {

        let oldSelection = this.selection.clone();
        let oldSubSelections = this.selection.subSelections;

        let selections = [];
        let rowCount = 0;
        let rowRanges = this.selection.currentSelectionToRowBlocks();
        rowRanges.sort((a, b) => a.rowStart - b.rowStart);
        for (let range of rowRanges) {
            selections.push({
                rowNo: range.rowStart,
                top: range.rowStart,
                bottom: range.rowStart + range.rowCount - 1,
                left: 0,
                right: this.model.attributes.vColumnCount - 1,
                colNo: 0
            });
            rowCount += range.rowCount;
        }
        try {
            let n = await new Promise<number>((resolve, reject) => {
                if (this.selection.subSelections.length > 0)
                    resolve(-1);
                else {
                    let msg = _('Insert how many rows?');
                    focusLoop.speakMessage(msg);
                    dialogs.prompt(msg, this.selection.bottom - this.selection.top + 1, (result) => {
                        let widget = document.body.querySelector<HTMLElement>('.dialog-widget.prompt');
                        focusLoop.leaveFocusLoop(widget);
                        if (result === undefined)
                            reject('cancelled by user');
                        let n = parseInt(result);
                        if (isNaN(n) || n <= 0)
                            reject(_('{n} is not a positive integer', {n: result}));
                        else
                            resolve(n);
                    });
                    let widget = document.body.querySelector<HTMLElement>('.dialog-widget.prompt');
                    focusLoop.addFocusLoop(widget, { level: 2, modal: true });
                    focusLoop.enterFocusLoop(widget);
                }
            });

            let ranges = [{ rowStart: this.selection.top, rowCount: n }];
            if (n === -1) {
                ranges[0].rowCount = this.selection.bottom - this.selection.top + 1;
                for (let selection of this.selection.subSelections) {
                    ranges.push({ rowStart: selection.top, rowCount: selection.bottom - selection.top + 1});
                }
            }

            await this.model.insertRows(ranges);
            focusLoop.speakMessage(n_('One row inserted.', '{n} rows inserted.', n, { n }));
        }
        catch(error) {
            if (error) {
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            }
        }
    }

    async _appendRows() {
        try {
            let n = await new Promise<number>((resolve, reject) => {
                let msg = _('Append how many rows?');
                focusLoop.speakMessage(msg);
                dialogs.prompt(msg, '1', (result) => {
                    let widget = document.body.querySelector<HTMLElement>('.dialog-widget.prompt');
                    focusLoop.leaveFocusLoop(widget);
                    if (result === undefined)
                        reject('cancelled by user');
                    let n = parseInt(result);
                    if (isNaN(n) || n <= 0)
                        reject(_('{n} is not a positive integer', {n:result}));
                    else
                        resolve(n);

                });
                let widget = document.body.querySelector<HTMLElement>('.dialog-widget.prompt');
                focusLoop.addFocusLoop(widget, { level: 2, modal: true });
                focusLoop.enterFocusLoop(widget);
            });

            let rowStart = this.model.visibleRowCount();
            await this.model.insertRows([{ rowStart: rowStart, rowCount: n }]);
            focusLoop.speakMessage(n_('One row appended.', '{n} rows appended.', n, { n }));
        }
        catch(error) {
            if (error) {
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            }
        }
    }

    findFirstVisibleColumn(index?: number) {
        if (index === undefined)
            index = 0;
        let column = this.model.getColumn(index);
        while (column.hidden) {
            index += 1;
            column = this.model.getColumn(index);
        }
        return column;
    }

    async _appendColumn(columnType: ColumnType) {
        try {
            let rowNo = this.selection.rowNo;
            let colNo = this.model.visibleRealColumnCount();
            let column = this.model.getColumn(colNo, true);

            let args;
            if (columnType === ColumnType.DATA)
                args = { name: '', columnType: ColumnType.DATA, measureType: MeasureType.NOMINAL };
            else if (columnType === ColumnType.COMPUTED)
                args = { name: '', columnType: ColumnType.COMPUTED, measureType: MeasureType.CONTINUOUS };
            else if (columnType === ColumnType.RECODED)
                args = { name: '', columnType: ColumnType.RECODED, measureType: MeasureType.NOMINAL };
            else if (columnType === ColumnType.OUTPUT)
                args = { name: '', columnType: ColumnType.OUTPUT, measureType: MeasureType.CONTINUOUS };
            else
                args = { name: '', columnType: ColumnType.NONE, measureType: MeasureType.NOMINAL };

            await this.model.changeColumn(column.id, args);
            await this.selection.setSelection(rowNo, colNo);
            await this._onColumnAppended(colNo);
        }
        catch (error) {
            if (error) {
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            }
        }
    }

    _onColumnAppended(colNo: number) {
        this.emit('columnAppended', colNo);
    }

    async _insertFromSelectedColumns(itemConstruction: (props: any, column: Column) => void, direction: 'right' | 'left') {
        if (direction === undefined)
            direction = 'right';

        let hiddenIncluded = this.selection.hiddenIncluded;

        let blocks = this.selection.selectionToColumnBlocks();

        let inserts = [];
        let emptyIds = [];
        for (let block of blocks) {
            for (let i = 0; i < block.right - block.left + 1; i++) {
                let column = this.model.getColumn(block.left + i, ! hiddenIncluded);
                if (column.columnType === ColumnType.NONE)
                    emptyIds.push(column.id);
                else {
                    let props = { index: block[direction] + (direction === 'right' ? 1 : 0) };
                    itemConstruction(props, column);
                    inserts.push(props);
                }
            }
        }

        try {
            if (emptyIds.length > 0) {
                let pairs = [];
                for (let id of emptyIds) {
                    let item = { };
                    itemConstruction(item, this.model.getColumnById(id));
                    pairs.push({ id: id, values: item });
                }
                await this.model.changeColumns(pairs);
            }

            if (inserts.length > 0) {
                let data = await this.model.insertColumn(inserts, ! hiddenIncluded);
                let ids = data.ids.concat(emptyIds);
                this.model.set('editingVar', ids);
            }
        }
        catch (error) {
            if (error) {
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            }
        }
    }
}

export default ViewController;
