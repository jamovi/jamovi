
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
        this._checkForAddedCell(column, row, cell, true);
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

    this._checkForAddedCell = function(column, row, cell, cleanBorders) {
        var columnCells = null;
        var rowCells = null;
        if (cell.isVirtual === false && cell.visible()) {
            if (self.cellStatus) {
                self._defineColumnEdges(column, false);
                self._defineRowEdges(row, false);
            }

            if (cleanBorders)
                this.defineBoundaryCells();

            if (self._cellBorders === "cells")
                cell.$el.addClass("cell-border");
            else if (self._cellBorders === "rows")
                cell.$el.addClass("cell-border-rows");
            else if (self._cellBorders === "columns")
                cell.$el.addClass("cell-border-columns");
        }
    };

    this._defineColumnEdges = function (columnIndex, cleanBorders) {
        if (this.cellStatus === false)
            return;
        
        let edgeCells = this._topBottomCells[columnIndex];
        
        let start = -1;
        let last = -1;
        for (let r = 0; r < self._orderedCells.length; r++) {
            let row = self._orderedCells[r];
            if (row && columnIndex < row.length) {
                let cell = row[columnIndex];
                if (cell) {
                    if (cell.visible() && cell.isVirtual === false) {
                        if (start === -1)
                            start = r;
                        last = r;
                    }
                }
            }
        }

        if (start === -1 && edgeCells) {
            edgeCells.top.cell.$el.removeClass("first-row top-edge");
            edgeCells.bottom.cell.off('layoutcell.spanAllRowsChanged', this._rowBoundaryPropertyChanged);
            edgeCells.bottom.cell.$el.removeClass("last-row bottom-edge");
            delete this._topBottomCells[columnIndex];
            return;
        }

        let changed = false;
        if (start != -1) {
            let oldCell = edgeCells ? edgeCells.top.cell : null;
            let cell = self._orderedCells[start][columnIndex];
            if (this._firstRowIndex === -1 || this._firstRowIndex >= start)
                this._firstRowIndex = start;
            if (!edgeCells) {
                edgeCells = {};
                this._topBottomCells[columnIndex] = edgeCells;
            }
            if (cell !== oldCell) {
                cell.$el.addClass("top-edge");
                if (oldCell)
                    oldCell.$el.removeClass("first-row top-edge");
                edgeCells.top = { cell, row: start };
                changed = true;
            }
        }
        
        if (last != -1) {
            let oldCell = edgeCells && edgeCells.bottom ? edgeCells.bottom.cell : null;
            let cell = self._orderedCells[last][columnIndex];
            if (this._lastRowIndex === -1 || this._lastRowIndex <= last)
                this._lastRowIndex = last;
            if (cell !== oldCell) {
                cell.$el.addClass("bottom-edge");
                if (oldCell) {
                    oldCell.off('layoutcell.spanAllRowsChanged', this._rowBoundaryPropertyChanged);
                    oldCell.$el.removeClass("last-row bottom-edge");
                }
                edgeCells.bottom = { cell, row: last };
                cell.on('layoutcell.spanAllRowsChanged', this._rowBoundaryPropertyChanged);
                changed = true;
            }
        }
        
        if (cleanBorders && changed)
            this.defineBoundaryCells();

    };

    this._defineRowEdges = function (rowIndex, cleanBorders) {
        if (this.cellStatus === false)
            return;
        
        let edgeCells = this._leftRightCells[rowIndex];
        
        let row = self._orderedCells[rowIndex];
        if (row && row.length > 0) {
            let start = -1;
            let last = -1;
            for (let c = 0; c < row.length; c++) {
                let cell = row[c];
                if (cell) {
                    if (cell.visible() && cell.isVirtual === false) {
                        if (start === -1)
                            start = c;
                        last = c;
                    }
                }
            }

            if (start === -1 && edgeCells) {
                edgeCells.left.cell.$el.removeClass("first-cell left-edge");
                edgeCells.right.cell.off('layoutcell.horizontalStretchFactorChanged', this._colBoundaryPropertyChanged);
                edgeCells.right.cell.$el.removeClass("last-cell right-edge");
                delete this._leftRightCells[rowIndex];
                return;
            }

            let changed = false;
            if (start != -1) {
                let oldCell = edgeCells ? edgeCells.left.cell : null;
                let cell = row[start];
                if (this._firstColumnIndex === -1 || this._firstColumnIndex >= start)
                    this._firstColumnIndex = start;
                if (!edgeCells) {
                    edgeCells = {};
                    this._leftRightCells[rowIndex] = edgeCells;
                }
                if (cell !== oldCell) {
                    cell.$el.addClass("left-edge");
                    if (oldCell)
                        oldCell.$el.removeClass("first-cell left-edge");
                    edgeCells.left = { cell, column: start };
                    changed = true;
                }
            }
            
            if (last != -1) {
                let oldCell = edgeCells && edgeCells.right ? edgeCells.right.cell : null;
                let cell = row[last];
                if (this._lastColumnIndex === -1 || this._lastColumnIndex <= last)
                    this._lastColumnIndex = last;
                if (cell !== oldCell) {
                    cell.$el.addClass("right-edge");
                    if (oldCell) {
                        oldCell.off('layoutcell.horizontalStretchFactorChanged', this._colBoundaryPropertyChanged);
                        oldCell.$el.removeClass("last-cell right-edge");
                    }
                    edgeCells.right = { cell, column: last };
                    cell.on('layoutcell.horizontalStretchFactorChanged', this._colBoundaryPropertyChanged);
                    changed = true;
                }
            }
            
            if (cleanBorders && changed)
                this.defineBoundaryCells();
        }
    };

    this._topBottomCells = {};
    this._leftRightCells = {};

    this._rowBoundaryPropertyChanged = function (cell) {
        let rowIndex = cell.data.row;
        if (rowIndex === this._lastRowIndex || cell.spanAllRows)
            cell.$el.addClass('last-row');
        else
            cell.$el.removeClass('last-row');
    };
    this._rowBoundaryPropertyChanged = this._rowBoundaryPropertyChanged.bind(this);

    this._colBoundaryPropertyChanged = function (cell) {
        let colIndex = cell.data.column;
        if (colIndex === this._lastColumnIndex || cell.horizontalStretchFactor > 0)
            cell.$el.addClass('last-cell');
        else
            cell.$el.removeClass('last-cell');
    };
    this._colBoundaryPropertyChanged = this._colBoundaryPropertyChanged.bind(this);

    this.defineBoundaryCells = function () {
        for (let col in this._topBottomCells) {
            let edgeCells = this._topBottomCells[col];
            if (edgeCells) {
                let cell = edgeCells.top.cell;
                let rowIndex = edgeCells.top.row;
                if (rowIndex === this._firstRowIndex)
                    cell.$el.addClass('first-row');
                else
                    cell.$el.removeClass('first-row');
            
                cell = edgeCells.bottom.cell;
                rowIndex = edgeCells.bottom.row;
                if (rowIndex === this._lastRowIndex || cell.spanAllRows)
                    cell.$el.addClass('last-row');
                else
                    cell.$el.removeClass('last-row');
            }
        }

        for (let row in this._leftRightCells) {
            let edgeCells = this._leftRightCells[row];
            if (edgeCells) {
                let cell = edgeCells.left.cell;
                let colIndex = edgeCells.left.column;
                if (colIndex === this._firstColumnIndex)
                    cell.$el.addClass('first-cell');
                else
                    cell.$el.removeClass('first-cell');

                cell = edgeCells.right.cell;
                colIndex = edgeCells.right.column;
                if (colIndex === this._lastColumnIndex || cell.horizontalStretchFactor > 0)
                    cell.$el.addClass('last-cell');
                else
                    cell.$el.removeClass('last-cell');
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
            this._defineRowEdges(r);

        for (let c = 0; c < self._columnCount; c++)
            this._defineColumnEdges(c);
        
        this.defineBoundaryCells();
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
            this._checkForAddedCell(cell.data.column, cell.data.row, cell, false);
        }

        this.defineBoundaryCells();
    };
};

SuperClass.create(LayoutGridBorderSupport);

module.exports = LayoutGridBorderSupport;
