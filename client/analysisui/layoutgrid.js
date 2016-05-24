
'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
var LayoutCell = require('./layoutcell').LayoutCell;
var SpacerCell = require('./layoutcell').SpacerCell;
var Overridable = require('./overridable');

var LayoutGrid = function() {
    Overridable.extendTo(this);

    this.$el = $('<div></div>');

    _.extend(this, Backbone.Events);

    this._parentCell = null;
    this._layoutValid = false;
    this._currentId = 0;
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
    this.preferredHeight = 10;
    this.preferredWidth = 10;
    this.autoSizeWidth = true;
    this.autoSizeHeight = true;
    this._resizeSuspended = 0;
    LayoutGrid.prototype._scrollbarWidth = null;
    LayoutGrid.prototype._scrollbarHeight = null;
    this.allocateSpaceForScrollbars = true;
    this.stretchEndCells = true;

    this.getScrollbarWidth = function() {
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
    };

    this.getScrollbarHeight = function() {
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
    };

    this.render = function() {
        if (this._initaliseContent()) {
            var self = this;
            window.setTimeout(function() {
                self.invalidateLayout('both', Math.random());
            }, 0);
        }
    };

    this.invalidateLayout = function(type, updateId) {
        this._layoutValid = false;
        if (this._resizeSuspended > 0) {
            if (this._hasResized !== null && this._hasResized.type !== 'both' && type !== this._hasResized.type)
                this._hasResized = {  type: 'both' };
            else if (this._hasResized === null)
                this._hasResized = {  type: type };
        }
        else if (this._processCells(type, updateId) === false)
            this._postProcessCells();
    };

    this._postProcessCells = function() {

        if (this._postProcessCellList.length > 0) {
            var gridWidth = null;
            var gridHeight = null;
            var maxFlexRow = null;

            var vScrollSpace = (this._hasVScrollbars && this.autoSizeWidth === false) ? this.getScrollbarWidth() : 0;
            var hScrollSpace = (this._hasHScrollbars && this.autoSizeHeight === false) ? this.getScrollbarHeight() : 0;

            var r;
            for (var i = 0; i < this._postProcessCellList.length; i++) {
                var cell = this._postProcessCellList[i];
                var cellData = cell.data;
                if (cell.isVirtual)
                    continue;

                if (cellData.row === this._rowCount - 1) {
                    if (gridHeight === null)
                        gridHeight = parseFloat(this.$el.css("height")) - hScrollSpace;

                    if (this.stretchEndCells && gridHeight > cell.bottom())
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
                        for (r = 0; r < this._rowStrechDetails.length; r++) {
                            this._rowStrechDetails[r].fixed += newWidth;
                            this._rowStrechDetails[r].flex -= cell.horizontalStretchFactor;
                        }
                    }
                    this._onCellRightEdgeMove(cell);
                }
                cell._queuedForPostProcess = false;
            }
        }

        this.endCellManipulation(this._animateCells);
        this._requiresPostProccessing = false;

        for (var j = 0; j < this._layouts.length; j++) {
            var layout = this._layouts[j];
            if (layout._requiresPostProccessing)
                layout._postProcessCells();
        }
    };

    this._onCellRightEdgeMove = function(cell) {
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
    };

    this._updateRowCellPositionsFrom = function(rightBoundary, nextCell) {
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
                nextCell.adjustCellHorizontally(rightBoundary, nextCell.preferredWidth());
                rightEdgeMove = diff - roomToMove;
            }
        }

        if (rightEdgeMove > 0)
            this._onCellRightEdgeMove(nextCell);
    };

    this._initaliseContent = function() {
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
    };

    this._processCells = function(type, updateId) {

        if (updateId === this._currentUpdateId)
            return false;

        this._currentUpdateId = updateId;

        if (this._ignoreLayout)
            return;

        for (var i = 0; i < this._layouts.length; i++) {
            var layout = this._layouts[i];
            if (layout._parentCell.visible() && layout._layoutValid === false)
                layout._processCells(type, updateId);
        }

        this.beginCellManipulation();
        this._requiresPostProccessing = true;

        this._calculateGrid();
        this._layoutGrid(type);

        this._layoutValid = true;

        return this._updateSize(updateId);
    };

    this._updateSize = function(updateId) {

        var height;
        var width;

        if (this._sizesInited === false) {
            height = this._maxPreferredColumnHeight > this.preferredHeight ? this._maxPreferredColumnHeight : this.preferredHeight;
            width = this.preferredWidth;
        }
        else {
            height = this.autoSizeHeight ? this.preferredHeight : this._oldKnownSize.height;
            height = this._maxPreferredColumnHeight > height ? this._maxPreferredColumnHeight : height;
            width = this.autoSizeWidth ? this.preferredWidth : this._oldKnownSize.width;
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
    };

    this.addLayout = function(name, column, row, fitToGrid, layoutView) {
        var grid = layoutView;
        this[name] = grid;
        layoutView.isChildLayout = true;
        this._layouts.push(grid);
        var cell = this.addCell(column, row, fitToGrid, grid.$el);
        layoutView._parentCell = cell;
        return cell;
    };

    this._add = function(column, row, cell) {
        cell._parentLayout = this;
        cell._id = this._currentId++;
        row = this.rowTransform ? this.rowTransform(row, column) : row;
        column = this.columnTransform ? this.columnTransform(row, column) : column;
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
    };

    this.suspendLayout = function() {
        this._resizeSuspended += 1;
    };

    this.resumeLayout = function() {
        this._resizeSuspended -= 1;
        if (this._resizeSuspended <= 0 && this._hasResized !== null) {
            this.invalidateLayout(this._hasResized.type, Math.random());
            this._hasResized = null;
            this._resizeSuspended = 0;
        }
    };

    this.addColumn = function(column, $content) {
        var cell = new LayoutCell();
        cell.$el.addClass('silky-layout-cell');
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
    };

    this._addCellEventListeners = function(cell) {
        var self = this;
        cell.on('layoutcell.contentChanged', function(updateId) {
            self.invalidateLayout('both', updateId);
        });
        cell.on('layoutcell.sizeChanged', function(type, updateId) {
            self.invalidateLayout(type, updateId);
        });
    };

    this.addCell = function(column, row, fitToGrid, $content) {

        var cell = new LayoutCell();
        cell.$el.addClass('silky-layout-cell');
        cell.setContent($content);
        this._addCellEventListeners(cell);
        cell.fitToGrid = fitToGrid;

        this._add(column, row, cell);

        return cell;
    };

    this.addSpacer = function(column, row, fitToGrid, width, height) {
        this._add(column, row, new SpacerCell(width, height, fitToGrid));
    };

    this.setCellVisibility = function(cell, value) {

        if (cell.visible() !== value) {
            cell.setVisibility(value);
            this.invalidateLayout("both", Math.random());
        }
    };

    this.removeCell = function(cell) {

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

        if (this.onCellRemoved)
            this.onCellRemoved(cell);

        this.invalidateLayout("both", Math.random());

    };

    this.removeRow = function(rowIndex, count) {

        count = _.isUndefined(count) ? 1 : count;

        this.suspendLayout();
        for (var r = 0; r < count; r++) {
            var rowCells = this.getRow(rowIndex + r);
            for (var i = 0; i < rowCells.length; i++) {
                var cell = rowCells[i];
                if (cell !== null)
                    this.removeCell(cell);
            }
        }

        for (var j = 0; j < this._cells.length; j++) {
            var data = this._cells[j].data;
            if (data.row > rowIndex)
                data.row -= count;
        }


        this._orderedCells.splice(rowIndex, count);

        for (var c = 0; c < this._orderedColumns.length; c++) {
            var columnCells = this._orderedColumns[c];
            columnCells.splice(rowIndex, count);
        }

        this._rowCount -= count;

        this.resumeLayout();
    };

    this.insertRow = function(rowIndex, count) {
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
    };

    this.setFixedWidth = function(width) {
        if (width < 0)
            this.autoSizeWidth = true;
        else {
            this.preferredWidth = width;
            this.autoSizeWidth = false;
        }
        this._dockWidth = false;
    };

    this.setDockWidth = function(value) {
        this._dockWidth = value;
        this.autoSizeWidth = false;
    };

    this.setFixedHeight = function(height) {
        if (height < 0)
            this.autoSizeHeight = true;
        else {
            this.preferredHeight = height;
            this.autoSizeHeight = false;
        }
    };

    this.setAutoSize = function() {
        this.autoSizeHeight = true;
        this._dockWidth = false;
        this.autoSizeWidth = true;
    };

    this.getCell = function(columnIndex, rowIndex) {

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
    };

    this.getRow = function(row) {
        return this._orderedCells[row];
    };

    this._calculateGrid = function() {

        var columnData;

        this._gridColumnData = [];
        this._gridRowData = [];
        this._maxPreferredColumnHeight = 0;

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
                if (cell === null || cell.visible() === false) {
                    topCells[c] = null;
                    continue;
                }

                var preferredSize = cell.preferredSize();

                columnData = this._gridColumnData[c];

                var cellWidth = preferredSize.width;

                if (cell.fitToGrid) {

                    columnData.tight = true;

                    if (columnData.left < left)
                        columnData.left = left;

                    if (columnData.width < cellWidth)
                        columnData.width = cellWidth;
                }

                if (cell.spanAllRows === false || this._rowCount === 1) {
                    var rowHeight = preferredSize.height;
                    if (rowData.height < rowHeight)
                        rowData.height = rowHeight;
                }

                if (cell.spanAllRows && this._maxPreferredColumnHeight < preferredSize.height)
                    this._maxPreferredColumnHeight = preferredSize.height;

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
    };

    this.beginCellManipulation = function() {

            for (var i = 0; i < this._cells.length; i++) {
                var cell = this._cells[i];
                if (cell.isVirtual)
                    continue;

                cell.beginManipulation();
            }
    };

    this.endCellManipulation = function(animate) {

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
    };

    this._layoutGrid = function(type) {

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
                if (cell === null || cell.visible() === false)
                    continue;

                if (cell.fitToGrid && cell.horizontalStretchFactor > 0)
                    throw "A cell cannot have a horizontal stretch factor and be fit to grid.";

                if (hasRowOnlyStrechFactor === false && cell.horizontalStretchFactor > 0 && cell.spanAllRows === false) {
                    hasRowOnlyStrechFactor = true;
                    allowRowOnlyStrechFactor = true;
                }

                if (allowRowOnlyStrechFactor)
                    allowRowOnlyStrechFactor = cell.fitToGrid === false;

                if (hasRowOnlyStrechFactor && allowRowOnlyStrechFactor === false)
                    throw "Cannot have a horizontal stretch factor and fitted cells in the same row.";

                left = cell.fitToGrid ? this._gridColumnData[c].left : left;

                var columnWidth = this._gridColumnData[c].width;
                var width = cell.fitToGrid ? columnWidth : cell.preferredWidth();

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


                if (left > contentWidth)
                    contentWidth = left;

                if ( ! cell._queuedForPostProcess && ((layoutForHeight && (cell.data.row === this._rowCount - 1 || cell.spanAllRows)) || (layoutForWidth && cell.horizontalStretchFactor > 0))) {
                    this._postProcessCellList.push(cell);
                    cell._queuedForPostProcess = true;
                }

            }
            if (r === this._rowCount - 1)
                contentHeight = top + height;
        }

        if (layoutForWidth && this.autoSizeWidth)
            this.preferredWidth = contentWidth;

        if (layoutForHeight && this.autoSizeHeight)
            this.preferredHeight = contentHeight;

        if (layoutForHeight)
            this.contentHeight = contentHeight;

        if (layoutForWidth)
            this.contentWidth = contentWidth;
    };

};

LayoutGrid.extendTo = function(target) {
    LayoutGrid.call(target);
};

module.exports.Grid = LayoutGrid;
//module.exports.prototype = LayoutGrid.prototype;
