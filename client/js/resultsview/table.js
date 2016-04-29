'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

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
        
        html = '';

        for (var i = 0; i < table.columns.length; i++) {
            var column = table.columns[i];

            if (_.has(column, 'title'))
                html += '<th class="silky-results-table-cell">' + column.title + '</th>';
            else
                html += '<th class="silky-results-table-cell">' + column.name + '</th>';
        }
        
        this.$columnHeaderRowSuper.empty();
        this.$columnHeaderRow.html(html);
        
        html = '';
        
        if (table.columns.length === 0 || table.columns[0].cells.length === 0)
            return;
        
        for (var rowNo = 0; rowNo < table.columns[0].cells.length; rowNo++) {
        
            html += '<tr>';

            for (var colNo = 0; colNo < table.columns.length; colNo++) {
                var cells = table.columns[colNo].cells;
                var cell = cells[rowNo];
                
                switch (cell.cellType) {
                case 'i':
                    html += '<td class="silky-results-table-cell silky-results-table-cell-integer">' + cell.i + '</td>';
                    break;
                case 'd':
                    html += '<td class="silky-results-table-cell silky-results-table-cell-number">' + cell.d.toFixed(2) + '</td>';
                    break;
                case 's':
                    html += '<td class="silky-results-table-cell silky-results-table-cell-text">' + cell.s + '</td>';
                    break;
                case 'o':
                    html += '<td class="silky-results-table-cell silky-results-table-cell-number">' + cell.o + '</td>';
                    break;
                }
            }
            
            html += '</tr>';
        }
        
        this.$tableBody.html(html);
    }
});

module.exports = { Model: TableModel, View: TableView };
