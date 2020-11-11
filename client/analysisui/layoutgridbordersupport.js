
'use strict';

var SuperClass = require('../common/superclass');

var LayoutGridBorderSupport = function() {

    var self = this;

    this._firstColumnIndex = -1;
    this._firstRowIndex = -1;
    this._lastColumnIndex = -1;
    this._lastRowIndex = -1;

    this.onCellAdded = function(column, row, cell) {
        this._checkForAddedCell(column, row, cell);
    };

    this._override('removeCell', function(baseFunction, cell) {

        baseFunction.call(self, cell);

        var cellData = cell.data;
        var rowCells = null;
        var columnCells = null;

        var found = false;
        if (cellData.row === self._firstRowIndex && self._orderedCells[cellData.row].length === 0) {
            for (let r = self._firstRowIndex + 1; r < self._orderedCells.length; r++) {
                rowCells = self._orderedCells[r];
                if (rowCells !== null && rowCells !== undefined && rowCells.length > 0) {
                    found = true;
                    self._firstRowIndex = r;
                    for (let j = 0; j < rowCells.length; j++) {
                        if (this._checkCellValidity(rowCells[j]))
                            rowCells[j].$el.addClass("first-row");
                    }
                    break;
                }
            }
            if (found === false)
                self._firstRowIndex = -1;
        }

        found = false;
        if (cellData.column === self._firstColumnIndex && self._orderedColumns[cellData.column].length === 0) {
            for (let c = self._firstColumnIndex + 1; c < self._orderedColumns.length; c++) {
                columnCells = self._orderedColumns[c];
                if (columnCells !== null && columnCells !== undefined && columnCells.length > 0) {
                    found = true;
                    self._firstColumnIndex = c;
                    for (let i = 0; i < columnCells.length; i++) {
                        if (this._checkCellValidity(columnCells[i]))
                            columnCells[i].$el.addClass("last-cell");
                    }
                    break;
                }
            }
            if (found === false)
                self._firstColumnIndex = -1;
        }

        found = false;
        if (cellData.row === self._lastRowIndex && self._orderedCells[cellData.row].length === 0) {
            for (let r = self._lastRowIndex - 1; r >= 0; r--) {
                rowCells = self._orderedCells[r];
                if (rowCells !== null && rowCells !== undefined && rowCells.length > 0) {
                    found = true;
                    self._lastRowIndex = r;
                    for (let j = 0; j < rowCells.length; j++) {
                        if (this._checkCellValidity(rowCells[j]))
                            rowCells[j].$el.addClass("last-row");
                    }
                    break;
                }
            }
            if (found === false)
                self._lastRowIndex = -1;
        }

        found = false;
        if (cellData.column === self._lastColumnIndex && self._orderedColumns[cellData.column].length === 0) {
            for (let c = self._lastColumnIndex - 1; c >= 0; c--) {
                columnCells = self._orderedColumns[c];
                if (columnCells !== null && columnCells !== undefined && columnCells.length > 0) {
                    found = true;
                    self._lastColumnIndex = c;
                    for (let i = 0; i < columnCells.length; i++) {
                        if (this._checkCellValidity(columnCells[i]))
                            columnCells[i].$el.addClass("last-cell");
                    }
                    break;
                }
            }
            if (found === false)
                self._lastColumnIndex = -1;
        }
    });

    this._override('removeRow', function(baseFunction, rowIndex, count) {

        baseFunction.call(self, rowIndex, count);

        var rowCells = null;

        var found = false;
        if (rowIndex <= self._firstRowIndex && rowIndex + count - 1 >= self._firstRowIndex) {
            for (let r = rowIndex; r < self._orderedCells.length; r++) {
                rowCells = self._orderedCells[r];
                if (rowCells !== null && rowCells !== undefined && rowCells.length > 0) {
                    found = true;
                    self._firstRowIndex = r;
                    for (let j = 0; j < rowCells.length; j++) {
                        if (this._checkCellValidity(rowCells[j]))
                            rowCells[j].$el.addClass("first-row");
                    }
                    break;
                }
            }
            if (found === false)
                self._firstRowIndex = -1;
        }

        found = false;
        if (rowIndex + count - 1 >= self._lastRowIndex) {
            for (let r = rowIndex - 1; r >= 0; r--) {
                rowCells = self._orderedCells[r];
                if (rowCells !== null && rowCells !== undefined && rowCells.length > 0) {
                    found = true;
                    self._lastRowIndex = r;
                    for (let j = 0; j < rowCells.length; j++) {
                        if (this._checkCellValidity(rowCells[j]))
                            rowCells[j].$el.addClass("last-row");
                    }
                    break;
                }
            }
            if (found === false)
                self._lastRowIndex = -1;
        }
        else if (rowIndex < self._lastRowIndex)
            self._firstRowIndex -= count;
    });

    this._override('insertRow', function(baseFunction, rowIndex, count) {

        baseFunction.call(self, rowIndex, count);

        if (rowIndex <= self._firstRowIndex) {
            self._firstRowIndex += count;
        }

        if (rowIndex <= self._lastRowIndex) {
            self._lastRowIndex += count;
        }
    });

    this._checkCellValidity = function(cell) {
        return cell !== undefined && cell.isVirtual === false;
    };

    this._checkForAddedCell = function(column, row, cell) {
        var columnCells = null;
        var rowCells = null;
        if (cell.isVirtual === false) {
            if (self._firstColumnIndex === -1 || column === self._firstColumnIndex) {
                cell.$el.addClass("first-cell");
                self._firstColumnIndex = column;
            }
            else if (column < self._firstColumnIndex) {
                columnCells = self._orderedColumns[self._firstColumnIndex];
                for (let i = 0; i < columnCells.length; i++) {
                    if (this._checkCellValidity(columnCells[i]))
                        columnCells[i].$el.removeClass("first-cell");
                }

                cell.$el.addClass("first-cell");
                self._firstColumnIndex = column;
            }

            if (self._firstRowIndex === -1 || row === self._firstRowIndex) {
                cell.$el.addClass("first-row");
                self._firstRowIndex = row;
            }
            else if (row < self._firstRowIndex) {
                rowCells = self._orderedCells[self._firstRowIndex];
                for (let j = 0; j < rowCells.length; j++) {
                    if (this._checkCellValidity(rowCells[j]))
                        rowCells[j].$el.removeClass("first-row");
                }

                cell.$el.addClass("first-row");
                self._firstRowIndex = row;
            }

            if (self._lastColumnIndex === -1 || column === self._lastColumnIndex) {
                cell.$el.addClass("last-cell");
                self._lastColumnIndex = column;
            }
            else if (column > self._lastColumnIndex) {
                columnCells = self._orderedColumns[self._lastColumnIndex];
                for (let i = 0; i < columnCells.length; i++) {
                    if (this._checkCellValidity(columnCells[i]))
                        columnCells[i].$el.removeClass("last-cell");
                }

                cell.$el.addClass("last-cell");
                self._lastColumnIndex = column;
            }

            if (self._lastRowIndex === -1 || row === self._lastRowIndex) {
                cell.$el.addClass("last-row");
                self._lastRowIndex = row;
            }
            else if (row > self._lastRowIndex) {
                rowCells = self._orderedCells[self._lastRowIndex];
                for (let j = 0; j < rowCells.length; j++) {
                    if (this._checkCellValidity(rowCells[j]))
                        rowCells[j].$el.removeClass("last-row");
                }

                cell.$el.addClass("last-row");
                self._lastRowIndex = row;
            }

            if (self._cellBorders === "cells")
                cell.$el.addClass("cell-border");
            else if (self._cellBorders === "rows")
                cell.$el.addClass("cell-border-rows");
            else if (self._cellBorders === "columns")
                cell.$el.addClass("cell-border-columns");
        }
    };

    this.setCellBorders = function(type) {
        this._cellBorders = type;

        this._firstColumnIndex = -1;
        this._firstRowIndex = -1;
        this._lastColumnIndex = -1;
        this._lastRowIndex = -1;

        if (this._cells.length === 0)
            return;

        for (let c = 0; c < this._cells.length; c++) {
            var cell = this._cells[c];
            cell.$el.removeClass("first-cell");
            cell.$el.removeClass("last-cell");
            cell.$el.removeClass("last-row");
            cell.$el.removeClass("first-row");
            this._checkForAddedCell(cell.data.column, cell.data.row, cell);
        }
    };
};

SuperClass.create(LayoutGridBorderSupport);

module.exports = LayoutGridBorderSupport;
