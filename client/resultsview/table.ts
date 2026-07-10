'use strict';

import { determFormat, format } from '../common/formatting';
import interactionManager from '../common/interactionmanager';

import Elem, { ElementModel } from './element';
import { AnalysisStatus } from './create';
import { h, htmlTrusted, rich, richParagraphs, setRich } from '../common/htmlelementcreator';

const SUPSCRIPTS = ["\u1D43", "\u1D47", "\u1D48", "\u1D49", "\u1DA0", "\u1D4D", "\u02B0", "\u2071",
                "\u02B2", "\u1D4F", "\u02E1", "\u1D50", "\u207F", "\u1D52", "\u1D56", "\u02B3", "\u02E2",
                "\u1D57", "\u1D58", "\u1D5B", "\u02B7", "\u02E3", "\u02B8", "\u1DBB"];

const Format = {
    BEGIN_GROUP: 1,
    END_GROUP: 2,
    NEGATIVE: 4,
    INDENTED: 8,
};

const extractCellValue = function(cellPB) {
    if (cellPB.cellType === 'o')
        return null;
    else
        return cellPB[cellPB.cellType];
};

const createSortTransform = function(column, dir) {

    let trans = new Array(column.cells.length);

    let sortBy;
    if (column.hasSortKeys)
        sortBy = (a, b) => a.sortKey - b.sortKey;
    else
        sortBy = (a, b) => extractCellValue(a) - extractCellValue(b);

    let i = 0;
    let cells = column.cells.slice().sort(sortBy);
    for (let cell of cells) {
        let index = column.cells.indexOf(cell);
        trans[i++] = index;
    }

    if (dir === 'desc')
        trans = trans.reverse();

    return trans;
};

enum CellValueOther {
    MISSING = 0,
    NOT_A_NUMBER = 1
}

interface ITableCell {
    cellType: 'i' | 'd' | 's' | 'o';

    format: number; // bit field

    // 1 = begin group
    // 2 = end group
    // 4 = negative (red highlight)

    footnotes: string[];
    symbols: string[];
    sortKey: number;
}

interface IntegerCell extends ITableCell {
    i: number;
}

const isIntegerCell = function(obj: ITableCell) : obj is IntegerCell {
    return obj && obj.cellType === 'i';
}

interface NumberCell extends ITableCell {
    d: number;
}

const isNumberCell = function(obj: ITableCell) : obj is NumberCell {
    return obj && obj.cellType === 'd';
}

interface StringCell extends ITableCell {
    s: string;
}

const isStringCell = function(obj: ITableCell) : obj is StringCell {
    return obj && obj.cellType === 's';
}

interface OtherCell extends ITableCell {
    o: CellValueOther;
}

const isOtherCell = function(obj: ITableCell) : obj is OtherCell {
    return obj && obj.cellType === 'o';
}

enum Visible {
    DEFAULT_YES = 0,
    DEFAULT_NO = 1,
    YES = 2,
    NO = 3
}

interface ITableColumn {
    name: string;
    title: string;
    type: string;
    format: string;
    superTitle: string;
    combineBelow: boolean;

    cells: ITableCell[];

    sortable: boolean;
    hasSortKeys: boolean;
    visible: Visible;
}

interface TableNote {
    key: string;
    note: string;
    init: boolean;
}

interface TableSort {
    sortBy: string;
    sortDesc: boolean;
}

export interface ITableElementData {
    columns : ITableColumn[];
    rowNames: string[];
    swapRowsColumns: boolean;
    notes: TableNote[];
    asText: string;
    rowSelect: string;
    rowSelected: number;
    sortSelect: string;
    sortSelected: TableSort;
}

export interface TableModel extends ElementModel<ITableElementData> {
    //asText: string,
    sortedCells? : ITableCell[][ ],
    sortTransform?: number[ ]
}

export class Model extends Elem.Model<TableModel> {
    constructor(data?: TableModel) {
        super(data || {
            name:  'name',
            title: '(no title)',
            element : {
                columns : [ ],
                rowNames: [],
                swapRowsColumns: false,
                notes: [],
                asText: '',
                rowSelect: '',
                rowSelected: 0,
                sortSelect: '',
                sortSelected: null
            },
            error: null,
            status: AnalysisStatus.ANALYSIS_COMPLETE,
            //asText: null,
            sortedCells : [ ],
            sortTransform: [ ],
            options: { },
            stale: false,
        });

        this.initialize();
    }

    initialize() {

        let table = this.attributes.element;
        let cells = table.columns.map(column => column.cells);

        if (table.sortSelected) {

            let sortBy = table.sortSelected.sortBy;
            let sortDesc = table.sortSelected.sortDesc;

            this.sort(sortBy, sortDesc ? 'desc' : 'asc');

        } else {

            if (cells.length > 0 && cells[0].length > 0) {
                let trans: number[] = new Array(cells[0].length);
                for (let i = 0; i < trans.length; i++)
                    trans[i] = i;
                this.set('sortTransform', trans);
            }

            this.set('sortedCells', cells);
        }
    }

    sort(by, dir) {

        let table = this.attributes.element;

        let column = null;
        for (let c of table.columns) {
            if (c.name === by) {
                column = c;
                break;
            }
        }
        if (column === null)
            throw 'no such column';

        table.sortSelected = { sortBy: by, sortDesc: dir === 'desc' };

        let trans = createSortTransform(column, dir);
        this.set('sortTransform', trans);

        let oldColumns = table.columns;
        let newColumns = new Array(oldColumns.length);

        for (let i = 0; i < oldColumns.length; i++) {
            let oldColumn = oldColumns[i];
            let newColumn = new Array(trans.length);
            for (let j = 0; j < trans.length; j++)
                newColumn[j] = oldColumn.cells[trans[j]];
            newColumns[i] = newColumn;
        }

        this.set('sortedCells', newColumns);

        window.setOption(table.sortSelect, { sortBy: by, sortDesc: dir === 'desc' });
    }
}

const isVis = function(column: ITableColumn) {
    return column.visible === 0 || column.visible === 2;
};

const trustedContent = function(html: string): ChildNode[] {
    const wrapper = htmlTrusted<HTMLDivElement>(`<div>${html}</div>`);
    return Array.from(wrapper.childNodes);
};

const appendTableRichContent = function(element: Element, content: string) {
    if (content === '')
        element.append('\u00a0');
    else
        element.append(rich(content));
};

export class View extends Elem.View<Model> {
    $table: HTMLTableElement;
    $titleCell: HTMLTableCaptionElement;
    $tableHeader: HTMLTableSectionElement;
    $titleText: HTMLSpanElement;
    $status: HTMLDivElement;
    $columnHeaderRow: HTMLTableRowElement;
    $columnHeaderRowSuper: HTMLTableRowElement | null;
    $tableBody: HTMLTableSectionElement;
    $tableFooter: HTMLTableSectionElement;
    _ascButtons: NodeListOf<Element>;
    _descButtons: NodeListOf<Element>;
    _trs: NodeListOf<Element>;

    constructor(model: Model, data) {
        super(model, data, true);


        this.onSortClick = this.onSortClick.bind(this);
        this.onRowSelect = this.onRowSelect.bind(this);

        this.classList.add('jmv-results-table');

        let table = this.model.attributes.element;

        let rowSelectable = table.rowSelect ? ' row-selectable' : '';

        let titleId = interactionManager.nextAriaId('label');
        this.$table = h('table', { 'aria-labelledby': titleId, class: `jmv-results-table-table${rowSelectable}` });

        this.addContent(this.$table);

        this.$titleCell = h('caption', { class: 'jmv-results-table-title-cell', scope: 'col', colspan: '1' });
        this.$table.prepend(this.$titleCell);
        this.$tableHeader = h('thead');
        this.$table.append(this.$tableHeader);

        this.$titleText = h('span', { id: titleId, class: 'jmv-results-table-title-text' });
        this.$titleCell.append(this.$titleText);
        this.$status = h('div', { class: 'jmv-results-table-status-indicator' });
        this.$titleCell.append(this.$status);

        this.$columnHeaderRow = h('tr', { class: 'jmv-results-table-header-row-main' });
        this.$tableHeader.append(this.$columnHeaderRow);

        this.$tableBody   = h('tbody');
        this.$table.append(this.$tableBody);
        this.$tableFooter = h('tfoot');
        this.$table.append(this.$tableFooter);

        this._ascButtons = this.$tableHeader.querySelectorAll('button.sort-asc');
        this._descButtons = this.$tableHeader.querySelectorAll('button.sort-desc');
        this._trs = this.$tableBody.querySelectorAll('tr');

        this.model.on('change:sortedCells', () => this.render());
        this.refs._refTable.addEventListener('changed', () => this.render());

        this.setFocusElement(this.$table);
        this.render();
    }

    type() {
        return 'Table';
    }

    label() {
        return _('Table');
    }

    render() {

        super.render();

        let table = this.model.attributes.element;
        let columns = table.columns;
        let sortedCells = this.model.attributes.sortedCells;
        let fnIndices = { };
        let footnotes = [ ];

        this._ascButtons.forEach(el => el.removeEventListener('click', this.onSortClick));
        this._descButtons.forEach(el => el.removeEventListener('click', this.onSortClick));
        this._trs.forEach(el => el.removeEventListener('click', this.onRowSelect));

        if (this.model.attributes.status === 1)
            this.classList.add('jmv-results-status-inited');
        else if (this.model.attributes.status === 2)
            this.classList.add('jmv-results-status-running');
        else {
            this.classList.remove('jmv-results-status-inited');
            this.classList.remove('jmv-results-status-running');
        }

        if (this.model.attributes.title)
            setRich(this.$titleText, this.model.attributes.title);

        let columnCount = 0;
        let rowCount = 0;

        for (let column of columns) {
            if (isVis(column))
                columnCount++;
        }

        if (columns.length > 0)
            rowCount = columns[0].cells.length;

        let hasSuperHeader = false;
        for (let column of columns) {
            if (isVis(column) && column.superTitle) {
                hasSuperHeader = true;
                break;
            }
        }

        let cells = {
            header  : new Array(columnCount),
            superHeader : new Array(columnCount),
            body : new Array(rowCount)
        };

        let formattings = new Array(columnCount);

        let colNo = 0;
        let colIndex = -1;
        for (let column of columns) {
            colIndex += 1;
            if ( ! isVis(column))
                continue;

            let classes = '';
            let format = column.format.split(',');
            if (format.includes('narrow'))
                classes += ' jmv-results-table-cell-format-narrow';

            let name = column.name;
            let title = name;
            if ('title' in column)
                title = column.title;

            let sortable = column.sortable ? true : false;

            cells.header[colNo] = { name : name, value : column.title, renderMode: 'rich', colIndex: colIndex, type: column.type, classes : classes, sortable : sortable };

            if (column.superTitle)
                cells.superHeader[colNo] = { value : column.superTitle, classes : '' };

            let values = column.cells.map(v => v.d);
            formattings[colNo] = determFormat(values, column.type, column.format, this.fmt);

            colNo++;
        }

        for (let rowNo = 0; rowNo < rowCount; rowNo++) {

            cells.body[rowNo] = new Array(columnCount);

            if (columns.length === 0)
                break;

            let rowFormat = '';

            let colNo = 0;
            for (let sourceColNo = 0; sourceColNo < columns.length; sourceColNo++) {
                let sourceColumn = columns[sourceColNo];
                let sourceCells = sortedCells[sourceColNo];
                if ( ! isVis(sourceColumn))
                    continue;

                let sourceCell = sourceCells[rowNo];

                let cell = { value : null, renderMode: 'plain', type: sourceColumn.type, superTitle: sourceColumn.superTitle, colIndex: sourceColNo, classes : rowFormat, sups : '' };

                if (sourceCell.format & Format.NEGATIVE)
                    cell.classes += ' jmv-results-table-cell-negative';

                if (sourceCell.format & Format.INDENTED)
                    cell.classes += ' jmv-results-table-cell-indented';

                if ((sourceCell.format & Format.BEGIN_GROUP) === Format.BEGIN_GROUP)
                    cell.beginGroup = true;

                cell.visible = isVis(sourceColumn);

                if (sourceColumn.combineBelow)
                    cell.combineBelow = true;

                for (let symbol of sourceCell.symbols)
                    cell.sups += symbol;

                for (let i = 0; i < sourceCell.footnotes.length; i++) {
                    let footnote = sourceCell.footnotes[i];
                    let index = fnIndices[footnote];
                    if (index === undefined) {
                        index = Object.keys(fnIndices).length;
                        fnIndices[footnote] = index;
                        footnotes[index] = footnote;
                    }
                    cell.sups += SUPSCRIPTS[index];
                }

                if (isIntegerCell(sourceCell)) {
                    cell.value = sourceCell.i;
                    cell.renderMode = 'plain';
                }
                else if (isNumberCell(sourceCell)) {
                    let value = format(sourceCell.d, formattings[colNo]);
                    value = value.replace(/-/g , "\u2212").replace(/ /g,'<span style="visibility: hidden ;">0</span>');
                    cell.value = value;
                    cell.renderMode = 'trusted';
                }
                else if (isStringCell(sourceCell)) {
                    cell.value = sourceCell.s;
                    cell.renderMode = 'rich';
                }
                else if (isOtherCell(sourceCell)) {
                    if (sourceCell.o === CellValueOther.MISSING)
                        cell.value = '.';
                    else
                        cell.value = 'NaN';
                    cell.renderMode = 'plain';
                }
                else {
                    throw new Error('Unknow cell type.');
                }

                cell.classes += this.makeFormatClasses(sourceColumn);

                cells.body[rowNo][colNo] = cell;

                colNo++;
            }
        }

        let rowPlan = {};
        let foldedNames = [];
        let nFolds = 1;
        colNo = 0;

        for (let column of columns) {
            if ( ! isVis(column))
                continue;
            let columnName = column.name;
            let foldedName = columnName;
            let index = foldedName.indexOf('[');
            if (index !== -1)
                foldedName = foldedName.substring(0, index);

            if (foldedName in rowPlan) {
                let folds = rowPlan[foldedName];
                folds.push(colNo);
                nFolds = Math.max(nFolds, folds.length);
            }
            else {
                foldedNames.push(foldedName);
                rowPlan[foldedName] = [ colNo ];
            }
            colNo++;
        }

        if (nFolds > 1) {

            let newColumnCount = foldedNames.length;
            let newRowCount = rowCount * nFolds;

            let folded = {
                header : new Array(newColumnCount),
                superHeader: new Array(newColumnCount),
                body   : new Array(newRowCount)
            };

            for (let colNo = 0; colNo < newColumnCount; colNo++) {
                let foldedName = foldedNames[colNo];
                let foldedIndices = rowPlan[foldedName];
                for (let index of foldedIndices) {
                    let header = cells.header[index];
                    folded.header[colNo] = header;
                    folded.superHeader[colNo] = cells.superHeader[index];
                    if (header.visible)
                        break;
                }
            }

            for (let rowNo = 0; rowNo < newRowCount; rowNo++)
                folded.body[rowNo] = new Array(newColumnCount);

            for (let rowNo = 0; rowNo < rowCount; rowNo++) {
                for (let colNo = 0; colNo < newColumnCount; colNo++) {
                    let foldedName = foldedNames[colNo];
                    let foldedIndices = rowPlan[foldedName];
                    for (let fold = 0; fold < foldedIndices.length; fold++) {
                        let index = foldedIndices[fold];
                        let row = folded.body[rowNo * nFolds + fold];
                        let cell = cells.body[rowNo][index];
                        row[colNo] = cell;
                    }
                }
            }

            // add spacing around the folds

            for (let rowNo = 0; rowNo < folded.body.length; rowNo += nFolds) {
                let row = folded.body[rowNo];
                for (let colNo = 0; colNo < row.length; colNo++) {
                    let cell = row[colNo];
                    if (cell)
                        cell.beginGroup = true;
                }
            }

            cells.header = folded.header;
            cells.superHeader = folded.superHeader;
            cells.body = folded.body;
        }

        for (let rowNo = 0; rowNo < cells.body.length; rowNo++) {
            let row = cells.body[rowNo];
            let first = row[0];
            if (first && first.beginGroup) {
                for (let colNo = 1; colNo < row.length; colNo++) {
                    let cell = row[colNo];
                    if (cell)
                        cell.beginGroup = true;
                }
            }
        }

        if (cells.body.length > 1 && cells.body[0].length > 0) {

            for (let colNo = 0; colNo < cells.body[0].length; colNo++) {
                if ( ! cells.body[0][colNo].combineBelow)
                    continue;

                let lastValue = '';

                for (let rowNo = 0; rowNo < cells.body.length; rowNo++) {
                    let cell = cells.body[rowNo][colNo];
                    if (cell === undefined)
                        continue;
                    let nowValue = cell.value;
                    if (cell.value === lastValue) {
                        cell.value = '';
                        cell.sups = '';
                    }
                    else {
                        lastValue = nowValue;
                    }
                }
            }
        }

        if (table.swapRowsColumns) {
            let swapped = {
                header : new Array(cells.body.length + 1),
                body   : new Array(cells.header.length - 1)
            };
            //fix header
            swapped.header[0] = cells.header[0];
            for (let rowNo = 0; rowNo < cells.body.length; rowNo++) {
                swapped.header[rowNo+1] = cells.body[rowNo][0];
                swapped.header[rowNo+1].classes = "";
            }
            //fix cols
            for (let colNo = 0; colNo < cells.header.length - 1; colNo++) {
                swapped.body[colNo] = new Array(cells.body.length + 1);
                let cell = cells.header[colNo + 1];
                cell.sups = '';
                swapped.body[colNo][0] = cell;
            }
            //fix body
            for (let rowNo = 0; rowNo < swapped.body.length; rowNo++) {
                for (let colNo = 1; colNo < swapped.body[rowNo].length; colNo++)
                    swapped.body[rowNo][colNo] = cells.body[colNo - 1][rowNo + 1];
            }

            cells.header = swapped.header;
            cells.body = swapped.body;
        }

        if (hasSuperHeader) {

            let span = 1;
            let superHeaderCells: HTMLTableCellElement[] = [];
            for (let i = 0; i < cells.superHeader.length; i++) {
                let head = cells.superHeader[i];

                let nextHead = null;
                let nextContent = null;
                if (i < cells.superHeader.length - 1) {
                    nextHead = cells.superHeader[i+1];
                    nextContent = '';
                    if (typeof(nextHead) !== 'undefined')
                        nextContent = nextHead.value;
                }

                let content = '';
                if (typeof(head) !== 'undefined')
                    content = head.value;

                if (content == nextContent) {
                    span++;
                }
                else {
                    let cell = h('th', { scope: 'colgroup', class: 'jmv-results-table-cell', colspan: span.toString() });
                    appendTableRichContent(cell, content);
                    superHeaderCells.push(cell);
                    span = 1;
                }
            }

            if ( ! this.$columnHeaderRowSuper) {
                this.$columnHeaderRowSuper = h('tr', { class: 'jmv-results-table-header-row-super' });
                this.$tableHeader.prepend(this.$columnHeaderRowSuper);
            }
            this.$columnHeaderRowSuper.replaceChildren(...superHeaderCells);
        }
        else if (this.$columnHeaderRowSuper) {
            this.$columnHeaderRowSuper.remove();
            this.$columnHeaderRowSuper = null;
        }


        let headerCells: HTMLTableCellElement[] = [];
        for (let head of cells.header) {
            let content = head.value;
            let classes = head.classes;
            let headerCell = h('th', { scope: 'col', class: 'jmv-results-table-cell' + classes });
            appendTableRichContent(headerCell, content);

            if (head.sortable) {
                let asc = 'sort-asc';
                let desc = 'sort-desc';
                if (table.sortSelected && head.name === table.sortSelected.sortBy) {
                    if (table.sortSelected.sortDesc)
                        desc = 'sorted-desc';
                    else
                        asc = 'sorted-asc';
                }
                headerCell.append(
                    h('button', { 'aria-label': 'Sort Column - Ascending', class: asc, 'data-name': head.name, 'data-sort': 'asc' }),
                    h('button', { 'aria-label': 'Sort Column - decending', class: desc, 'data-name': head.name, 'data-sort': 'desc' }));
            }
            headerCells.push(headerCell);
        }

        this.$columnHeaderRow.replaceChildren(...headerCells);

        if (cells.header.length === 0) {
            this.$titleCell.setAttribute('colspan', '1');
            this.$titleCell.setAttribute('scope', 'col');
            return;
        }

        let nPhysCols = cells.header.length;

        if (cells.body.length === 0 || cells.body[0].length === 0) {
            this.$titleCell.setAttribute('colspan', nPhysCols.toString());
            if (nPhysCols > 1)
                this.$titleCell.setAttribute('scope', 'colgroup');
            else
                this.$titleCell.setAttribute('scope', 'col');

            this.$tableBody.replaceChildren(h('tr', {}, h('td', { colspan: nPhysCols.toString() }, '\u00a0')));
            return;
        }

        this.$titleCell.setAttribute('colspan', nPhysCols.toString());
        if (nPhysCols > 1)
            this.$titleCell.setAttribute('scope', 'colgroup');
        else
            this.$titleCell.setAttribute('scope', 'col');

        let rowHeadingCount = this.determineRowHeaderCount(cells);
        let bodyRows: HTMLTableRowElement[] = [];
        for (let rowNo = 0; rowNo < cells.body.length; rowNo++) {

            let rowCells: HTMLTableCellElement[] = [];
            for (let colNo = 0; colNo < cells.body[rowNo].length; colNo++) {

                let cell = cells.body[rowNo][colNo];
                let isRowHeader = colNo < rowHeadingCount;

                if ( ! cell || ! cell.combineBelow || (cell && cell.value !== '')) { //skip cells that are blank

                    if (cell) {
                        let rowSpan = 1;
                        if (cell.combineBelow || colNo < rowHeadingCount) {
                            let rowIndex = rowNo + 1;
                            if (rowIndex < cells.body.length) {
                                let nextCell = cells.body[rowIndex][colNo];
                                while (! nextCell || nextCell.value === '') {
                                    rowSpan += 1
                                    rowIndex += 1;
                                    if (rowIndex < cells.body.length)
                                        nextCell = cells.body[rowIndex][colNo];
                                    else
                                        break;
                                }
                            }
                        }

                        let content = cell.value;
                        let classes = cell.classes;
                        let lastRow = (rowNo + rowSpan) === cells.body.length;

                        if (lastRow)
                            classes += ' jmv-results-table-cell-last-row';

                        if (cell.beginGroup)
                            classes += ' jmv-results-table-cell-group-begin';

                        if (content === '')
                            content = '&nbsp;';

                        let interpretation = this.determineAriaLabel(content);

                        let tableCell = isRowHeader
                            ? h('th', { scope: rowSpan > 1 ? 'rowgroup' : 'row', class: `jmv-results-table-cell ${classes}` })
                            : h('td', { class: `jmv-results-table-cell ${classes}` });
                        if (rowSpan > 1)
                            tableCell.setAttribute('rowspan', rowSpan.toString());
                        if (interpretation)
                            tableCell.setAttribute('aria-label', interpretation);
                        if (content === '&nbsp;')
                            tableCell.append('\u00a0');
                        else if (cell.renderMode === 'rich')
                            tableCell.append(rich(String(content)));
                        else if (cell.renderMode === 'trusted')
                            tableCell.append(...trustedContent(String(content)));
                        else
                            tableCell.append(String(content));
                        tableCell.append(h('span', { class: 'jmv-results-table-sup' }, cell.sups));
                        rowCells.push(tableCell);
                    }
                    else if (colNo >= rowHeadingCount) { // don't add blank cells into heading area.
                        rowCells.push(h('td', {}, '\u00a0'));
                    }
                }
            }

            let rowClasses = 'content-row';
            let trans = this.model.attributes.sortTransform;
            if (table.rowSelected === trans[rowNo])
                rowClasses += ' selected';

            bodyRows.push(h('tr', { class: rowClasses }, ...rowCells));
        }

        this.$tableBody.replaceChildren(...bodyRows);

        let footerRows: HTMLTableRowElement[] = [];
        for (let i = 0; i < table.notes.length; i++) {
            let noteCell = h('td', { class: 'table-note', colspan: nPhysCols.toString() });
            let paragraphs = richParagraphs(table.notes[i].note);
            if (paragraphs.length === 0)
                paragraphs.push(h('p'));
            paragraphs[0].prepend(h('i', {}, `${ _('Note') }.`), ' ');
            noteCell.append(...paragraphs);
            footerRows.push(h('tr', {}, noteCell));
        }

        for (let i = 0; i < footnotes.length; i++) {
            let footnoteCell = h('td', { colspan: nPhysCols.toString() });
            footnoteCell.append(SUPSCRIPTS[i] + ' ', rich(footnotes[i]));
            footerRows.push(h('tr', {}, footnoteCell));
        }

        this.$tableFooter.replaceChildren(...footerRows);

        if (this.refs.hasVisibleContent()) {
            let $refsRow = h('tr', { class: 'jmvrefs' }, h('td', { colspan: nPhysCols.toString() }));
            // class="jmvrefs" excludes this from some exports/copy
            $refsRow.childNodes[0].appendChild(this.refs);
            this.$tableFooter.append($refsRow);
        }
        else
            this.refs.remove();

        this._ascButtons = this.$tableHeader.querySelectorAll('button.sort-asc');
        this._descButtons = this.$tableHeader.querySelectorAll('button.sort-desc');
        this._trs = this.$tableBody.querySelectorAll('tr');

        this._ascButtons.forEach(el => el.addEventListener('click', this.onSortClick));
        this._descButtons.forEach(el =>el.addEventListener('click', this.onSortClick));

        if (table.rowSelect) {
            this._trs.forEach(el => el.addEventListener('click', this.onRowSelect));
        }
    }

    onRowSelect(event: MouseEvent) {
        if (event.target instanceof HTMLElement) {
            const table = this.model.attributes.element;
            let $row = event.target.closest('tr');
            let rowNo = -1;
            for (let i = 0; i < this._trs.length; i++) {
            if (this._trs[i] === $row) {
                rowNo = i;
                break;
            }
            }
            if (rowNo !== -1) {
                rowNo = this.model.attributes.sortTransform[rowNo];
                if (rowNo === table.rowSelected)
                    window.setOption(table.rowSelect, -1);
                else
                    window.setOption(table.rowSelect, rowNo);
            }
        }
    }

    onSortClick(event: MouseEvent) {
        if (event.target instanceof HTMLElement) {
            let $button = event.target;
            let columnName = $button.getAttribute('data-name');
            let type = $button.getAttribute('data-sort');
            this.model.sort(columnName, type);
        }
    }

    determineRowHeaderCount(cells) {

        let head = cells.header[0];
        let headerValue = head.value;
        let hasRowHeaders = headerValue === '' && cells.body[0][0].type === 'text';
        hasRowHeaders = hasRowHeaders || cells.body[0][0].combineBelow;
        if (hasRowHeaders === false)
            return;

        let headingCount = 0;
        let includeNext = false;
        let rowHeadings = [];
        let currentSuperTitle = null;
        for (let colNo = 0; colNo < cells.body[0].length; colNo++) {
            let head = cells.header[colNo];
            let headerValue = head.value;
            let hasHeading = headerValue === '' && cells.body[0][colNo].type === 'text';
            hasHeading = hasHeading || cells.body[0][colNo].combineBelow;
            if (currentSuperTitle)
                hasHeading = hasHeading || cells.body[0][colNo].superTitle === currentSuperTitle;
            if (hasHeading || includeNext) {
                currentSuperTitle = cells.body[0][colNo].superTitle;
                includeNext = false;
                headingCount += 1;
            }
            else
                break;

            let lastCellValue = '';
            for (let rowNo = 0; rowNo < cells.body.length; rowNo++) {
                let cell = cells.body[rowNo][colNo];
                let cellValue = '';
                if (cell)
                    cellValue = cell.value;

                if (cellValue === '')
                    cellValue = lastCellValue;

                lastCellValue = cellValue;
                let newHeading = rowHeadings[rowNo]  + ' ' + cellValue;
                //if the calculated heading already exists then it means the next column must be used to differentiate. 
                //Except when the next column has a column heading, then the assumption is that the column must have sub headings in it 
                // and so the headings end at this column. This is not a perfect assumption be good enough until otherwise determined.
                if (rowHeadings.includes(newHeading) && colNo + 1 < cells.header.length  && cells.header[colNo+1].value.trim() === '') 
                    includeNext = true;
                rowHeadings[rowNo] = newHeading;
            }
        }
        return headingCount;
    }

    determineAriaLabel(value) {
        if (typeof value !== 'string')
            return null;

        let items = value.split(' ✻ ');
        if (items.length === 1)
            return null;

        return this.termToAriaDescription(items);
    }

    termToAriaDescription(raw) {
        if (raw.length === 1)
            return raw[0];

        let first = raw[0];
        if (raw.length > 2) {
            for (let i = 1; i < raw.length - 1; i++) {
                first += ', ' + raw[i];
            }
        }
        let second = raw[raw.length - 1];
        return _('The interaction of {0} and {1}', [first, second]);
    }

    makeFormatClasses(column: ITableColumn) {

        let classes = ' jmv-results-table-cell-' + (column.type ? column.type : 'number');

        if (column.format) {
            let formats = column.format.split(',');
            if (formats.length !== 1 || formats[0] !== '') {
                for (let i = 0; i < formats.length; i++)
                    formats[i] = 'jmv-results-table-cell-format-' + formats[i];
                classes += ' ' + formats.join(' ');
            }
        }
        return classes;
    }
}

customElements.define('jmv-results-table', View);

export default { Model, View };
