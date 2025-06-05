
'use strict';

import LayoutCell, { ICellProperties, ICellContentsItem } from './layoutcell';


type Constructor = new (...args: any[]) => any;
const BaseClass = class {};
export function LayoutGridItem<TBase extends Constructor = typeof BaseClass, TGrid extends new () => any = typeof LayoutGrid>(Base: TBase = BaseClass as TBase, Grid: TGrid = LayoutGrid as TGrid) {
    return class extends Base {
        el: InstanceType<TGrid>;

        constructor(...args: any[]) {
            super(args[0]);

            this.el = new Grid();
        }
    }
}

export class LayoutGrid extends HTMLElement {
        _orderedCells: LayoutCell[][] = [];
        _orderedColumns: LayoutCell[][] = [];
        _cells: LayoutCell[] = [];
        editable: boolean = false;
        stretchEndCells = true;
        _rowCount: number = -1;
        _columnCount: number = -1;

        private _layoutStretch: boolean = false;
        private _currentId = 0;
        private _columnFactors: (number | string)[] = [];
        private _factorMultiplier = 1;

        constructor() {
            super();
            this.classList.add('silky-layout-grid');
            this.style.position = "relative";
            this.setAttribute('role', 'presentation');
        }

        protected getTranformedRow(row: number, column: number): number {
            return row;
        }

        protected getTranformedColumn(row: number, column: number): number {
            return column;
        }

        public cellFromPosition(x: number, y: number) : LayoutCell | null {
            let sx = x + this.scrollLeft;
            let sy = y + this.scrollTop;
            for (let i = 0; i < this._cells.length; i++) {
                let cell = this._cells[i];
                var pos = { 
                    top: cell.offsetTop, 
                    left: cell.offsetLeft, 
                };
                let style = getComputedStyle(cell);
                let size = {
                    width: cell.offsetWidth + parseFloat(style.marginLeft) + parseFloat(style.marginRight),
                    height: cell.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom)
                };
                if (sx >= pos.left && sx <= pos.left + size.width && sy >= pos.top && sy <= pos.top + size.height)
                    return cell;
            }
            return null;
        }

        public getColumnIndexFromName?(name: string): number;

        public getRowIndexFromName?(name: string): number;

        public addCell(column: number | string, row: number | string, item: HTMLElement | ICellContentsItem, properties?: ICellProperties) : LayoutCell | null {

            let colIndex: number;
            if (typeof column === 'string') {
                if (this.getColumnIndexFromName)
                    colIndex = this.getColumnIndexFromName(column);
                else
                    colIndex = -1;
            }
            else
                colIndex = column

            if (colIndex < 0)
                return null;

            let rowIndex: number;
            if (typeof row === 'string') {
                if (this.getRowIndexFromName)
                    rowIndex = this.getRowIndexFromName(row);
                else
                    rowIndex = -1;
            }
            else
                rowIndex = row;

            if (rowIndex < 0)
                return null;

            let cell = new LayoutCell(this, properties);
            cell._id = this._currentId++;
            cell.classList.add('silky-layout-cell');
            cell.setContent(item);
            this.onCellInitialising(cell);

            rowIndex = this.getTranformedRow(rowIndex, colIndex);
            colIndex = this.getTranformedColumn(rowIndex, colIndex);

            if (this._orderedCells[rowIndex] === undefined)
                this._orderedCells[rowIndex] = [];
            else if (cell.spanAllRows)
                throw "This column already contains cells. Cannot add the column.";

            let oldCell = this._orderedCells[rowIndex][colIndex];
            if (oldCell === undefined || oldCell === null) {
                cell.data = { cell: cell, row: rowIndex, column: colIndex, spans: { rows: 1, columns: 1 }, listIndex: this._cells.length, initialized: false, hasNewContent: true };
                if (item instanceof HTMLElement === false && item.getSpans)
                    cell.data.spans = item.getSpans();
                else if (properties && properties.spans)
                    cell.data.spans = properties.spans;

                if (this._orderedColumns[colIndex] === undefined)
                    this._orderedColumns[colIndex] = [];

                if (cell.data.spans.columns > 1) {
                    this.setStretchFactor(colIndex, LayoutCell.defaultFormat);
                    this.setStretchFactor(colIndex + cell.data.spans.columns - 1, LayoutCell.defaultFormat);
                }
                else
                    this.setStretchFactor(colIndex, LayoutCell.defaultFormat);

                this._orderedCells[rowIndex][colIndex] = cell;
                if (this._orderedColumns[colIndex] === undefined)
                    this._orderedColumns[colIndex] = this._orderedColumns[colIndex];
                this._orderedColumns[colIndex][rowIndex] = cell;
                this._cells.push(cell);

                if (colIndex > this._columnCount - 1)
                    this._columnCount = colIndex + 1;

                if (rowIndex > this._rowCount - 1)
                    this._rowCount = rowIndex + 1;
            }
            else
                throw "Cell already exists.";
            
            this.onCellAdded(colIndex, rowIndex, cell);

            if (cell) {
                cell.render();
                this.append(cell);
            }

            cell.data.initialized = true;
            
            cell.updateGridProperties();
            this.updateGridProperties();
            
            return cell;
        }

        protected onCellAdded(column: number, row: number, cell: LayoutCell): void {
            let event = new CustomEvent<{column: number, row: number, cell: LayoutCell}>('cell-added', { detail: { column, row, cell }});
            this.dispatchEvent(event);
        }

        protected onCellInitialising(cell: LayoutCell): void {
            let event = new CustomEvent<LayoutCell>('cell-initialising', { detail: cell });
            this.dispatchEvent(event);
        }

        public setLayoutStretch(value: boolean): void {
            this._layoutStretch = value;
            this.updateGridProperties();
        }

        private _hasStretchFactor(): boolean {
            for (let v of this._columnFactors) {
                if (typeof v !== 'string')
                    return true;
            }

            return false;
        }

        protected updateCustomGridProperties(): boolean {
            return true;
        }

        public updateGridProperties(): void {
            if (this.updateCustomGridProperties() === false)
                return;

            this.style.gridTemplateRows = 'repeat(' + (this._rowCount)  + ', max-content)';

            let repeat = 0;
            let str = '';
            let lastValue = null;
            for (let column = 0; column < this._columnFactors.length; column++) {
                let value = this._columnFactors[column];
                if (value === undefined)
                    value = LayoutCell.defaultFormat;

                if (column === this._columnFactors.length - 1) {
                    if (typeof value === 'string' ) {
                        if (this._layoutStretch && this._hasStretchFactor() === false)
                            value = 'minmax(0px, 1fr)';
                        else
                            value = 'auto';
                    }
                }

                if (lastValue === null)
                    lastValue = value;

                if (value !== lastValue) {
                    str += 'repeat(' + repeat + ', ' + (typeof lastValue !== 'string' ? 'minmax(0px, ' + (lastValue * this._factorMultiplier) + 'fr)' : lastValue) + ')';
                    repeat = 0;
                    lastValue = value;
                }

                repeat += 1;
            }

            str += 'repeat(' + repeat + ', ' + (typeof lastValue !== 'string' ? 'minmax(0px, ' + (lastValue * this._factorMultiplier) + 'fr)' : lastValue) + ')';

            this.style.gridTemplateColumns = str;
        }

        public setStretchFactor(column: number, factor: number | string, force=false): void {
            if ( ! force && this._columnFactors[column] !== undefined && this._columnFactors[column] !== LayoutCell.defaultFormat && factor === LayoutCell.defaultFormat)
                return;

            if (typeof factor === 'string' )
                this._columnFactors[column] = factor;
            else {
                let newFactor = factor * this._factorMultiplier;
                if (newFactor < 1)
                    this._factorMultiplier = 1 / factor;
                this._columnFactors[column] = factor;
            }

            this.updateGridProperties();
        }

        protected onCellRemoved(cell: LayoutCell): void {
            let event = new CustomEvent<LayoutCell>('cell-removed', { detail: cell });
            this.dispatchEvent(event);
        }

        protected onRowInserted(rowIndex: number, count: number): void {
            let event = new CustomEvent<{rowIndex: number, count: number}>('row-inserted', { detail: {rowIndex, count} });
            this.dispatchEvent(event);
        }

        protected onRowRemoved(rowIndex: number, count: number): void {
            let event = new CustomEvent<{rowIndex: number, count: number}>('row-removed', { detail: {rowIndex, count} });
            this.dispatchEvent(event);
        }

        protected removeCell(cell: LayoutCell): void {

            let cellData = cell.data;

            this._cells.splice(cellData.listIndex, 1);
            this._orderedCells[cellData.row][cellData.column] = null;
            this._orderedColumns[cellData.column][cellData.row] = null;

            for (let i = cellData.listIndex; i < this._cells.length; i++)
                this._cells[i].data.listIndex = i;

            if (cell)
                cell.remove();

            this.onCellRemoved(cell);
        }

        public removeRow(rowIndex: number, count: number = 1): void {

            for (let r = 0; r < count; r++) {
                let rowCells = this.getRow(rowIndex + r);
                for (let i = 0; i < rowCells.length; i++) {
                    let cell = rowCells[i];
                    if (cell !== null)
                        this.removeCell(cell);
                }
            }

            for (let j = 0; j < this._cells.length; j++) {
                let data = this._cells[j].data;
                if (data.row > rowIndex) {
                    data.row -= count;
                    data.cell.style.gridRowStart = (data.row + 1).toString();
                }
            }


            this._orderedCells.splice(rowIndex, count);

            for (let c = 0; c < this._orderedColumns.length; c++) {
                let columnCells = this._orderedColumns[c];
                columnCells.splice(rowIndex, count);
            }

            this._rowCount -= count;

            this.onRowRemoved(rowIndex, count);
        }

        public insertRow(rowIndex: number, count: number = 1): void {
            for (let j = 0; j < this._cells.length; j++) {
                let data = this._cells[j].data;
                if (data.row >= rowIndex) {
                    data.row += count;
                    data.cell.style.gridRowStart = (data.row + 1).toString();
                }
            }

            let a2 = [];
            for (let i = 0; i < count; i++)
                a2.push([]);

            this._orderedCells.splice.apply(this._orderedCells, [rowIndex, 0].concat(a2));

            this._rowCount += count;

            this.onRowInserted(rowIndex, count);
        }

        public getCell(columnIndex: number, rowIndex: number): LayoutCell | null {

            if (columnIndex < 0 || rowIndex < 0)
                return null;

            let row = this._orderedCells[rowIndex];
            if (row === undefined)
                return null;

            let cell = row[columnIndex];
            if (cell === undefined || cell === null) {
                if (rowIndex !== 0) {
                    cell = this.getCell(columnIndex, 0);
                    if (cell !== null && cell.spanAllRows === false)
                        return null;
                }
                else
                    return null;
            }

            return cell;
        }

        public getRow(row: number): LayoutCell[] {
            return this._orderedCells[row];
        }
}

customElements.define('jmv-layoutgrid', LayoutGrid);

export default LayoutGrid;
