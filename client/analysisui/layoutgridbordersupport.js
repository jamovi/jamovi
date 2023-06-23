
'use strict';

var SuperClass = require('../common/superclass');

var LayoutGridBorderSupport = function(cellStatus) {

    var self = this;
    this.cellStatus = cellStatus;

    if (cellStatus) {
        this._firstColumnIndex = -1;
        this._firstRowIndex = -1;
        this._lastColumnIndex = -1;
        this._lastRowIndex = -1;
    }

    this.onCellAdded = function(column, row, cell) {
        this._checkForAddedCell(column, row, cell);
    };

    if (cellStatus) {
        this._override('removeCell', function (baseFunction, cell) {

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

        this._override('removeRow', function (baseFunction, rowIndex, count) {

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

        this._override('insertRow', function (baseFunction, rowIndex, count) {

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
    }

    this._checkForAddedCell = function(column, row, cell) {
        var columnCells = null;
        var rowCells = null;
        if (cell.isVirtual === false && cell.visible()) {
            if (self.cellStatus) {
                self._refreshColumnStatus(column);
                self._refreshRowStatus(row);
            }

            if (self._cellBorders === "cells")
                cell.$el.addClass("cell-border");
            else if (self._cellBorders === "rows")
                cell.$el.addClass("cell-border-rows");
            else if (self._cellBorders === "columns")
                cell.$el.addClass("cell-border-columns");
        }
    };

    this._refreshColumnStatus = function (columnIndex) {
        if (this.cellStatus === false)
            return;
        
        let start = -1;
        let last = -1;
        for (let r = 0; r < self._orderedCells.length; r++) {
            let row = self._orderedCells[r];
            if (row && columnIndex < row.length) {
                let cell = row[columnIndex];
                if (cell) {
                    cell.$el.removeClass("first-row");
                    cell.$el.removeClass("last-row");
                    if (cell.visible() && cell.isVirtual === false) {
                        if (start === -1)
                            start = r;
                        last = r;
                    }
                }
            }
        }
        if (start != -1) {
            self._orderedCells[start][columnIndex].$el.addClass("first-row");
            if (this._firstRowIndex === -1 || this._firstRowIndex > start)
                this._firstRowIndex = start;
        }
        if (last != -1) {
            self._orderedCells[last][columnIndex].$el.addClass("last-row");
            if (this._lastRowIndex === -1 || this._lastRowIndex < last)
                this._lastRowIndex = last;
        }

    };

    this._refreshRowStatus = function (rowIndex) {
        if (this.cellStatus === false)
            return;
        
        let row = self._orderedCells[rowIndex];
        if (row && row.length > 0) {
            let start = -1;
            let last = -1;
            for (let c = 0; c < row.length; c++) {
                let cell = row[c];
                if (cell) {
                    cell.$el.removeClass("first-cell");
                    cell.$el.removeClass("last-cell");
                    if (cell.visible() && cell.isVirtual === false) {
                        if (start === -1)
                            start = c;
                        last = c;
                    }
                }
            }

            if (start != -1) {
                row[start].$el.addClass("first-cell");
                if (this._firstColumnIndex === -1 || this._firstColumnIndex > start)
                    this._firstColumnIndex = start;
            }
            if (last != -1) {
                row[last].$el.addClass("last-cell");
                if (this._lastColumnIndex === -1 || this._lastColumnIndex < last)
                    this._lastColumnIndex = last;
            }
        }
    };

    this.refreshCellStatus = function () {
        if (this.cellStatus === false)
            return;
        
        this._firstColumnIndex = -1;
        this._firstRowIndex = -1;
        this._lastColumnIndex = -1;
        this._lastRowIndex = -1;

        if (this._cells.length === 0)
            return;

        for (let r = 0; r < self._orderedCells.length; r++)
            this._refreshRowStatus(r);

        for (let c = 0; c < self._columnCount; c++)
            this._refreshColumnStatus(c);
    };

    this.setCellBorders = function(type) {
        this._cellBorders = type;

        if (this.cellStatus) {
            this._firstColumnIndex = -1;
            this._firstRowIndex = -1;
            this._lastColumnIndex = -1;
            this._lastRowIndex = -1;
        }

        if (this._cells.length === 0)
            return;

        for (let c = 0; c < this._cells.length; c++) {
            var cell = this._cells[c];
            if (this.cellStatus) {
                cell.$el.removeClass("first-cell");
                cell.$el.removeClass("last-cell");
                cell.$el.removeClass("last-row");
                cell.$el.removeClass("first-row");
            }
            this._checkForAddedCell(cell.data.column, cell.data.row, cell);
        }
    };
};

SuperClass.create(LayoutGridBorderSupport);

module.exports = LayoutGridBorderSupport;
