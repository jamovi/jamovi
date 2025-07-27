
'use strict';

import LayoutGrid from './layoutgrid';
import { LayoutCell } from './layoutcell';

export class BorderLayoutGrid extends LayoutGrid {

    _topBottomCells: { [key: number] : { top: { cell: LayoutCell, row: number }, bottom: { cell: LayoutCell, row: number }}} = {};
    _leftRightCells: { [key: number] : { left: { cell: LayoutCell, column: number }, right: { cell: LayoutCell, column: number }}} = {};

    _firstColumnIndex = -1;
    _firstRowIndex = -1;
    _lastColumnIndex = -1;
    _lastRowIndex = -1;

    cellStatus: boolean = false;

    _cellBorders: 'cells' | 'rows' | 'columns' | null;

    constructor() {
        super();

        this._rowBoundaryPropertyChanged = this._rowBoundaryPropertyChanged.bind(this);
        this._colBoundaryPropertyChanged = this._colBoundaryPropertyChanged.bind(this);
        this.refreshCellStatus = this.refreshCellStatus.bind(this);

        this.addEventListener('layoutcell.visibleChanged', this.refreshCellStatus);
    }

    _checkCellValidity(cell: LayoutCell): boolean {
        return cell !== undefined && cell.isVirtual === false;
    }

    override insertRow(rowIndex: number, count: number): void {
        super.insertRow(rowIndex, count);
        if (this.cellStatus === false)
            return;

        if (rowIndex <= this._firstRowIndex) {
            this._firstRowIndex += count;
        }

        if (rowIndex <= this._lastRowIndex) {
            this._lastRowIndex += count;
        }
    }

    override removeRow(rowIndex: number, count: number = 1): void {
        super.removeRow(rowIndex, count);

        if (this.cellStatus === false)
            return;

        let rowCells: LayoutCell[] = null;

        var found = false;
        if (rowIndex <= this._firstRowIndex && rowIndex + count - 1 >= this._firstRowIndex) {
            for (let r = rowIndex; r < this._orderedCells.length; r++) {
                rowCells = this._orderedCells[r];
                if (rowCells !== null && rowCells !== undefined && rowCells.length > 0) {
                    found = true;
                    this._firstRowIndex = r;
                    for (let j = 0; j < rowCells.length; j++) {
                        if (this._checkCellValidity(rowCells[j]))
                            rowCells[j].classList.add("first-row");
                    }
                    break;
                }
            }
            if (found === false)
                this._firstRowIndex = -1;
        }

        found = false;
        if (rowIndex + count - 1 >= this._lastRowIndex) {
            for (let r = rowIndex - 1; r >= 0; r--) {
                rowCells = this._orderedCells[r];
                if (rowCells !== null && rowCells !== undefined && rowCells.length > 0) {
                    found = true;
                    this._lastRowIndex = r;
                    for (let j = 0; j < rowCells.length; j++) {
                        if (this._checkCellValidity(rowCells[j]))
                            rowCells[j].classList.add("last-row");
                    }
                    break;
                }
            }
            if (found === false)
                this._lastRowIndex = -1;
        }
        else if (rowIndex < this._lastRowIndex)
            this._firstRowIndex -= count;
    }

    override removeCell(cell: LayoutCell): void {
        super.removeCell(cell);

        if (this.cellStatus === false)
            return;

        let cellData = cell.data;
        let rowCells: LayoutCell[] = null;
        let columnCells: LayoutCell[] = null;

        var found = false;
        if (cellData.row === this._firstRowIndex && this._orderedCells[cellData.row].length === 0) {
            for (let r = this._firstRowIndex + 1; r < this._orderedCells.length; r++) {
                rowCells = this._orderedCells[r];
                if (rowCells !== null && rowCells !== undefined && rowCells.length > 0) {
                    found = true;
                    this._firstRowIndex = r;
                    for (let j = 0; j < rowCells.length; j++) {
                        if (this._checkCellValidity(rowCells[j]))
                            rowCells[j].classList.add("first-row");
                    }
                    break;
                }
            }
            if (found === false)
                this._firstRowIndex = -1;
        }

        found = false;
        if (cellData.column === this._firstColumnIndex && this._orderedColumns[cellData.column].length === 0) {
            for (let c = this._firstColumnIndex + 1; c < this._orderedColumns.length; c++) {
                columnCells = this._orderedColumns[c];
                if (columnCells !== null && columnCells !== undefined && columnCells.length > 0) {
                    found = true;
                    this._firstColumnIndex = c;
                    for (let i = 0; i < columnCells.length; i++) {
                        if (this._checkCellValidity(columnCells[i]))
                            columnCells[i].classList.add("last-cell");
                    }
                    break;
                }
            }
            if (found === false)
                this._firstColumnIndex = -1;
        }

        found = false;
        if (cellData.row === this._lastRowIndex && this._orderedCells[cellData.row].length === 0) {
            for (let r = this._lastRowIndex - 1; r >= 0; r--) {
                rowCells = this._orderedCells[r];
                if (rowCells !== null && rowCells !== undefined && rowCells.length > 0) {
                    found = true;
                    this._lastRowIndex = r;
                    for (let j = 0; j < rowCells.length; j++) {
                        if (this._checkCellValidity(rowCells[j]))
                            rowCells[j].classList.add("last-row");
                    }
                    break;
                }
            }
            if (found === false)
                this._lastRowIndex = -1;
        }

        found = false;
        if (cellData.column === this._lastColumnIndex && this._orderedColumns[cellData.column].length === 0) {
            for (let c = this._lastColumnIndex - 1; c >= 0; c--) {
                columnCells = this._orderedColumns[c];
                if (columnCells !== null && columnCells !== undefined && columnCells.length > 0) {
                    found = true;
                    this._lastColumnIndex = c;
                    for (let i = 0; i < columnCells.length; i++) {
                        if (this._checkCellValidity(columnCells[i]))
                            columnCells[i].classList.add("last-cell");
                    }
                    break;
                }
            }
            if (found === false)
                this._lastColumnIndex = -1;
        }
    }

    override onCellAdded(column: number, row: number, cell: LayoutCell) {
        super.onCellAdded(column, row, cell);

        this._checkForAddedCell(column, row, cell, true);
    }

    _checkForAddedCell(column, row, cell: LayoutCell, cleanBorders) {
        var columnCells = null;
        var rowCells = null;
        if (cell.isVirtual === false && cell.visible()) {
            if (this.cellStatus) {
                this._defineColumnEdges(column, false);
                this._defineRowEdges(row, false);
            }

            if (cleanBorders)
                this.defineBoundaryCells();

            if (this._cellBorders === "cells")
                cell.classList.add("cell-border");
            else if (this._cellBorders === "rows")
                cell.classList.add("cell-border-rows");
            else if (this._cellBorders === "columns")
                cell.classList.add("cell-border-columns");
        }
    }

    _defineColumnEdges(columnIndex, cleanBorders=false) {
        if (this.cellStatus === false)
            return;
        
        let edgeCells = this._topBottomCells[columnIndex];
        
        let start = -1;
        let last = -1;
        for (let r = 0; r < this._orderedCells.length; r++) {
            let row = this._orderedCells[r];
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
            edgeCells.top.cell.classList.remove("first-row", "top-edge");
            edgeCells.bottom.cell.removeEventListener('layoutcell.spanAllRowsChanged', this._rowBoundaryPropertyChanged);
            edgeCells.bottom.cell.classList.remove("last-row", "bottom-edge");
            delete this._topBottomCells[columnIndex];
            return;
        }

        let changed = false;
        if (start != -1) {
            let oldCell = edgeCells ? edgeCells.top.cell : null;
            let cell = this._orderedCells[start][columnIndex];
            if (this._firstRowIndex === -1 || this._firstRowIndex >= start)
                this._firstRowIndex = start;
            if (!edgeCells) {
                edgeCells = { top: undefined, bottom: undefined };
                this._topBottomCells[columnIndex] = edgeCells;
            }
            if (cell !== oldCell) {
                cell.classList.add("top-edge");
                if (oldCell)
                    oldCell.classList.remove("first-row", "top-edge");
                edgeCells.top = { cell, row: start };
                changed = true;
            }
        }
        
        if (last != -1) {
            let oldCell = edgeCells && edgeCells.bottom ? edgeCells.bottom.cell : null;
            let cell = this._orderedCells[last][columnIndex];
            if (this._lastRowIndex === -1 || this._lastRowIndex <= last)
                this._lastRowIndex = last;
            if (cell !== oldCell) {
                cell.classList.add("bottom-edge");
                if (oldCell) {
                    oldCell.removeEventListener('layoutcell.spanAllRowsChanged', this._rowBoundaryPropertyChanged);
                    oldCell.classList.remove("last-row", "bottom-edge");
                }
                edgeCells.bottom = { cell, row: last };
                cell.addEventListener('layoutcell.spanAllRowsChanged', this._rowBoundaryPropertyChanged);
                changed = true;
            }
        }
        
        if (cleanBorders && changed)
            this.defineBoundaryCells();

    }

    _defineRowEdges(rowIndex, cleanBorders=false) {
        if (this.cellStatus === false)
            return;
        
        let edgeCells = this._leftRightCells[rowIndex];
        
        let row = this._orderedCells[rowIndex];
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
                edgeCells.left.cell.classList.remove("first-cell", "left-edge");
                edgeCells.right.cell.removeEventListener('layoutcell.horizontalStretchFactorChanged', this._colBoundaryPropertyChanged);
                edgeCells.right.cell.classList.remove("last-cell", "right-edge");
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
                    edgeCells = { left: undefined, right: undefined };
                    this._leftRightCells[rowIndex] = edgeCells;
                }
                if (cell !== oldCell) {
                    cell.classList.add("left-edge");
                    if (oldCell)
                        oldCell.classList.remove("first-cell", "left-edge");
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
                    cell.classList.add("right-edge");
                    if (oldCell) {
                        oldCell.removeEventListener('layoutcell.horizontalStretchFactorChanged', this._colBoundaryPropertyChanged);
                        oldCell.classList.remove("last-cell", "right-edge");
                    }
                    edgeCells.right = { cell, column: last };
                    cell.addEventListener('layoutcell.horizontalStretchFactorChanged', this._colBoundaryPropertyChanged);
                    changed = true;
                }
            }
            
            if (cleanBorders && changed)
                this.defineBoundaryCells();
        }
    }

    _rowBoundaryPropertyChanged(event: CustomEvent<LayoutCell>) {
        let cell = event.detail;
        let rowIndex = cell.data.row;
        if (rowIndex === this._lastRowIndex || cell.spanAllRows)
            cell.classList.add('last-row');
        else
            cell.classList.remove('last-row');
    }

    _colBoundaryPropertyChanged(event: CustomEvent<LayoutCell>) {
        let cell = event.detail;
        let colIndex = cell.data.column;
        if (colIndex === this._lastColumnIndex || cell.horizontalStretchFactor > 0)
            cell.classList.add('last-cell');
        else
            cell.classList.remove('last-cell');
    }

    defineBoundaryCells() {
        for (let col in this._topBottomCells) {
            let edgeCells = this._topBottomCells[col];
            if (edgeCells) {
                let cell = edgeCells.top.cell;
                let rowIndex = edgeCells.top.row;
                if (rowIndex === this._firstRowIndex)
                    cell.classList.add('first-row');
                else
                    cell.classList.remove('first-row');
            
                cell = edgeCells.bottom.cell;
                rowIndex = edgeCells.bottom.row;
                if (rowIndex === this._lastRowIndex || cell.spanAllRows)
                    cell.classList.add('last-row');
                else
                    cell.classList.remove('last-row');
            }
        }

        for (let row in this._leftRightCells) {
            let edgeCells = this._leftRightCells[row];
            if (edgeCells) {
                let cell = edgeCells.left.cell;
                let colIndex = edgeCells.left.column;
                if (colIndex === this._firstColumnIndex)
                    cell.classList.add('first-cell');
                else
                    cell.classList.remove('first-cell');

                cell = edgeCells.right.cell;
                colIndex = edgeCells.right.column;
                if (colIndex === this._lastColumnIndex || cell.horizontalStretchFactor > 0)
                    cell.classList.add('last-cell');
                else
                    cell.classList.remove('last-cell');
            }
        }
    }

    refreshCellStatus() {
        if (this.cellStatus === false)
            return;
        
        this._firstColumnIndex = -1;
        this._firstRowIndex = -1;
        this._lastColumnIndex = -1;
        this._lastRowIndex = -1;

        if (this._cells.length === 0)
            return;

        for (let r = 0; r < this._orderedCells.length; r++)
            this._defineRowEdges(r);

        for (let c = 0; c < this._columnCount; c++)
            this._defineColumnEdges(c);
        
        this.defineBoundaryCells();
    }

    setCellBorders(type) {
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
                cell.classList.remove("first-cell");
                cell.classList.remove("last-cell");
                cell.classList.remove("last-row");
                cell.classList.remove("first-row");
            }
            this._checkForAddedCell(cell.data.column, cell.data.row, cell, false);
        }

        this.defineBoundaryCells();
    }
}

customElements.define('jmv-bordergrid', BorderLayoutGrid);


export default BorderLayoutGrid;
