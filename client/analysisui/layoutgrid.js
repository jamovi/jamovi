
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const LayoutCell = require('./layoutcell');
const SuperClass = require('../common/superclass');

const LayoutGrid = function() {

    this.$el = $('<div class="silky-layout-grid"></div>');
    this.$el.css("position", "relative");
    this.$el.attr('role', 'presentation');

    this.editable = false;

    Object.assign(this, Backbone.Events);

    this._currentId = 0;
    this._cells = [];
    this._orderedCells = [];
    this._orderedColumns = [];
    this._columnCount = -1;
    this._rowCount = - 1;
    this._layouts = [];

    this._columnFactors = [];
    this._factorMultiplier = 1;

    this.maximumHeight = -1;
    this.minimumHeight = -1;
    this.maximumWidth = -1;
    this.minimumWidth = -1;

    this.stretchEndCells = true;

    this.render = function() {

    };

    this.getTranformedRow = function(row, column) {
        return this.rowTransform ? this.rowTransform(row, column) : row;
    };

    this.getTranformedColumn = function(row, column) {
        return this.columnTransform ? this.columnTransform(row, column) : column;
    };

    this.cellFromPosition = function(x, y) {
        let sx = x + this.$el.scrollLeft();
        let sy = y + this.$el.scrollTop();
        for (let i = 0; i < this._cells.length; i++) {
            let cell = this._cells[i];
            let pos = cell.$el.position();
            let size = { width: cell.$el.outerWidth(true), height: cell.$el.outerHeight(true) };
            if (sx >= pos.left && sx <= pos.left + size.width && sy >= pos.top && sy <= pos.top + size.height)
                return cell;
        }
        return null;
    };

    this.addCell = function(column, row, item, properties) {

        if (typeof column === 'string') {
            if (this.getColumnIndexFromName)
                column = this.getColumnIndexFromName(column);
            else
                column = -1;
        }

        if (column < 0)
            return null;

        if (typeof row === 'string') {
            if (this.getColumnIndexFromName)
                row = this.getRowIndexFromName(row);
            else
                row = -1;
        }

        if (row < 0)
            return null;

        let cell = new LayoutCell(this, properties);
        cell._id = this._currentId++;
        cell.$el.addClass('silky-layout-cell');
        cell.setContent(item);
        if (this._addCellEventListeners)
            this._addCellEventListeners(cell);

        let orgColumn = column;
        let orgRow = row;

        row = this.getTranformedRow(row, column);
        column = this.getTranformedColumn(row, column);

        
        if (this._orderedCells[row] === undefined)
            this._orderedCells[row] = [];
        else if (cell.spanAllRows)
            throw "This column already contains cells. Cannot add the column.";

        let oldCell = this._orderedCells[row][column];
        if (oldCell === undefined || oldCell === null) {
            if (item.params !== undefined && item.params.cell !== undefined)
                item = item;
            cell.data = { cell: cell, row: row, column: column, spans: { rows: 1, columns: 1 }, listIndex: this._cells.length, initialized: false, hasNewContent: true };
            if (item.getSpans)
                cell.data.spans = item.getSpans();
            else if (properties && properties.spans)
                cell.data.spans = properties.spans;

            if (this._orderedColumns[column] === undefined)
                this._orderedColumns[column] = [];

            if (cell.data.spans.columns > 1) {
                this.setStretchFactor(column, LayoutCell.defaultFormat);
                this.setStretchFactor(column + cell.data.spans.columns - 1, LayoutCell.defaultFormat);
            }
            else
                this.setStretchFactor(column, LayoutCell.defaultFormat);

            this._orderedCells[row][column] = cell;
            if (this._orderedColumns[column] === undefined)
                this._orderedColumns[column] = this._orderedColumns[column];
            this._orderedColumns[column][row] = cell;
            this._cells.push(cell);

            if (column > this._columnCount - 1)
                this._columnCount = column + 1;

            if (row > this._rowCount - 1)
                this._rowCount = row + 1;
        }
        else
            throw "Cell already exists.";
        
        if (this.onCellAdded)
            this.onCellAdded(column, row, cell);

        if (cell.$el) {
            cell.render();
            this.$el.append(cell.$el);
        }
        cell.data.initialized = true;
        
        cell.updateGridProperties();
        this.updateGridProperties();
        
        return cell;
    };

    this.setLayoutStretch = function(value) {
        this._layoutStretch = value;
        this.updateGridProperties();
    };

    this._hasStretchFactor = function() {
        for (let v of this._columnFactors) {
            if (typeof v !== 'string')
                return true;
        }

        return false;
    };

    this.updateGridProperties = function() {
        this.$el.css('grid-template-rows', 'repeat(' + (this._rowCount)  + ', max-content)');

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

        this.$el.css('grid-template-columns', str);
    };

    this.setStretchFactor = function(column, factor, force) {
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
    };

    this.removeCell = function(cell) {

        cell._parentLayout = null;

        let cellData = cell.data;

        this._cells.splice(cellData.listIndex, 1);
        this._orderedCells[cellData.row][cellData.column] = null;
        this._orderedColumns[cellData.column][cellData.row] = null;

        for (let i = cellData.listIndex; i < this._cells.length; i++)
            this._cells[i].data.listIndex = i;

        if (cell.$el)
            cell.$el.remove();

        if (this.onCellRemoved)
            this.onCellRemoved(cell);
    };

    this.removeRow = function(rowIndex, count) {

        count = count === undefined ? 1 : count;

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
                data.cell.$el.css('grid-row-start', (data.row + 1).toString());
            }
        }


        this._orderedCells.splice(rowIndex, count);

        for (let c = 0; c < this._orderedColumns.length; c++) {
            let columnCells = this._orderedColumns[c];
            columnCells.splice(rowIndex, count);
        }

        this._rowCount -= count;
    };

    this.insertRow = function(rowIndex, count) {
        for (let j = 0; j < this._cells.length; j++) {
            let data = this._cells[j].data;
            if (data.row >= rowIndex) {
                data.row += count;
                data.cell.$el.css('grid-row-start', (data.row + 1).toString());
            }
        }

        let a2 = [];
        for (let i = 0; i < count; i++)
            a2.push([]);

        this._orderedCells.splice.apply(this._orderedCells, [rowIndex, 0].concat(a2));

        this._rowCount += count;
    };

    this.setMinimumWidth = function(width) {
        this.minimumWidth = width;
    };

    this.setMaximumWidth = function(width) {
        this.maximumWidth = width;
    };

    this.setMinimumHeight = function(height) {
        this.minimumHeight = height;
    };

    this.setMaximumHeight = function(height) {
        this.maximumHeight = height;
    };

    this.getCell = function(columnIndex, rowIndex) {

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
    };

    this.getRow = function(row) {
        return this._orderedCells[row];
    };
};

SuperClass.create(LayoutGrid);

module.exports = LayoutGrid;
