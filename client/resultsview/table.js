'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const determineFormatting = require('../common/formatting').determineFormatting;
const format = require('../common/formatting').format;

const Elem = require('./element');

const SUPSCRIPTS = ["\u1D43", "\u1D47", "\u1D48", "\u1D49", "\u1DA0", "\u1D4D", "\u02B0", "\u2071",
                "\u02B2", "\u1D4F", "\u02E1", "\u1D50", "\u207F", "\u1D52", "\u1D56", "\u02B3", "\u02E2",
                "\u1D57", "\u1D58", "\u1D5B", "\u02B7", "\u02E3", "\u02B8", "\u1DBB"];

const Format = {
    BEGIN_GROUP: 1,
    END_GROUP: 2,
    NEGATIVE: 4
};

const TableModel = Backbone.Model.extend({
    defaults : {
        name: "name",
        title: "(no title)",
        element : {
            columns : [ ]
        },
        error: null,
        status: 'complete',
        asText: null
    },
    initialize() {
    }
});

const TableView = Elem.View.extend({
    initialize(data) {

        Elem.View.prototype.initialize.call(this, data);

        this.$el.addClass('silky-results-table');

        if (this.model === null)
            this.model = new TableModel();

        let table = this.model.attributes.element;

        if (data.mode === 'rich') {

            this.$table = $('<table class="silky-results-table-table"></table>').appendTo(this.$el);
            this.$tableHeader = $('<thead></thead>').appendTo(this.$table);
            this.$titleRow = $('<tr class="silky-results-table-title-row"></tr>').appendTo(this.$tableHeader);
            this.$titleCell = $('<th class="silky-results-table-title-cell" colspan="1">').appendTo(this.$titleRow);
            this.$titleText = $('<span class="silky-results-table-title-text"></span>').appendTo(this.$titleCell);
            this.$status = $('<div class="silky-results-table-status-indicator"></div>').appendTo(this.$titleCell);

            this.$columnHeaderRowSuper = $('<tr class="silky-results-table-header-row-super"></tr>').appendTo(this.$tableHeader);
            this.$columnHeaderRow      = $('<tr class="silky-results-table-header-row-main"></tr>').appendTo(this.$tableHeader);

            this.$tableBody   = $('<tbody></tbody>').appendTo(this.$table);
            this.$tableFooter = $('<tfoot></tfoot>').appendTo(this.$table);

            this.render();
        }
        else if (table.asText !== null) {

            let text = '#' + table.asText.split('\n').join('\n# ');
            if (navigator.platform === "Win32")
                text = text.replace(/\u273B/g, '*');

            let $pre = $('<pre class="silky-results-text silky-results-item"></pre>').appendTo(this.$el);
            $pre.text(text);
        }
    },
    type() {
        return 'Table';
    },
    render() {

        let table = this.model.attributes.element;
        let html;
        let fnIndices = { };
        let footnotes = [ ];

        if (this.model.attributes.status === 2)
            this.$el.addClass('silky-results-status-running');

        if (this.model.attributes.title)
            this.$titleText.text(this.model.attributes.title);

        let columnCount = table.columns.length;
        let rowCount;

        if (table.columns.length > 0)
            rowCount = table.columns[0].cells.length;
        else
            rowCount = 0;

        let hasSuperHeader = false;
        for (let i = 0; i < columnCount; i++) {
            if (table.columns[i].superTitle) {
                hasSuperHeader = true;
                break;
            }
        }

        let cells = {
            header  : new Array(table.columns.length),
            superHeader : new Array(table.columns.length),
            body : new Array(rowCount)
        };

        let formattings = new Array(table.columns.length);

        for (let colNo = 0; colNo < table.columns.length; colNo++) {

            let column  = table.columns[colNo];
            let visible = (column.visible === 0 || column.visible === 2);

            let classes = '';
            let format = column.format.split(',');
            if (format.includes('narrow'))
                classes += ' silky-results-table-cell-format-narrow';

            let title = name;
            if ('title' in column)
                title = column.title;

            cells.header[colNo] = { value : column.title, classes : classes, visible : visible };

            if (column.superTitle)
                cells.superHeader[colNo] = { value : column.superTitle, classes : '', visible : visible };

            let values = column.cells.map(v => v.d);
            formattings[colNo] = determineFormatting(values, column.type, column.format);
        }

        let group = 0;

        for (let rowNo = 0; rowNo < rowCount; rowNo++) {

            cells.body[rowNo] = new Array(table.columns.length);

            if (table.columns.length === 0)
                break;

            let rowFormat = '';

            let firstCell = table.columns[0].cells[rowNo];
            if ((firstCell.format & Format.BEGIN_GROUP) == Format.BEGIN_GROUP)
                group++;
            if ((firstCell.format & Format.END_GROUP) == Format.END_GROUP)
                group++;

            for (let colNo = 0; colNo < table.columns.length; colNo++) {
                let sourceColumn = table.columns[colNo];
                let sourceCell = sourceColumn.cells[rowNo];

                let cell = { value : null, classes : rowFormat, sups : '', group : group };

                if (sourceCell.format & Format.NEGATIVE)
                    cell.classes += ' silky-results-table-cell-negative';

                cell.visible = (sourceColumn.visible === 0 || sourceColumn.visible === 2);

                if (sourceColumn.combineBelow)
                    cell.combineBelow = true;

                for (let symbol of sourceCell.symbols)
                    cell.sups += symbol;

                if (cell.visible) {
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
            }
        }

        let rowPlan = {};
        let foldedNames = [];
        let nFolds = 1;

        for (let i = 0; i < columnCount; i++) {
            let column = table.columns[i];
            let columnName = column.name;
            let foldedName = columnName;
            let index = foldedName.indexOf('[');
            if (index !== -1)
                foldedName = foldedName.substring(0, index);

            if (foldedName in rowPlan) {
                let folds = rowPlan[foldedName];
                folds.push(i);
                nFolds = Math.max(nFolds, folds.length);
            }
            else {
                foldedNames.push(foldedName);
                rowPlan[foldedName] = [ i ];
            }
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
                        if (cell.group === 0)
                            cell.group = rowNo;
                        row[colNo] = cell;
                    }
                }
            }

            cells.header = folded.header;
            cells.superHeader = folded.superHeader;
            cells.body = folded.body;
        }

        if (cells.body.length > 1 && cells.body[0].length > 0) {

            for (let colNo = 0; colNo < cells.body[0].length; colNo++) {
                if ( ! cells.body[0][colNo].combineBelow)
                    continue;

                let lastValue = '';

                for (let rowNo = 0; rowNo < cells.body.length; rowNo++) {
                    let cell = cells.body[rowNo][colNo];
                    if (cell === undefined || cell.visible !== true)
                        continue;
                    let nowValue = cell.value;
                    if (cell.value === lastValue)
                        cell.value = '';
                    else
                        lastValue = nowValue;
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
                swapped.body[colNo][0] = cells.header[colNo + 1];
            }
            //fix body
            for (let rowNo = 0; rowNo < swapped.body.length; rowNo++) {
                for (let colNo = 1; colNo < swapped.body[rowNo].length; colNo++) {
                    swapped.body[rowNo][colNo] = cells.body[colNo - 1][rowNo + 1];
                }
            }

            cells.header = swapped.header;
            cells.body = swapped.body;
        }

        html = '';

        if (hasSuperHeader) {

            let allSHHidden = true;  // all super headers hidden

            let span = 1;
            let allHidden = true;
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
                if (typeof(head) !== 'undefined') {
                    content = head.value;
                    if (head.visible) {
                        allHidden = false;
                        allSHHidden = false;
                    }
                }

                if (content == nextContent) {
                    span++;
                }
                else {
                    let hidden = '';
                    if (allHidden)
                        hidden = ' cell-hidden';
                    html += '<th class="silky-results-table-cell' + hidden + '" colspan="' + (2 * span) + '">' + content + '</th>';
                    span = 1;
                    allHidden = true;
                }
            }

            if (allSHHidden)
                this.$columnHeaderRowSuper.addClass('cell-hidden');
            this.$columnHeaderRowSuper.html(html);
        }


        html = '';

        for (let head of cells.header) {
            let content = head.value;
            if (content === '')
                content = '&nbsp;';
            let hidden = head.visible ? '' : ' cell-hidden';
            let classes = head.classes;
            html += '<th class="silky-results-table-cell' + hidden + ' ' + classes + '" colspan="2">' + content + '</th>';
        }

        this.$columnHeaderRow.html(html);

        if (cells.header.length === 0) {
            this.$titleCell.attr('colspan', 1);
            return;
        }

        let nPhysCols = 2 * cells.header.length;

        if (cells.body.length === 0 || cells.body[0].length === 0) {
            this.$titleCell.attr('colspan', nPhysCols);
            this.$tableBody.html('<tr><td colspan="' + nPhysCols + '">&nbsp;</td></tr>');
            return;
        }

        this.$titleCell.attr('colspan', nPhysCols);

        html = '';

        let currentGroup = -1;
        let prevGroup = -1;

        for (let rowNo = 0; rowNo < cells.body.length; rowNo++) {

            let rowHtml = '';
            let allCellsHidden = true;

            for (let colNo = 0; colNo < cells.body[rowNo].length; colNo++) {

                let cell = cells.body[rowNo][colNo];

                if (cell) {
                    let content = cell.value;
                    let classes = cell.classes;

                    if (cell.group !== prevGroup) {
                        currentGroup = cell.group;
                        classes += ' silky-results-table-cell-group-begin';
                    }

                    let hidden = '';
                    if (cell.visible)
                        allCellsHidden = false;
                    else
                        hidden = ' cell-hidden';

                    if (content === '')
                        content = '&nbsp;';
                    if (cell.sups && cell.classes.indexOf('silky-results-table-cell-text') !== -1) {
                        // place the superscript beside the content if left aligned
                        rowHtml += '<td class="silky-results-table-cell ' + classes + hidden + '">' + content + ' ' + cell.sups + '</td>';
                        rowHtml += '<td class="silky-results-table-cell silky-results-table-cell-sup ' + hidden + '"></td>';
                    }
                    else {
                        rowHtml += '<td class="silky-results-table-cell ' + classes + hidden + '">' + content + '</td>';
                        rowHtml += '<td class="silky-results-table-cell silky-results-table-cell-sup ' + hidden + '">' + (cell.sups ? cell.sups : '') + '</td>';
                    }
                }
                else {
                    rowHtml += '<td colspan="2" class="cell-hidden">&nbsp;</td>';
                }
            }

            if ( ! allCellsHidden)
                prevGroup = currentGroup;

            let hidden = (allCellsHidden ? ' cell-hidden' : '');
            html += '<tr class="' + hidden + '">' + rowHtml + '</tr>';
        }

        this.$tableBody.html(html);

        html = '';

        for (let i = 0; i < table.notes.length; i++)
            html += '<tr><td colspan="' + nPhysCols + '"><span style="font-style: italic ;">Note.</span> ' + table.notes[i].note + '</td></tr>';

        for (let i = 0; i < footnotes.length; i++)
            html += '<tr><td colspan="' + nPhysCols + '">' + SUPSCRIPTS[i] + ' ' + footnotes[i] + '</td></tr>';

        html += '<tr><td colspan="' + nPhysCols + '"></td></tr>';
        this.$tableFooter.html(html);
    },
    makeFormatClasses(column) {

        let classes = ' silky-results-table-cell-' + (column.type ? column.type : 'number');

        if (column.format) {
            let formats = column.format.split(',');
            if (formats.length !== 1 || formats[0] !== '') {
                for (let i = 0; i < formats.length; i++)
                    formats[i] = 'silky-results-table-cell-format-' + formats[i];
                classes += ' ' + formats.join(' ');
            }
        }
        return classes;
    }
});

module.exports = { Model: TableModel, View: TableView };
