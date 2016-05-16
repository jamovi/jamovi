
'use strict';


var Overridable = require('./overridable');
var _ = require('underscore');

var LayoutGridBorderSupport = function() {
    Overridable.extendTo(this);

    var self = this;

    this._firstColumnIndex = -1;
    this._firstRowIndex = -1;

    this._override('_add', function(baseFunction, column, row, cell) {
        if (cell.isVirtual === false) {
            if (self._firstColumnIndex === -1 || column === self._firstColumnIndex) {
                cell.$el.addClass("first-cell");
                self._firstColumnIndex = column;
            }
            else if (column < self._firstColumnIndex) {
                var columnCells = self._orderedColumns[self._firstColumnIndex];
                for (var i = 0; i < columnCells.length; i++)
                    columnCells[i].$el.removeClass("first-cell");

                cell.$el.addClass("first-cell");
                self._firstColumnIndex = column;
            }

            if (self._firstRowIndex === -1 || row === self._firstRowIndex) {
                cell.$el.addClass("first-row");
                self._firstRowIndex = row;
            }
            else if (row < self._firstRowIndex) {
                var rowCells = self._orderedCells[self._firstRowIndex];
                for (var j = 0; j < rowCells.length; j++)
                    rowCells[j].$el.removeClass("first-row");

                cell.$el.addClass("first-row");
                self._firstRowIndex = row;
            }

            if (self._cellBorders)
                cell.$el.addClass("cell-border");
        }

        baseFunction.call(self, column, row, cell);
    });

    this._override('removeCell', function(baseFunction, cell) {

        baseFunction.call(self, cell);

        var cellData = cell.data;

        self._firstRowIndex = -1;
        if (cellData.row === self._firstRowIndex && self._orderedCells[cellData.row].length === 0) {
            for (var r = self._firstRowIndex + 1; r < self._orderedCells.length; r++) {
                var rowCells = self._orderedCells[r];
                if (rowCells !== null && _.isUndefined(rowCells) === false && rowCells.length > 0) {
                    self._firstRowIndex = r;
                    break;
                }
            }
        }

        self._firstColumnIndex = -1;
        if (cellData.column === self._firstColumnIndex && self._orderedColumns[cellData.column].length === 0) {
            for (var c = self._firstColumnIndex + 1; c < self._orderedColumns.length; c++) {
                var columnCells = self._orderedColumns[c];
                if (columnCells !== null && _.isUndefined(columnCells) === false && columnCells.length > 0) {
                    self._firstColumnIndex = c;
                    break;
                }
            }
        }
    });

    this.setCellBorders = function() {
        this._cellBorders = true;
    };
};

LayoutGridBorderSupport.extendTo = function(target) {
    LayoutGridBorderSupport.call(target);
};

module.exports = LayoutGridBorderSupport;
