'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;
var determineFormatting = require('./formatting').determineFormatting;
var format = require('./formatting').format;

var TableModel = Backbone.Model.extend({
    defaults : {
        name: "name",
        title: "(no title)",
        element : {
            columns : [ ]
        }
    },
    initialize: function() {
    }
});

var TableView = Backbone.View.extend({
    initialize: function() {
        this.$el.addClass('silky-results-table');
        
        if (this.model === null)
            this.model = new TableModel();
        
        this.$table = $('<table class="silky-results-table-table silky-results-item"></table>').appendTo(this.$el);
        this.$tableHeader = $('<thead></thead>').appendTo(this.$table);
        this.$titleRow = $('<tr class="silky-results-table-title-row"></tr>').appendTo(this.$tableHeader);
        this.$titleCell = $('<th class="silky-results-table-title-cell" colspan="999999">').appendTo(this.$titleRow);
        
        this.$columnHeaderRowSuper = $('<tr class="silky-results-table-header-row-super"></tr>').appendTo(this.$tableHeader);
        this.$columnHeaderRow      = $('<tr class="silky-results-table-header-row-main"></tr>').appendTo(this.$tableHeader);
        
        this.$tableBody   = $('<tbody></tbody>').appendTo(this.$table);
        this.$tableFooter = $('<tfoot></tfoot>').appendTo(this.$table);
        
        this.render();
    },
    render: function() {
        
        var table = this.model.attributes.element;
        var html;

        if (this.model.attributes.title)
            this.$titleCell.text(this.model.attributes.title);
        
        var rowCount;
        if (table.columns.length > 0)
            rowCount = table.columns[0].cells.length;
        else
            rowCount = 0;
        
        
        var cells = {
            header : new Array(table.columns.length),
            body : new Array(table.columns.length)
        };
        var formattings = [];
        for (var colNo = 0; colNo < table.columns.length; colNo++) {
            formattings[colNo] = determineFormatting(_.pluck(table.columns[colNo].cells, 'd'));
        }
        
        for (var c = 0; c < table.columns.length; c++) {
            cells.body[c] = new Array(rowCount);
            
            for (var r = 0; r < rowCount; r++){
                var newCell = {};
                var refCell = table.columns[c].cells[r];
                //footnotes
                newCell.sup = "";
                var subscripts=["\u1D43", "\u1D47", "\u1D48", "\u1D49", "\u1DA0", "\u1D4D", "\u02B0", "\u2071",
                                "\u02B2", "\u1D4F", "\u02E1", "\u1D50", "\u207F", "\u1D52", "\u1D56", "\u02B3", "\u02E2",
                                "\u1D57", "\u1D58", "\u1D5B", "\u02B7", "\u02E3", "\u02B8", "\u1DBB"];
                for (var ftNo = 0; ftNo < refCell.footnotes.length; ftNo++) {
                    newCell.sup += subscripts[refCell.footnotes[ftNo]];
                }
                //type & values
                switch (refCell.cellType) {
                case 'i':
                    newCell.value = refCell.i;
                    newCell.format = "integer";
                    break;
                case 'd':
                    newCell.value = format(refCell.d, formattings[c]).replace(/-/g , "\u2212").replace(/ /g,"\u2007");
                    newCell.format = "number";
                    break;
                case 's':
                    newCell.value = refCell.s;
                    newCell.format = "text";
                    break;
                case 'o':
                    newCell.value = refCell.o;
                    newCell.format = "number";
                    
                    break;
                }
                cells.body[c][r] = newCell;
            }
        }
        
        html = '';

        for (var i = 0; i < table.columns.length; i++) {
            var column = table.columns[i];

            if (_.has(column, 'title'))
                html += '<th class="silky-results-table-cell" colspan="2">' + column.title + '</th>';
            else
                html += '<th class="silky-results-table-cell" colspan="2">' + column.name + '</th>';
        }
        
        this.$columnHeaderRowSuper.empty();
        this.$columnHeaderRow.html(html);
        
        html = '';
        
        if (table.columns.length === 0 || table.columns[0].cells.length === 0)
            return;
        
        for (var rowNo = 0; rowNo < table.columns[0].cells.length; rowNo++) {
            
            html += '<tr>';
            
            for (colNo = 0; colNo < table.columns.length; colNo++) {
                
                var cell = cells.body[colNo][rowNo];
                html += '<td class="silky-results-table-cell silky-results-table-cell-'+cell.format+'">' + cell.value + '</td>';
                html += '<td class="silky-results-table-cell silky-results-table-cell-sup">'+cell.sup+'</td>';
            }
            
            html += '</tr>';
        }

        this.$tableBody.html(html);
    }
});

module.exports = { Model: TableModel, View: TableView };
