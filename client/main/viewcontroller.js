'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');
const host = require('./host');
const Notify = require('./notification');
const dialogs = require('dialogs')({cancel:false});
const { csvifyCells, htmlifyCells } = require('../common/utils/formatio');
const ActionHub = require('./actionhub');

class ViewController {
    constructor(model, selection) {
        Object.assign(this, Backbone.Events);
        this.model = model;
        this.selection = selection;

        this.selection.registerChangeEventHandler((oldSel, silent, ignoreTabStart) => {
            if ( !silent && this.model.get('editingVar') !== null) {
                this._updateEditingVarFromSelection(this.selection.hiddenIncluded);
            }

            this.enableDisableActions();
        });

        this.model.on('change:editingVar', event => {
            if (this.model._modifiedFromSelection)
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
        ActionHub.get('paste').on('request', this.pasteClipboardToSelection, this);
        ActionHub.get('undo').on('request', () => {
            this._undo();
        }, this);
        ActionHub.get('redo').on('request', () => {
            this._redo();
        }, this);

        ActionHub.get('insertRow').on('request', this._insertRows, this);
        ActionHub.get('appendRow').on('request', this._appendRows, this);
        ActionHub.get('appendVar').on('request', () => this._appendColumn('data'));
        ActionHub.get('appendComputed').on('request', () => this._appendColumn('computed'));
        ActionHub.get('appendRecoded').on('request', () => this._appendColumn('recoded'));
        ActionHub.get('appendOutput').on('request', () => this._appendColumn('output'));

        ActionHub.get('insertVar').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = 'data'; }, 'left'));
        ActionHub.get('insertComputed').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = 'computed'; }, 'left'));
        ActionHub.get('insertRecoded').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = 'recoded'; }, 'left'));
        ActionHub.get('insertOutput').on('request', () => this._insertFromSelectedColumns((item, column) => { item.columnType = 'output'; }, 'left'));
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
                        columnType: 'filter',
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
        let selection = { };
        for (let column of columns) {
            if (selection.colNo !== undefined) {
                if (column.index === selection.columnEnd + 1) {
                    selection.columnEnd += 1;
                    if (column.dIndex === selection.right + 1) {
                        selection.right += 1;
                    }
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
            await new Promise((resolve, reject) => {

                    keyboardJS.setContext('');

                    let cb = (result) => {
                        keyboardJS.setContext('controller');
                        if (result)
                            resolve();
                        else
                            reject();
                    };

                    let column = columns[0];
                    dialogs.confirm(n_(`Delete column '{columnName}'?`, 'Delete {n} columns?', columns.length, {columnName : column.name, n: columns.length }), cb);

                });

            let ids = columns.map(column => column.id);
            await this.model.deleteColumns(ids);
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
            await new Promise((resolve, reject) => {

                keyboardJS.setContext('');

                let cb = (result) => {
                    keyboardJS.setContext('controller');
                    if (result)
                        resolve();
                    else
                        reject();
                };

                dialogs.confirm(n_('Delete row {index}?', 'Delete {n} rows?', rowCount, { index: selections[0].top+1, n: rowCount }), cb);
            });
            await this.model.deleteRows(rowRanges);
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
        this.trigger('copying');
    }

    async pasteClipboardToSelection(content) {

        if (content === undefined)
            content = host.pasteFromClipboard();

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
            this.trigger('notification', notification);
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
                this.trigger('notification', notification);
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
        this.trigger('notification', this._editNote);
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
            await host.copyToClipboard({
                    text: csvifyCells(values),
                    html: htmlifyCells(values),
                });
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

    registerView(name, view) {
        this._views[name] = view;
    }

    focusView(name) {
        this.focusedOn = this._views[name];
        this.selection.hiddenIncluded = this.focusedOn.selectionIncludesHidden === true;
        if (this.model.attributes.hasDataSet)
            this.enableDisableActions();

        if (this.focusedOn.onViewControllerFocus)
            this.focusedOn.onViewControllerFocus();
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


        this.model._modifiedFromSelection = true;
        this.model.set('editingVar', ids);
        this.model._modifiedFromSelection = false;
    }

    _notEditingKeyPress(event) {

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
        else {
            switch(event.key) {
                case 'F3':
                    this._toggleVariableEditor();
                    event.preventDefault();
                    break;
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
            let n = await new Promise((resolve, reject) => {
                if (this.selection.subSelections.length > 0)
                    resolve(-1);
                else {
                    keyboardJS.setContext('');
                    dialogs.prompt(_('Insert how many rows?'), this.selection.bottom - this.selection.top + 1, (result) => {
                        keyboardJS.setContext('controller');
                        if (result === undefined)
                            reject('cancelled by user');
                        let n = parseInt(result);
                        if (isNaN(n) || n <= 0)
                            reject(_('{n} is not a positive integer', {n: result}));
                        else
                            resolve(n);
                    });
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
            let n = await new Promise((resolve, reject) => {
                keyboardJS.setContext('');
                dialogs.prompt(_('Append how many rows?'), '1', (result) => {
                    keyboardJS.setContext('controller');
                    if (result === undefined)
                        reject('cancelled by user');
                    let n = parseInt(result);
                    if (isNaN(n) || n <= 0)
                        reject(_('{n} is not a positive integer', {n:result}));
                    else
                        resolve(n);
                });

            });

            let rowStart = this.model.visibleRowCount();
            await this.model.insertRows([{ rowStart: rowStart, rowCount: n }]);
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

    findFirstVisibleColumn(index) {
        if (index === undefined)
            index = 0;
        let column = this.model.getColumn(index);
        while (column.hidden) {
            index += 1;
            column = this.model.getColumn(index);
        }
        return column;
    }

    async _appendColumn(columnType) {
        try {
            let rowNo = this.selection.rowNo;
            let colNo = this.model.visibleRealColumnCount();
            let column = this.model.getColumn(colNo, true);

            let args;
            if (columnType === 'data')
                args = { name: '', columnType: 'data', measureType: 'nominal' };
            else if (columnType === 'computed')
                args = { name: '', columnType: 'computed', measureType: 'continuous' };
            else if (columnType === 'recoded')
                args = { name: '', columnType: 'recoded', measureType: 'nominal' };
            else if (columnType === 'output')
                args = { name: '', columnType: 'output', measureType: 'continuous' };
            else
                args = { name: '', columnType: 'none', measureType: 'nominal' };

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

    _onColumnAppended(colNo) {
        this.trigger('columnAppended', colNo);
    }

    async _insertFromSelectedColumns(itemConstruction, direction) {
        if (direction === undefined)
            direction = 'right';

        let hiddenIncluded = this.selection.hiddenIncluded;

        let blocks = this.selection.selectionToColumnBlocks();

        let inserts = [];
        let emptyIds = [];
        for (let block of blocks) {
            for (let i = 0; i < block.right - block.left + 1; i++) {
                let column = this.model.getColumn(block.left + i, ! hiddenIncluded);
                if (column.columnType === 'none')
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

module.exports = ViewController;
