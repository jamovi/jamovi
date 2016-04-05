
'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;
var LayoutCell = require('./layoutcell').LayoutCell;
var SpacerCell = require('./layoutcell').SpacerCell;

var LayoutGrid = Backbone.View.extend({

    initialize: function() {

        this.hasFocus = false;
        this._firstColumnIndex = -1;
        this._firstRowIndex = -1;
        this._layoutValid = false;
        this._currentId = 0;
        this._selectedCells = [];
        this._oldKnownSize = { width: 0, height: 0, hScrollSpace: false, vScrollSpace: false };
        this._sizesInited = false;
        this._dockWidth = false;
        this._hasResized = null;
        this._cells = [];
        this._orderedCells = [];
        this._orderedColumns = [];
        this._columnCount = -1;
        this._rowCount = - 1;
        this._layouts = [];
        this.preferedHeight = 10;
        this.preferedWidth = 10;
        this.autoSizeWidth = true;
        this.autoSizeHeight = true;
        this._resizeSuspended = 0;
        LayoutGrid.prototype._scrollbarWidth = null;
        LayoutGrid.prototype._scrollbarHeight = null;

        if (this.onInitialise)
            this.onInitialise();
    },

    getScrollbarWidth: function() {
        if (LayoutGrid.prototype._scrollbarWidth === null) {
            var outer = document.createElement("div");
            outer.style.visibility = "hidden";
            outer.style.width = "100px";
            outer.style.msOverflowStyle = "scrollbar"; // needed for WinJS apps

            document.body.appendChild(outer);

            var widthNoScroll = outer.offsetWidth;
            // force scrollbars
            outer.style.overflow = "scroll";

            // add innerdiv
            var inner = document.createElement("div");
            inner.style.width = "100%";
            outer.appendChild(inner);

            var widthWithScroll = inner.offsetWidth;

            // remove divs
            outer.parentNode.removeChild(outer);

            LayoutGrid.prototype._scrollbarWidth = widthNoScroll - widthWithScroll;
        }
        return LayoutGrid.prototype._scrollbarWidth;
    },

    getScrollbarHeight: function() {
        if (LayoutGrid.prototype._scrollbarHeight === null) {
            var outer = document.createElement("div");
            outer.style.visibility = "hidden";
            outer.style.height = "100px";
            outer.style.msOverflowStyle = "scrollbar"; // needed for WinJS apps

            document.body.appendChild(outer);

            var heightNoScroll = outer.offsetHeight;
            // force scrollbars
            outer.style.overflow = "scroll";

            // add innerdiv
            var inner = document.createElement("div");
            inner.style.height = "100%";
            outer.appendChild(inner);

            var heightWithScroll = inner.offsetHeight;

            // remove divs
            outer.parentNode.removeChild(outer);

            LayoutGrid.prototype._scrollbarHeight = heightNoScroll - heightWithScroll;
        }
        return LayoutGrid.prototype._scrollbarHeight;
    },

    render: function() {

        this._initaliseContent();

        var self = this;
        window.setTimeout(function() {
            self._processCells('both', 0);
            self._postProcessCells();
        }, 0);
    },

    invalidateLayout: function(type, updateId) {
        this._layoutValid = false;
        if (this._resizeSuspended > 0) {
            if (this._hasResized !== null && this._hasResized.type !== 'both' && type !== this._hasResized.type)
                this._hasResized = {  type: 'both' };
            else if (this._hasResized === null)
                this._hasResized = {  type: type };
        }
        else if (this._processCells(type, updateId) === false)
            this._postProcessCells();
    },

    _postProcessCells: function() {

        if (this._postProcessCellList.length > 0) {
            var gridWidth = null;
            var gridHeight = null;
            var maxFlexRow = null;

            var vScrollSpace = (this._hasVScrollbars && this.autoSizeWidth === false) ? this.getScrollbarWidth() : 0;
            var hScrollSpace = (this._hasHScrollbars && this.autoSizeHeight === false) ? this.getScrollbarHeight() : 0;

            var r;
            for (var i = 0; i < this._postProcessCellList.length; i++) {
                var cell = this._cells[i];
                var cellData = cell.data;
                if (cell.isVirtual)
                    continue;

                if (cellData.row === this._rowCount - 1) {
                    if (gridHeight === null)
                        gridHeight = parseFloat(this.$el.css("height")) - hScrollSpace;

                    if (gridHeight > cell.bottom())
                        cell.adjustCellHeight(cell.actualHeight() + (gridHeight - cell.bottom()));
                }
                if (cell.spanAllRows) {
                    if (gridHeight === null)
                        gridHeight = parseFloat(this.$el.css("height")) - hScrollSpace;

                    cell.adjustCellVertically(0, gridHeight);
                }
                if (cell.horizontalStretchFactor > 0) {
                    if (gridWidth === null)
                        gridWidth = parseFloat(this.$el.css("width")) - vScrollSpace;

                    var flexRow = cellData.row;
                    if (cell.spanAllRows) {
                        if (maxFlexRow === null) {
                            var maxFlex = {row:0, flex:0 };
                            for (r = 0; r < this._rowCount; r++) {
                                var rowFlex = this._rowStrechDetails[r].flex;
                                if (maxFlex.flex < rowFlex)
                                    maxFlex = { row: r, flex: rowFlex };
                            }
                            maxFlexRow =  maxFlex.row;
                        }
                        flexRow = maxFlexRow;
                    }
                    var rowStrechDetails = this._rowStrechDetails[flexRow];

                    var newWidth = (gridWidth - rowStrechDetails.fixed) * (cell.horizontalStretchFactor / rowStrechDetails.flex);
                    var oldWidth = cell.actualWidth();
                    cell.adjustCellWidth(newWidth);

                    if (cell.spanAllRows) {
                        for (r = 0; r < this._rowCount; r++) {
                            this._rowStrechDetails[r].fixed += newWidth;
                            this._rowStrechDetails[r].flex -= cell.horizontalStretchFactor;
                        }
                    }
                    this._onCellRightEdgeMove(cell);
                }
            }
        }

        this.endCellManipulation(this._animateCells);
        this._requiresPostProccessing = false;

        for (var j = 0; j < this._layouts.length; j++) {
            var layout = this._layouts[j];
            if (layout._requiresPostProccessing)
                layout._postProcessCells();
        }
    },

    _onCellRightEdgeMove: function(cell) {
        var r;
        var column;
        var mCell;
        var rightBoundary = cell.right();
        var rightCell = cell.rightCell();
        if (cell.spanAllRows === false && cell.fitToGrid === false && rightCell !== null)
            this._updateRowCellPositionsFrom(rightBoundary, rightCell);
        else if (cell.spanAllRows) {
            for (r = 0; r < this._rowCount; r++) {
                column = cell.data.column;
                mCell = null;
                while (mCell === null && column + 1 < this._columnCount) {
                    column += 1;
                    mCell = this.getCell(column, r);
                }
                if (mCell !== null) {
                    this._updateRowCellPositionsFrom(rightBoundary, mCell);
                    if (mCell.spanAllRows)
                        break;
                }
            }
        }
        else if (cell.fitToGrid) {
            for (r = 0; r < this._rowCount; r++) {
                if (r !== cell.data.row) {
                    column = cell.data.column;
                    mCell = this.getCell(column, r);
                    var edge = cell.left();
                    if (mCell === null) {
                        mCell = this.getCell(column+1, r);
                        edge = cell.right();
                    }
                    if (mCell !== null && mCell.fitToGrid)
                        this._updateRowCellPositionsFrom(edge, mCell);
                }
                else if (rightCell !== null)
                    this._updateRowCellPositionsFrom(cell.right(), rightCell);
            }
        }
    },

    _updateRowCellPositionsFrom: function(rightBoundary, nextCell) {
        var rightEdgeMove = 0;

        if (nextCell.left() < rightBoundary) {
            var diff = rightBoundary - nextCell.left();
            var roomToMove = nextCell.adjustableWidth();
             if (roomToMove === 0) {
                 nextCell.adjustCellLeft(rightBoundary);
                 rightEdgeMove = diff;
             }
            else if (roomToMove >= diff)
                nextCell.adjustCellHorizontally(rightBoundary, nextCell.actualWidth() - diff);
            else {
                nextCell.adjustCellHorizontally(rightBoundary, nextCell.preferedWidth());
                rightEdgeMove = diff - roomToMove;
            }
        }

        if (rightEdgeMove > 0)
            this._onCellRightEdgeMove(nextCell);
    },

    _initaliseContent: function() {
        this.$el.css("position", "relative");
        var foundNewContent = false;

        for (var i = 0; i < this._layouts.length; i++) {
            var newContent = this._layouts[i]._initaliseContent();
            if (newContent)
                foundNewContent = newContent;
        }

        for (var j = 0; j < this._cells.length; j++) {
            var cell = this._cells[j];
            var cellData = cell.data;
            if (cellData.initialized)
                continue;

            if (cell.render)
                cell.render();
            if (cell.$el)
                this.$el.append(cell.$el);
            cellData.initialized = true;
            foundNewContent = true;
        }

        return foundNewContent;
    },

    _processCells: function(type, updateId) {

        if (updateId === this._currentUpdateId)
            return false;

        this._currentUpdateId = updateId;

        if (this._ignoreLayout)
            return;

        for (var i = 0; i < this._layouts.length; i++) {
            var layout = this._layouts[i];
            if (layout._layoutValid === false)
                layout._processCells(type, updateId);
        }

        this.beginCellManipulation();
        this._requiresPostProccessing = true;

        this._calculateGrid();
        this._layoutGrid(type);

        this._layoutValid = true;

        return this._updateSize(updateId);
    },

    _updateSize: function(updateId) {

        var height;
        var width;

        if (this._sizesInited === false) {
            height = this._maxPreferedColumnHeight > this.preferedHeight ? this._maxPreferedColumnHeight : this.preferedHeight;
            width = this.preferedWidth;
        }
        else {
            height = this.autoSizeHeight ? this.preferedHeight : this._oldKnownSize.height;
            height = this._maxPreferedColumnHeight > height ? this._maxPreferedColumnHeight : height;
            width = this.autoSizeWidth ? this.preferedWidth : this._oldKnownSize.width;
        }

        this._hasHScrollbars = this.autoSizeWidth === false && (this.allocateSpaceForScrollbars === true || this.contentWidth > width);
        this._hasVScrollbars = this.autoSizeHeight === false && (this.allocateSpaceForScrollbars === true || this.contentHeight > height);

        var properties = { "width" : width, "height" : height  };

        var makeSpaceForVScroll = this._hasVScrollbars && this.autoSizeWidth;
        var makeSpaceForHScroll = this._hasHScrollbars && this.autoSizeHeight;

        if (makeSpaceForVScroll)
            properties["margin-right"] = this.getScrollbarWidth();
        if (makeSpaceForHScroll)
            properties["margin-bottom"] = this.getScrollbarHeight();

        var widthChanged = this._oldKnownSize.width !== properties.width || this._oldKnownSize.vScrollSpace !== makeSpaceForVScroll;
        var heightChanged = this._oldKnownSize.height !== properties.height || this._oldKnownSize.hScrollSpace !== makeSpaceForHScroll;
        var eventFired = false;
        if (this._sizesInited === false || widthChanged || heightChanged) {

            this._oldKnownSize.width = properties.width;
            this._oldKnownSize.height = properties.height;
            this._oldKnownSize.hScrollSpace = makeSpaceForHScroll;
            this._oldKnownSize.vScrollSpace = makeSpaceForVScroll;

            this.$el.css(properties);
            var type = 'both';
            if (widthChanged !== heightChanged)
                type = widthChanged ? 'width' : 'height';

            if (this._sizesInited) {
                this.$el.trigger('layoutgrid.sizeChanged', { type: type, updateId: updateId } );
                if (this.isChildLayout)
                    eventFired = true;
            }
        }

        this._sizesInited = true;

        return eventFired;
    },

    allocateSpaceForScrollbars: true,

    addLayout: function(name, column, row, fitToGrid, layoutView) {
        var grid = layoutView;
        this[name] = grid;
        layoutView.isChildLayout = true;
        this._layouts.push(grid);
        return this.addCell(column, row, fitToGrid, grid.$el);
    },

    _add: function(column, row, cell) {

        if (cell.isVirtual === false) {
            if (this._firstColumnIndex === -1 || column === this._firstColumnIndex) {
                cell.$el.addClass("first-cell");
                this._firstColumnIndex = column;
            }
            else if (column < this._firstColumnIndex) {
                var columnCells = this._orderedColumns[this._firstColumnIndex];
                for (var i = 0; i < columnCells.length; i++)
                    columnCells[i].$el.removeClass("first-cell");

                cell.$el.addClass("first-cell");
                this._firstColumnIndex = column;
            }

            if (this._firstRowIndex === -1 || row === this._firstRowIndex) {
                cell.$el.addClass("first-row");
                this._firstRowIndex = row;
            }
            else if (row < this._firstRowIndex) {
                var rowCells = this._orderedCells[this._firstRowIndex];
                for (var j = 0; j < rowCells.length; j++)
                    rowCells[j].$el.removeClass("first-row");

                cell.$el.addClass("first-row");
                this._firstRowIndex = row;
            }

            if (this._cellBorders)
                cell.$el.addClass("cell-border");
        }

        cell._parentLayout = this;
        cell._id = this._currentId++;
        row = this.rowTransform(row, column);
        column = this.columnTransform(row, column);
        if (_.isUndefined(this._orderedCells[row]))
            this._orderedCells[row] = [];
        else if (cell.spanAllRows)
            throw "This column already contains cells. Cannot add the column.";

        if (_.isUndefined(this._orderedColumns[column]))
            this._orderedColumns[column] = [];

        var oldCell = this._orderedCells[row][column];
        if (_.isUndefined(oldCell) || oldCell === null) {
            this._newCellsAdded = true;
            var cellData = { cell: cell, row: row, column: column, listIndex: this._cells.length, initialized: false };
            cell.data = cellData;
            this._orderedCells[row][column] = cell;
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
            this.onCellAdded(cell);
    },

    renderNewCells: function() {
        if (this._initaliseContent()) {
            var self = this;
            window.setTimeout(function() {
                self.invalidateLayout('both', Math.random());
            }, 0);
        }
    },

    suspendLayout: function() {
        this._resizeSuspended += 1;
    },

    resumeLayout: function() {
        this._resizeSuspended -= 1;
        if (this._resizeSuspended <= 0 && this._hasResized !== null) {
            this.invalidateLayout(this._hasResized.type, Math.random());
            this._hasResized = null;
            this._resizeSuspended = 0;
        }
    },

    addColumn: function(column, $content) {
        var cell = new LayoutCell({ className: "silky-layout-cell", model: { column: column, row: 0 } });
        cell.setContent($content);
        this._addCellEventListeners(cell);
        cell.fitToGrid = false;
        cell.spanAllRows = true;

        if (_.isUndefined(this._columns))
            this._columns = [];

        if (_.isUndefined(this._columns[column]))
            this._columns[column] = cell;
        else
            throw "Column already exists.";

        this._add(column, 0, cell);

        return cell;
    },

    _addCellEventListeners: function(cell) {
        var self = this;
        cell.on('layoutcell.contentChanged', function(updateId) {
            self.invalidateLayout('both', updateId);
        });
        cell.on('layoutcell.sizeChanged', function(type, updateId) {
            self.invalidateLayout(type, updateId);
        });
        cell.on('layoutcell.clicked', function(ctrlKey, shiftKey) {
            self.onSelectionChanged(cell, ctrlKey, shiftKey);
        });
    },

    onSelectionChanged: function(cell, ctrlKey, shiftKey) {
        var changed = false;
        var selected = cell.isSelected();
        var selectedCell = null;

        if (this._selectedCells.length > 0 && shiftKey) {
            var cell2 = this._selectedCells[this._selectedCells.length - 1];
            var rStart = cell.data.row;
            var cStart = cell.data.column;
            var rEnd = cell2.data.row;
            var cEnd = cell2.data.column;
            var rDiff = rEnd - rStart;
            var cDiff = cEnd - cStart;
            var rDir = rDiff < 0 ? -1 : 1;
            var cDir = cDiff < 0 ? -1 : 1;

            for (var i = 0; i < this._selectedCells.length; i++) {
                selectedCell = this._selectedCells[i];
                var rSel = selectedCell.data.row;
                var cSel = selectedCell.data.column;
                if (((rStart*rDir >= rSel*rDir) && (cStart*cDir >= cSel*cDir) && ((rDiff * rDir) >= ((rEnd - rSel) * rDir)) && ((cDiff * cDir) >= ((cEnd - cSel) * cDir))) === false) { //outside of range
                    selectedCell.setSelection(false, false, false);
                    selectedCell.$el.removeClass('selected');
                }
            }

            this._selectedCells = [];

            for (var r = rStart; r*rDir <= rEnd*rDir; r+=rDir) {
                for (var c = cStart; c*cDir <= cEnd*cDir; c+=cDir) {
                    var tCell = this.getCell(c, r);
                    tCell.$el.addClass('selected');
                    tCell.setSelection(true, ctrlKey, shiftKey);
                    this._selectedCells.push(tCell);
                }
            }
        }
        else if (selected === false || ctrlKey === false) {
            changed = true;
            cell.setSelection(true, ctrlKey, shiftKey);
            cell.$el.addClass('selected');
            if (ctrlKey)
                this._selectedCells.push(cell);
            else {
                for (var j = 0; j < this._selectedCells.length; j++) {
                    selectedCell = this._selectedCells[j];
                    if (selectedCell._id !== cell._id) {
                        selectedCell.setSelection(false, false, false);
                        selectedCell.$el.removeClass('selected');
                    }
                }
                this._selectedCells = [ cell ];
            }
        }
        else if (ctrlKey && this._selectedCells.length > 1) {
            changed = true;
            cell.setSelection(false, ctrlKey, shiftKey);
            cell.$el.removeClass('selected');
            if (ctrlKey) {
                for (var k = 0; k < this._selectedCells.length; k++) {
                    selectedCell = this._selectedCells[k];
                    if (selectedCell._id === cell._id) {
                        this._selectedCells.splice(k, 1);
                        break;
                    }
                }
            }
        }

        if (changed)
            this.trigger('layoutgrid.selectionChanged');

        var gotFocus = this.hasFocus === false;
        this.hasFocus = true;

        if (gotFocus)
            this.trigger('layoutgrid.gotFocus');


    },

    clearSelection: function() {
        for (var i = 0; i < this._selectedCells.length; i++) {
            var selectedCell = this._selectedCells[i];
            selectedCell.setSelection(false, false, false);
            selectedCell.$el.removeClass('selected');
        }
        this._selectedCells = [];

        var lostFocus = this.hasFocus === true;
        this.hasFocus = false;

        if (lostFocus)
            this.trigger('layoutgrid.lostFocus');


    },

    addCell: function(column, row, fitToGrid, $content) {

        var cell = new LayoutCell({ className: "silky-layout-cell" });
        cell.setContent($content);
        this._addCellEventListeners(cell);
        cell.fitToGrid = fitToGrid;

        this._add(column, row, cell);

        return cell;
    },

    addSpacer: function(column, row, fitToGrid, width, height) {
        this._add(column, row, new SpacerCell(width, height, fitToGrid));
    },

    removeCell: function(cell) {

        cell.off('layoutcell.contentChanged');
        cell.off('layoutcell.sizeChanged');
        cell._parentLayout = null;

        var cellData = cell.data;

        this._cells.splice(cellData.listIndex, 1);
        this._orderedCells[cellData.row][cellData.column] = null;
        this._orderedColumns[cellData.column][cellData.row] = null;

        for (var i = cellData.listIndex; i < this._cells.length; i++)
            this._cells[i].data.listIndex = i;

        if (cell.$el)
            cell.$el.remove();

        this._firstRowIndex = -1;
        if (cellData.row === this._firstRowIndex && this._orderedCells[cellData.row].length === 0) {
            for (var r = this._firstRowIndex + 1; r < this._orderedCells.length; r++) {
                var rowCells = this._orderedCells[r];
                if (rowCells !== null && _.isUndefined(rowCells) === false && rowCells.length > 0) {
                    this._firstRowIndex = r;
                    break;
                }
            }
        }

        this._firstColumnIndex = -1;
        if (cellData.column === this._firstColumnIndex && this._orderedColumns[cellData.column].length === 0) {
            for (var c = this._firstColumnIndex + 1; c < this._orderedColumns.length; c++) {
                var columnCells = this._orderedColumns[c];
                if (columnCells !== null && _.isUndefined(columnCells) === false && columnCells.length > 0) {
                    this._firstColumnIndex = c;
                    break;
                }
            }
        }

        if (this.onCellRemoved)
            this.onCellRemoved(cell);

        this.invalidateLayout("both");
    },

    removeRow: function(rowIndex) {

        this.suspendLayout();
        var rowCells = this.getRow(rowIndex);
        for (var i = 0; i < rowCells.length; i++) {
            var cell = rowCells[i];
            if (cell !== null)
                this.removeCell(cell);
        }

        for (var j = 0; j < this._cells.length; j++) {
            var data = this._cells[j].data;
            if (data.row > rowIndex)
                data.row -= 1;
        }


        this._orderedCells.splice(rowIndex, 1);

        for (var c = 0; c < this._orderedColumns.length; c++) {
            var columnCells = this._orderedColumns[c];
            columnCells.splice(rowIndex, 1);
        }

        this._rowCount -= 1;

        this.resumeLayout();
    },

    insertRow:function(rowIndex, count) {
        for (var j = 0; j < this._cells.length; j++) {
            var data = this._cells[j].data;
            if (data.row >= rowIndex)
                data.row += count;
        }

        var a2 = [];
        for (var i = 0; i < count; i++)
            a2.push([]);

        this._orderedCells.splice.apply(this._orderedCells, [rowIndex, 0].concat(a2));

        this._rowCount += count;
    },

    rowTransform: function(row, column) {
        return row;
    },

    columnTransform: function(row, column) {
        return column;
    },

    setFixedWidth: function(width) {
        this.preferedWidth = width;
        this._dockWidth = false;
        this.autoSizeWidth = false;
    },

    setDockWidth: function(value) {
        this._dockWidth = value;
        this.autoSizeWidth = false;
    },

    setFixedHeight: function(height) {
        this.preferedHeight = height;
        this.autoSizeHeight = false;
    },

    setAutoSize: function() {
        this.autoSizeHeight = true;
        this._dockWidth = false;
        this.autoSizeWidth = true;
    },

    setCellBorders: function() {
        this._cellBorders = true;
    },

    getCell: function(columnIndex, rowIndex) {

        var row = this._orderedCells[rowIndex];
        if (_.isUndefined(row))
            return null;

        var cell = row[columnIndex];
        if (_.isUndefined(cell) || cell === null) {
            if (rowIndex !== 0) {
                 cell = this.getCell(columnIndex, 0);
                if (cell !== null && cell.spanAllRows === false)
                    return null;
            }
            else
                return null;
        }

        return cell;
    },

    getRow: function(row) {
        return this._orderedCells[row];
    },

    _calculateGrid: function() {

        var columnData;

        this._gridColumnData = [];
        this._gridRowData = [];
        this._maxPreferedColumnHeight = 0;

        var top = 0;
        var firstRow = true;
        for (var r = 0; r < this._rowCount; r++) {
            var left = 0;
            var leftCell = null;
            var topCells = [];
            if (_.isUndefined(this._gridRowData[r]))
                this._gridRowData[r] = { top: top, height: 0 };
            var rowData = this._gridRowData[r];
            var firstCell = true;
            for (var c = 0; c < this._columnCount; c++) {

                if (_.isUndefined(this._gridColumnData[c]))
                    this._gridColumnData[c] = { left: 0, width: 0, tight: false };

                var cell = this.getCell(c, r);
                if (cell === null) {
                    topCells[c] = null;
                    continue;
                }

                var preferedSize = cell.preferedSize();

                columnData = this._gridColumnData[c];

                var cellWidth = preferedSize.width;

                if (cell.fitToGrid) {

                    columnData.tight = true;

                    if (columnData.left < left)
                        columnData.left = left;

                    if (columnData.width < cellWidth)
                        columnData.width = cellWidth;
                }

                if (cell.spanAllRows === false || this._rowCount === 1) {
                    var rowHeight = preferedSize.height;
                    if (rowData.height < rowHeight)
                        rowData.height = rowHeight;
                }

                if (cell.spanAllRows && this._maxPreferedColumnHeight < preferedSize.height)
                    this._maxPreferedColumnHeight = preferedSize.height;

                left += cellWidth;

                leftCell = cell;
                topCells[c] = cell;

                firstCell = false;
            }
            top += rowData.height;
            firstRow = false;
        }

        for (var i = 0; i < this._gridColumnData.length - 1; i++) {
            columnData = this._gridColumnData[i];
            var nextColumnData = this._gridColumnData[i + 1];
            if (columnData.tight) {
                if (nextColumnData.left < columnData.left + columnData.width)
                    nextColumnData.left = columnData.left + columnData.width;
                else
                    columnData.width = nextColumnData.left - columnData.left;
            }
        }
    },

    beginCellManipulation: function() {

            for (var i = 0; i < this._cells.length; i++) {
                var cell = this._cells[i];
                if (cell.isVirtual)
                    continue;

                cell.beginManipulation();
            }
    },

    endCellManipulation: function(animate) {

        var animatedCells = 0;
        for (var i = 0; i < this._cells.length; i++) {
            var cell = this._cells[i];
            if (cell.isVirtual)
                continue;

            if (cell.manipulating())
            {
                if (cell.endManipulation(animate && animatedCells < 25))
                    animatedCells += 1;
            }
        }
    },

    _layoutGrid: function(type) {

        var layoutForHeight = (type === 'height' || type === 'both');
        var layoutForWidth = (type === 'width' || type === 'both');

        var contentHeight = 0;
        var contentWidth = 0;
        this._rowStrechDetails = [];
        this._postProcessCellList = [];
        for (var r = 0; r < this._rowCount; r++) {
            this._rowStrechDetails[r] = { flex: 0, fixed: 0 };
            var left = 0;
            var top = this._gridRowData[r].top;
            var height = this._gridRowData[r].height;
            var allowRowOnlyStrechFactor = true;
            var hasRowOnlyStrechFactor = false;
            for (var c = 0; c < this._columnCount; c++) {
                var cell = this.getCell(c, r);
                if (cell === null)
                    continue;

                if (cell.fitToGrid && cell.horizontalStretchFactor > 0)
                    throw "A cell cannot have a horizontal strech factor and be fit to grid.";

                if (hasRowOnlyStrechFactor === false && cell.horizontalStretchFactor > 0 && cell.spanAllRows === false) {
                    hasRowOnlyStrechFactor = true;
                    allowRowOnlyStrechFactor = true;
                }

                if (allowRowOnlyStrechFactor)
                    allowRowOnlyStrechFactor = cell.fitToGrid === false;

                if (hasRowOnlyStrechFactor && allowRowOnlyStrechFactor === false)
                    throw "Cannot have a horizontal strech factor and fitted cells in the same row.";

                left = cell.fitToGrid ? this._gridColumnData[c].left : left;

                //var contentsWidth = cell.preferedWidth();
                var columnWidth = this._gridColumnData[c].width;
                var width = cell.fitToGrid ? columnWidth : cell.preferedWidth();

                if (cell.spanAllRows === false || r === 0) {
                    if (type === 'height')
                        cell.adjustCellVertically(top, height);
                    else if (type === 'width')
                        cell.adjustCellHorizontally(left, width);
                    else
                        cell.adjustCell(left, top, width, height);
                }

                left += width;

                if (cell.horizontalStretchFactor > 0)
                    this._rowStrechDetails[r].flex += cell.horizontalStretchFactor;
                else
                    this._rowStrechDetails[r].fixed += width;

                if (c === this._columnCount - 1 && left > contentWidth)
                    contentWidth = left;

                if (layoutForHeight && (cell.data.row === this._rowCount - 1 || cell.spanAllRows))
                    this._postProcessCellList.push(cell);
                else if (layoutForWidth && cell.horizontalStretchFactor > 0)
                    this._postProcessCellList.push(cell);
            }
            if (r === this._rowCount - 1)
                contentHeight = top + height;
        }

        if (layoutForWidth && this.autoSizeWidth)
            this.preferedWidth = contentWidth;

        if (layoutForHeight && this.autoSizeHeight)
            this.preferedHeight = contentHeight;

        if (layoutForHeight)
            this.contentHeight = contentHeight;

        if (layoutForWidth)
            this.contentWidth = contentWidth;
    }
});

module.exports.Grid = LayoutGrid;
module.exports.prototype = LayoutGrid.prototype;
