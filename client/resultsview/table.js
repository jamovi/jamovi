'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;
var determineFormatting = require('./formatting').determineFormatting;
var format = require('./formatting').format;

var Element = require('./element');

var SUBSCRIPTS =["\u1D43", "\u1D47", "\u1D48", "\u1D49", "\u1DA0", "\u1D4D", "\u02B0", "\u2071",
                "\u02B2", "\u1D4F", "\u02E1", "\u1D50", "\u207F", "\u1D52", "\u1D56", "\u02B3", "\u02E2",
                "\u1D57", "\u1D58", "\u1D5B", "\u02B7", "\u02E3", "\u02B8", "\u1DBB"];

var TableModel = Backbone.Model.extend({
    defaults : {
        name: "name",
        title: "(no title)",
        element : {
            columns : [ ]
        },
        error: null,
        status: 'complete'
    },
    initialize: function() {
    }
});

var TableView = Element.View.extend({
    initialize: function(data) {

        Element.View.prototype.initialize.call(this, data);

        this.$el.addClass('silky-results-table');

        if (this.model === null)
            this.model = new TableModel();

        this.$table = $('<table class="silky-results-table-table"></table>').appendTo(this.$el);
        this.$tableHeader = $('<thead></thead>').appendTo(this.$table);
        this.$titleRow = $('<tr class="silky-results-table-title-row"></tr>').appendTo(this.$tableHeader);
        this.$titleCell = $('<th class="silky-results-table-title-cell" colspan="999999">').appendTo(this.$titleRow);

        this.$columnHeaderRowSuper = $('<tr class="silky-results-table-header-row-super"></tr>').appendTo(this.$tableHeader);
        this.$columnHeaderRow      = $('<tr class="silky-results-table-header-row-main"></tr>').appendTo(this.$tableHeader);

        this.$tableBody   = $('<tbody></tbody>').appendTo(this.$table);
        this.$tableFooter = $('<tfoot></tfoot>').appendTo(this.$table);

        this.render();
    },
    type: function() {
        return "Table";
    },
    render: function() {

        var table = this.model.attributes.element;
        var html;

        if (this.model.attributes.title)
            this.$titleCell.text(this.model.attributes.title);

        var columnCount = table.columns.length;
        var rowPlan = {};
        var foldedNames = [];
        var nFolds = 1;

        for (let i = 0; i < columnCount; i++) {
            let column = table.columns[i];
            let columnName = column.name;
            let foldedName = columnName;
            let index = foldedName.indexOf('[');
            if (index !== -1)
                foldedName = foldedName.substring(0, index);

            if (_.has(rowPlan, foldedName)) {
                let folds = rowPlan[foldedName];
                folds.push(i);
                nFolds = Math.max(nFolds, folds.length);
            }
            else {
                foldedNames.push(foldedName);
                rowPlan[foldedName] = [ i ];
            }
        }

        var rowCount;
        if (table.columns.length > 0)
            rowCount = table.columns[0].cells.length;
        else
            rowCount = 0;

        var cells = {
            header : new Array(table.columns.length),
            body : new Array(rowCount)
        };

        var formattings = new Array(table.columns.length);

        for (let colNo = 0; colNo < table.columns.length; colNo++) {
            let column = table.columns[colNo];
            if (_.has(column, 'title'))
                cells.header[colNo] = { value : column.title };
            else
                cells.header[colNo] = { value : column.name };

            let values = _.pluck(column.cells, 'd');
            formattings[colNo] = determineFormatting(values);
        }

        for (let rowNo = 0; rowNo < rowCount; rowNo++) {

            cells.body[rowNo] = new Array(table.columns.length);

            for (let colNo = 0; colNo < table.columns.length; colNo++) {
                let source = table.columns[colNo].cells[rowNo];
                let newCell = { };
                switch (source.cellType) {
                case 'i':
                    newCell.value = source.i;
                    newCell.classes = "silky-results-table-cell-integer";
                    break;
                case 'd':
                    newCell.value = format(source.d, formattings[colNo]).replace(/-/g , "\u2212").replace(/ /g,'<span style="visibility: hidden ;">0</span>');
                    newCell.classes = "silky-results-table-cell-number";
                    break;
                case 's':
                    newCell.value = source.s;
                    newCell.classes = "silky-results-table-cell-text";
                    break;
                case 'o':
                    if (source.o == 2) {
                        newCell.value = 'NaN';
                        newCell.classes = "silky-results-table-cell-number";
                    }
                    else {
                        newCell.value = '';
                        newCell.classes = "silky-results-table-cell-text";
                    }
                    break;
                }

                cells.body[rowNo][colNo] = newCell;
            }
        }

        if (nFolds > 1) {

            let newColumnCount = foldedNames.length;
            let newRowCount = rowCount * nFolds;

            let folded = {
                header : new Array(newColumnCount),
                body   : new Array(newRowCount)
            };

            for (let colNo = 0; colNo < newColumnCount; colNo++) {
                let foldedName = foldedNames[colNo];
                let foldedIndices = rowPlan[foldedName];
                let index = foldedIndices[0];
                folded.header[colNo] = cells.header[index];
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
                        if (fold === 0)
                            cell.classes += " silky-results-table-cell-group-begin";
                        if (fold === nFolds - 1)
                            cell.classes += " silky-results-table-cell-group-end";
                        row[colNo] = cell;
                    }
                }
            }

            cells.header = folded.header;
            cells.body = folded.body;
        }

        html = '';

        for (let i = 0; i < cells.header.length; i++) {
            var head = cells.header[i];
            html += '<th class="silky-results-table-cell" colspan="2">' + head.value + '</th>';
        }

        this.$columnHeaderRowSuper.empty();
        this.$columnHeaderRow.html(html);

        html = '';

        if (table.columns.length === 0)
            return;

        if (table.columns[0].cells.length === 0) {
            this.$tableBody.html('<tr><td colspan="999999">&nbsp;</td></tr>');
            return;
        }

        for (let rowNo = 0; rowNo < cells.body.length; rowNo++) {

            html += '<tr>';

            for (let colNo = 0; colNo < cells.body[rowNo].length; colNo++) {

                var cell = cells.body[rowNo][colNo];
                if (cell) {
                    html += '<td class="silky-results-table-cell ' + cell.classes + '">' + cell.value + '</td>';
                    html += '<td class="silky-results-table-cell silky-results-table-cell-sup">' + /*cell.sup+*/ '</td>';
                }
                else {
                    html += '<td colspan="2"></td>';
                }
            }

            html += '</tr>';
        }

        this.$tableBody.html(html);
    }
});

module.exports = { Model: TableModel, View: TableView };
