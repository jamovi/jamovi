'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const determFormat = require('../common/formatting').determFormat;
const format = require('../common/formatting').format;
const focusLoop = require('../common/focusloop');

const Elem = require('./element');

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

const TableModel = Elem.Model.extend({
    defaults : {
        name:  'name',
        title: '(no title)',
        element : {
            columns : [ ]
        },
        error: null,
        status: 'complete',
        asText: null,
        sortedCells : [ ],
        sortTransform: [ ],
        options: { },
    },
    initialize() {

        let table = this.attributes.element;
        let cells = table.columns.map(column => column.cells);

        if (table.sortSelected) {

            let sortBy = table.sortSelected.sortBy;
            let sortDesc = table.sortSelected.sortDesc;

            this.sort(sortBy, sortDesc ? 'desc' : 'asc');

        } else {

            if (cells.length > 0 && cells[0].length > 0) {
                let trans = new Array(cells[0].length);
                for (let i = 0; i < trans.length; i++)
                    trans[i] = i;
                this.set('sortTransform', trans);
            }

            this.set('sortedCells', cells);
        }
    },
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
    },
});

const isVis = function(column) {
    return column.visible === 0 || column.visible === 2;
};

const TableView = Elem.View.extend({
    initialize(data) {

        Elem.View.prototype.initialize.call(this, data);

        this.$el.addClass('jmv-results-table');

        if (this.model === null)
            this.model = new TableModel();

        let table = this.model.attributes.element;

        this._ascButtons = $();
        this._descButtons = $();
        this._trs = $();

        let rowSelectable = table.rowSelect ? ' row-selectable' : '';

        let titleId = focusLoop.getNextFocusId('label');
        this.$table = $(`<table aria-labelledby="${titleId}" class="jmv-results-table-table${rowSelectable}"></table>`);
        
        this.addContent(this.$table);

        this.$titleCell = $('<caption class="jmv-results-table-title-cell" scope="col" colspan="1"></caption>').prependTo(this.$table);
        this.$tableHeader = $('<thead></thead>').appendTo(this.$table);

        this.$titleText = $(`<span id="${titleId}" class="jmv-results-table-title-text"></span>`).appendTo(this.$titleCell);
        this.$status = $('<div class="jmv-results-table-status-indicator"></div>').appendTo(this.$titleCell);

        this.$columnHeaderRow = $('<tr class="jmv-results-table-header-row-main"></tr>').appendTo(this.$tableHeader);

        this.$tableBody   = $('<tbody></tbody>').appendTo(this.$table);
        this.$tableFooter = $('<tfoot></tfoot>').appendTo(this.$table);

        this.model.on('change:sortedCells', () => this.render());
        this.refs._refTable.addEventListener('changed', () => this.render());

        this.render();
    },
    type() {
        return 'Table';
    },
    label() {
        return _('Table');
    },
    render() {

        Elem.View.prototype.render.call(this);

        let table = this.model.attributes.element;
        let columns = table.columns;
        let sortedCells = this.model.attributes.sortedCells;
        let html;
        let fnIndices = { };
        let footnotes = [ ];

        this._ascButtons.off();
        this._descButtons.off();
        this._trs.off();

        if (this.model.attributes.status === 1)
            this.$el.addClass('jmv-results-status-inited');
        else if (this.model.attributes.status === 2)
            this.$el.addClass('jmv-results-status-running');
        else {
            this.$el.removeClass('jmv-results-status-inited');
            this.$el.removeClass('jmv-results-status-running');
        }

        if (this.model.attributes.title)
            this.$titleText.text(this.model.attributes.title);

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

            cells.header[colNo] = { name : name, value : column.title, colIndex: colIndex, type: column.type, classes : classes, sortable : sortable };

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

                let cell = { value : null, type: sourceColumn.type, superTitle: sourceColumn.superTitle, colIndex: sourceColNo, classes : rowFormat, sups : '' };

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

                switch (sourceCell.cellType) {
                case 'i':
                    cell.value = sourceCell.i;
                    break;
                case 'd':
                    let value = format(sourceCell.d, formattings[colNo]);
                    value = value.replace(/-/g , "\u2212").replace(/ /g,'<span style="visibility: hidden ;">0</span>');
                    cell.value = value;
                    break;
                case 's':
                    cell.value = sourceCell.s;
                    break;
                case 'o':
                    if (sourceCell.o == 2)
                        cell.value = 'NaN';
                    else
                        cell.value = '.';
                    break;
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

        html = '';

        if (hasSuperHeader) {

            let span = 1;
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
                    html += '<th scope="colgroup" class="jmv-results-table-cell" colspan="' + (span) + '">' + content + '</th>';
                    span = 1;
                }
            }

            if ( ! this.$columnHeaderRowSuper)
                this.$columnHeaderRowSuper = $('<tr class="jmv-results-table-header-row-super"></tr>').prependTo(this.$tableHeader);
            this.$columnHeaderRowSuper.html(html);
        }
        else if (this.$columnHeaderRowSuper) {
            this.$columnHeaderRowSuper.remove();
            this.$columnHeaderRowSuper = null;
        }


        html = '';

        for (let head of cells.header) {
            let content = head.value;
            if (content === '')
                content = '&nbsp;';
            let classes = head.classes;
            let sortStuff = '';
            if (head.sortable) {
                let asc = 'sort-asc';
                let desc = 'sort-desc';
                if (table.sortSelected && head.name === table.sortSelected.sortBy) {
                    if (table.sortSelected.sortDesc)
                        desc = 'sorted-desc';
                    else
                        asc = 'sorted-asc';
                }
                sortStuff = ' <button aria-label="Sort Column - Ascending" class="' + asc + '" data-name="' + head.name + '"></button><button class="' + desc + '" aria-label="Sort Column - decending" data-name="' + head.name + '"></button>';
            }
            html += '<th scope="col" class="jmv-results-table-cell' + classes + '">' + content + sortStuff + '</th>';
        }

        this.$columnHeaderRow.html(html);

        if (cells.header.length === 0) {
            this.$titleCell.attr('colspan', 1);
            this.$titleCell.attr('scope', 'col');
            return;
        }

        let nPhysCols = cells.header.length;

        if (cells.body.length === 0 || cells.body[0].length === 0) {
            this.$titleCell.attr('colspan', nPhysCols);
            if (nPhysCols > 1)
                this.$titleCell.attr('scope', 'colgroup');
            else
                this.$titleCell.attr('scope', 'col');

            this.$tableBody.html('<tr><td colspan="' + nPhysCols + '">&nbsp;</td></tr>');
            return;
        }

        this.$titleCell.attr('colspan', nPhysCols);
        if (nPhysCols > 1)
            this.$titleCell.attr('scope', 'colgroup');
        else
            this.$titleCell.attr('scope', 'col');

        html = '';

        let rowHeadingCount = this.determineRowHeaderCount(cells);
        for (let rowNo = 0; rowNo < cells.body.length; rowNo++) {

            let rowHtml = '';
            for (let colNo = 0; colNo < cells.body[rowNo].length; colNo++) {
                
                let cell = cells.body[rowNo][colNo];
                let isRowHeader = colNo < rowHeadingCount;

                if ( ! cell || ! cell.combineBelow || (cell && cell.value !== '')) { //skip cells that are blank
                    
                    if (cell) {
                        let rowSpan = 1;
                        if (cell.combineBelow || colNo < rowHeadingCount) {
                            let rowIndex = rowNo + 1;
                            if (rowIndex < cells.body.length) {
                                let nextCell = cells.body[rowIndex][colNo];;
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

                        if (isRowHeader)
                            rowHtml += `<th ${rowSpan > 1 ? 'scope="rowgroup" rowspan="' + rowSpan + '"' : 'scope="row"'} ${interpretation ? 'aria-label="' + interpretation + '"' : ''} class="jmv-results-table-cell ${classes}">${content}<span class="jmv-results-table-sup">${cell.sups}</span></td>`;
                        else
                            rowHtml += `<td ${rowSpan > 1 ? 'rowspan="' + rowSpan + '"' : ''} ${interpretation ? 'aria-label="' + interpretation + '"' : ''}  class="jmv-results-table-cell ${classes}">${content}<span class="jmv-results-table-sup">${cell.sups}</span></td>`;
                    }
                    else if (colNo >= rowHeadingCount) { // don't add blank cells into heading area.
                        rowHtml += '<td>&nbsp;</td>';
                    }
                }
            }

            let selected = '';
            let trans = this.model.attributes.sortTransform;
            if (table.rowSelected === trans[rowNo])
                selected = ' selected';

            html += '<tr class="content-row' + selected + '">' + rowHtml + '</tr>';
        }

        this.$tableBody.html(html);

        html = '';

        for (let i = 0; i < table.notes.length; i++)
            html += `<tr><td colspan="${ nPhysCols }"><span style="font-style: italic ;">${ _('Note') }.</span> ${ table.notes[i].note }</td></tr>`;

        for (let i = 0; i < footnotes.length; i++)
            html += `<tr><td colspan="${ nPhysCols }">${ SUPSCRIPTS[i] } ${ footnotes[i] }</td></tr>`;

        //html += `<tr><td colspan="${ nPhysCols }"></td></tr>`;
        this.$tableFooter.html(html);

        if (this.refs.hasVisibleContent()) {
            let $refsRow = $(`<tr class="jmvrefs"><td colspan="${ nPhysCols }"></td></tr>`);
            // class="jmvrefs" excludes this from some exports/copy
            $refsRow[0].childNodes[0].appendChild(this.refs);
            this.$tableFooter.append($refsRow);
        }
        else
            this.refs.remove();

        this._ascButtons = this.$tableHeader.find('button.sort-asc');
        this._descButtons = this.$tableHeader.find('button.sort-desc');
        this._trs = this.$tableBody.find('tr');

        this._ascButtons.on('click', event => {
            let $button = $(event.target);
            let columnName = $button.attr('data-name');
            this.model.sort(columnName, 'asc');
        });

        this._descButtons.on('click', event => {
            let $button = $(event.target);
            let columnName = $button.attr('data-name');
            this.model.sort(columnName, 'desc');
        });

        if (table.rowSelect) {
            this._trs.on('click', event => {
                let $row = $(event.target).closest(this._trs);
                let rowNo = this._trs.index($row);
                rowNo = this.model.attributes.sortTransform[rowNo];
                if (rowNo === table.rowSelected)
                    window.setOption(table.rowSelect, -1);
                else
                    window.setOption(table.rowSelect, rowNo);
            });
        }
    },
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
                if (rowHeadings.includes(newHeading))
                    includeNext = true;
                rowHeadings[rowNo] = newHeading;
            }
        }
        return headingCount;
    },
    determineAriaLabel(value) {
        if (typeof value !== 'string')
            return null;

        let items = value.split(' ✻ ');
        if (items.length === 1)
            return null;
        
        return this.termToAriaDescription(items);
    },
    termToAriaDescription: function(raw) {
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
    },
    makeFormatClasses(column) {

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
});

module.exports = { Model: TableModel, View: TableView };
