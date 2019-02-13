
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
const LayoutCell = require('./layoutcell').LayoutCell;
const SpacerCell = require('./layoutcell').SpacerCell;
const SuperClass = require('../common/superclass');

const LayoutGrid = function() {

    this.$el = $('<div class="silky-layout-grid"></div>');
    this.$el.css("position", "relative");

    this.editable = false;

    Object.assign(this, Backbone.Events);

    this._parentCell = null;
    this._layoutValid = false;
    this._currentId = 0;
    this._oldKnownSize = { width: 0, height: 0, hScrollSpace: false, vScrollSpace: false };
    this._sizesInited = false;
    this._hasResized = null;
    this._cells = [];
    this._orderedCells = [];
    this._orderedColumns = [];
    this._columnCount = -1;
    this._rowCount = - 1;
    this._layouts = [];

    this.maximumHeight = -1;
    this.minimumHeight = -1;
    this.maximumWidth = -1;
    this.minimumWidth = -1;

    this.preferredHeight = -1;
    this.preferredWidth =-1;
    this.autoSizeWidth = true;
    this.autoSizeHeight = true;
    this._resizeSuspended = 0;
    this.allocateSpaceForScrollbars = true;
    this.stretchEndCells = true;
    this._parentLayout = null;
    this._preparingLayout = true;
    this._waitingForValidation = false;
    this._postProcessCellList = [];

    LayoutGrid.prototype._scrollbarWidth = null;
    this.getScrollbarWidth = function() {
        if (LayoutGrid.prototype._scrollbarWidth === null) {
            let outer = document.createElement("div");
            outer.style.visibility = "hidden";
            outer.style.width = "100px";
            outer.style.msOverflowStyle = "scrollbar"; // needed for WinJS apps

            document.body.appendChild(outer);

            let widthNoScroll = outer.offsetWidth;
            // force scrollbars
            outer.style.overflow = "scroll";

            // add innerdiv
            let inner = document.createElement("div");
            inner.style.width = "100%";
            outer.appendChild(inner);

            let widthWithScroll = inner.offsetWidth;

            // remove divs
            outer.parentNode.removeChild(outer);

            LayoutGrid.prototype._scrollbarWidth = Math.round(widthNoScroll - widthWithScroll);
        }
        return LayoutGrid.prototype._scrollbarWidth;
    };

    this._setAsPrepared = function() {
        this._preparingLayout = false;
        for (let i = 0; i < this._layouts.length; i++) {
            let layout = this._layouts[i];
            layout._setAsPrepared();
        }
    };

    this.render = function() {
        this._setAsPrepared();
        this.invalidateLayout('both', Math.random());
    };

    this.waitingForValidation = function() {
        if (this._waitingForValidation)
            return this._waitingForValidation;

        if (this._parentLayout !== null)
            return this._parentLayout.waitingForValidation();

        return false;
    };

    this._setInvalidationFlag = function(deep) {

        if (this._layoutValid) {
            this._ready = new Promise((resolve, reject) => {
                this._readyResolved = resolve;
            });
        }

        this._layoutValid = false;
        if (deep) {
            for (let j = 0; j < this._layouts.length; j++) {
                let layout = this._layouts[j];
                if (layout._parentCell === null || layout._parentCell.visible())
                    layout._setInvalidationFlag(deep);
            }
        }
    };

    this.invalidateLayout = function(type, updateId, deep) {

        this._setInvalidationFlag(deep);

        if (this.isLayoutSuspended()) {
            if (this._hasResized !== null && this._hasResized.type !== 'both' && type !== this._hasResized.type)
                this._hasResized = {  type: 'both' };
            else if (this._hasResized === null)
                this._hasResized = {  type: type };
        }
        else {
            let newContent = this._initaliseContent();
            if (this.waitingForValidation())
                return;

            this.reflow();

            if (newContent) {
                this._waitingForValidation = true;
                window.setTimeout(() => {
                    if (this._processCells(type, updateId))
                        this._postProcessCells();
                    this._waitingForValidation = false;
                }, 0);
            }
            else {
                if (this._processCells(type, updateId))
                    this._postProcessCells();
            }
        }
    };

    this.reflow = function() {
        void( this.$el[0].offsetHeight );
    };

    this.hasVScrollbar = function() {
        return this._hasVScrollbars;
    };

    this.hasHScrollbar = function() {
        return this._hasHScrollbars;
    };

    this._postProcessCells = function() {

        if (this._requiresPostProccessing) {
            if (this._postProcessCellList.length > 0) {
                let gridWidth = null;
                let gridHeight = null;
                let maxFlexRow = null;

                let vScrollSpace = (this._hasVScrollbars && this.autoSizeWidth === false) ? this.getScrollbarWidth() : 0;
                let hScrollSpace = (this._hasHScrollbars && this.autoSizeHeight === false) ? this.getScrollbarWidth() : 0;

                let r;
                for (let i = 0; i < this._postProcessCellList.length; i++) {
                    let cell = this._postProcessCellList[i];
                    let cellData = cell.data;
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

                        let flexRow = cellData.row;
                        if (cell.spanAllRows) {
                            if (maxFlexRow === null) {
                                let maxFlex = {row:0, flex:0 };
                                for (r = 0; r < this._rowCount; r++) {
                                    let rowFlex = this._rowStrechDetails[r].flex;
                                    if (maxFlex.flex < rowFlex)
                                        maxFlex = { row: r, flex: rowFlex };
                                }
                                maxFlexRow =  maxFlex.row;
                            }
                            flexRow = maxFlexRow;
                        }
                        let rowStrechDetails = this._rowStrechDetails[flexRow];

                        let newWidth = (gridWidth - rowStrechDetails.fixed) * (cell.horizontalStretchFactor / rowStrechDetails.flex);
                        let oldWidth = cell.actualWidth();
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

            this._postProcessCellList = [];
        }

        for (let j = 0; j < this._layouts.length; j++) {
            let layout = this._layouts[j];
            if (layout._parentCell === null || layout._parentCell.visible())
                layout._postProcessCells();
        }


        this._layoutValid = true;

        window.setTimeout(() => {
            if (this._layoutValid && this._readyResolved !== null)
                this._readyResolved();
        }, 0);

        this.trigger('layoutgrid.validated');
    };

    this._onCellRightEdgeMove = function(cell) {
        let r;
        let column;
        let mCell;
        let rightBoundary = cell.right();
        let rightCell = cell.rightCell();
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
                    let edge = cell.left();
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
        let rightEdgeMove = 0;

        if (nextCell.left() < rightBoundary) {
            let diff = rightBoundary - nextCell.left();
            let roomToMove = nextCell.adjustableWidth();
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

        let requiresDelay = false;
        for (let i = 0; i < this._layouts.length; i++) {
            let delay = this._layouts[i]._initaliseContent();
            if (delay)
                requiresDelay = delay;
        }

        for (let j = 0; j < this._cells.length; j++) {
            let cell = this._cells[j];
            let cellData = cell.data;

            if (cellData.hasContentChanged) {
                requiresDelay = true;
                cellData.hasContentChanged = false;
            }

            if (cellData.hasNewContent) {
                requiresDelay = true;
                if (cell.render)
                    cell.render();
                cellData.hasNewContent = false;
            }

            if (cellData.initialized === false) {
                requiresDelay = true;
                if (cell.$el)
                    this.$el.append(cell.$el);
                cellData.initialized = true;
            }
        }

        return requiresDelay;
    };

    this._processCells = function(type, updateId) {

        if (updateId === this._currentUpdateId)
            return false;

        this._currentUpdateId = updateId;

        if (this._parentCell !== null && this._parentCell.visible() === false)
            return false;

        let postProcess = false;
        for (let i = 0; i < this._layouts.length; i++) {
            let layout = this._layouts[i];
            let pp = layout._processCells(type, updateId);
            if (pp)
                postProcess = true;
        }

        if (this._layoutValid)
            return postProcess;

        this.beginCellManipulation();
        this._requiresPostProccessing = true;

        this._calculateGrid();
        this._layoutGrid(type);

        this._updateSize(type, updateId);

        return true;
    };

    this._updateSize = function(type, updateId) {

        let widthChanged = false;
        let heightChanged = false;

        let properties = { };

        if (this.autoSizeHeight && this.heightControlledByParent() === false) {
            let height = this._maxPreferredColumnHeight > this.preferredHeight ? this._maxPreferredColumnHeight : this.preferredHeight;
            height = (this.maximumHeight !== -1 && height > this.maximumHeight) ? this.maximumHeight : height;
            height = (this.minimumHeight !== -1 && height < this.minimumHeight) ? this.minimumHeight : height;
            if (this._oldKnownSize.height !== height) {
                properties.height = height;
                this._oldKnownSize.height = height;
                heightChanged = true;
            }
        }

        if (this.autoSizeWidth && this.widthControlledByParent() === false) {
            let width = this.preferredWidth;
            width = (this.maximumWidth !== -1 && width > this.maximumWidth) ? this.maximumWidth : width;
            width = (this.minimumWidth !== -1 && width < this.minimumWidth) ? this.minimumWidth : width;
            if (this._oldKnownSize.width !== width) {
                properties.width = width;
                this._oldKnownSize.width = width;
                widthChanged = true;
            }
        }

        let hadScrollBars = this._hasHScrollbars || this._hasVScrollbars;
        this._hasHScrollbars = this.autoSizeWidth === false && (this.allocateSpaceForScrollbars === true || (this._parentCell !== null && this.contentWidth > this._parentCell.actualWidth()));
        this._hasVScrollbars = this.autoSizeHeight === false && (this.allocateSpaceForScrollbars === true || (this._parentCell !== null && this.contentHeight > this._parentCell.actualHeight()));
        let scrollbarsChanged= hadScrollBars !== (this._hasHScrollbars || this._hasVScrollbars);

        let makeSpaceForHScroll = this._hasHScrollbars && this.autoSizeHeight;
        if (this._oldKnownSize.hScrollSpace !== makeSpaceForHScroll) {
            if (makeSpaceForHScroll)
                properties["padding-bottom"] = this.getScrollbarWidth();
            else
                properties["padding-bottom"] = 0;

            this._oldKnownSize.hScrollSpace = makeSpaceForHScroll;
            heightChanged = true;
        }

        let makeSpaceForVScroll = this._hasVScrollbars && this.autoSizeWidth;
        if (this._oldKnownSize.vScrollSpace !== makeSpaceForVScroll) {
            if (makeSpaceForVScroll)
                properties["padding-right"] = this.getScrollbarWidth();
            else
                properties["padding-right"] = 0;

            this._oldKnownSize.vScrollSpace = makeSpaceForVScroll;
            widthChanged = true;
        }

        let eventFired = false;
        if (widthChanged || heightChanged) {

            this.$el.css(properties);

            let eventType = 'both';
            if (widthChanged !== heightChanged)
                eventType = widthChanged ? 'width' : 'height';

            if (this._sizesInited && this._parentCell !== null) {
                this._parentCell.onContentSizeChanged({ type: eventType, updateId: updateId }); //Invalidate up the layout tree
                eventFired = true;
            }
        }

        if (scrollbarsChanged) {
            setTimeout(() => {
                this.invalidateLayout("both", Math.random(), true); //invalidate down the layout tree
            }, 0);
        }

        this._sizesInited = true;

        return eventFired;
    };

    this.isLayoutVisible = function() {

        let visible = this._parentCell === null || this._parentCell.visible();
        if (visible === false)
            return false;

        return this._parentLayout === null || this._parentLayout.isLayoutVisible();
    };

    this._addLayout = function(column, row, fitToGrid, layoutView) {
        let grid = layoutView;
        layoutView.isChildLayout = true;
        this._layouts.push(grid);
        let cell = this.addCell(column, row, fitToGrid, grid/*.$el*/, false);
        layoutView._parentCell = cell;
        layoutView._parentLayout = this;

        cell.on("layoutcell.visibleChanged", function() {
            if (cell.visible()) {
                window.setTimeout(function() {
                    layoutView.invalidateLayout('both', Math.random(), true);
                }, 0);
            }
        });
        return cell;
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
            if (sx >= cell.left() && sx <= cell.right() && sy >= cell.top() && sy <= cell.bottom())
                return cell;
        }
        return null;
    };

    this._add = function(column, row, cell) {
        cell._id = this._currentId++;
        row = this.getTranformedRow(row, column);
        column = this.getTranformedColumn(row, column);
        if (this._orderedCells[row] === undefined)
            this._orderedCells[row] = [];
        else if (cell.spanAllRows)
            throw "This column already contains cells. Cannot add the column.";

        if (this._orderedColumns[column] === undefined)
            this._orderedColumns[column] = [];

        let oldCell = this._orderedCells[row][column];
        if (oldCell === undefined || oldCell === null) {
            this._newCellsAdded = true;
            let cellData = { cell: cell, row: row, column: column, listIndex: this._cells.length, initialized: false, hasNewContent: true };
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

        this.invalidateLayout("both", Math.random());
    };

    this.suspendLayout = function() {
        this._resizeSuspended += 1;
    };

    this.isLayoutSuspended = function() {
        return this._resizeSuspended > 0 || this._preparingLayout || (this._parentLayout !== null && this._parentLayout.isLayoutSuspended());
    };

    this.resumeLayout = function() {

        if (this._resizeSuspended === 0 && this._hasResized === null)
            return;

        if (this._resizeSuspended > 0)
            this._resizeSuspended -= 1;

        if (this.isLayoutSuspended() === false) {
            if (this._hasResized !== null) {
                this.invalidateLayout(this._hasResized.type, Math.random());
                this._hasResized = null;
            }
        }
    };

    this.addCell = function(column, row, fitToGrid, item, _layoutCheck) {

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

        _layoutCheck = _layoutCheck === undefined ? true : _layoutCheck;
        //looks like a layoutGrid object
        if (_layoutCheck && "addCell" in item && "invalidateLayout" in item)
            return this._addLayout(column, row, fitToGrid, item);

        let cell = new LayoutCell(this);
        cell.$el.addClass('silky-layout-cell');
        cell.setContent(item);
        if (this._addCellEventListeners)
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

        this.invalidateLayout("both", Math.random());
    };

    this.removeRow = function(rowIndex, count) {

        count = count === undefined ? 1 : count;

        this.suspendLayout();
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
            if (data.row > rowIndex)
                data.row -= count;
        }


        this._orderedCells.splice(rowIndex, count);

        for (let c = 0; c < this._orderedColumns.length; c++) {
            let columnCells = this._orderedColumns[c];
            columnCells.splice(rowIndex, count);
        }

        this._rowCount -= count;

        this.resumeLayout();
    };

    this.insertRow = function(rowIndex, count) {
        for (let j = 0; j < this._cells.length; j++) {
            let data = this._cells[j].data;
            if (data.row >= rowIndex)
                data.row += count;
        }

        let a2 = [];
        for (let i = 0; i < count; i++)
            a2.push([]);

        this._orderedCells.splice.apply(this._orderedCells, [rowIndex, 0].concat(a2));

        this._rowCount += count;
    };

    this.setAutoSizeWidth = function(value) {
        this.autoSizeWidth = value;
    };

    this.setAutoSizeHeight = function(value) {
        this.autoSizeHeight = value;
    };

    this.setAutoSize = function(value) {
        this.autoSizeHeight = value;
        this.autoSizeWidth = value;
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

    this.widthControlledByParent = function() {
        if (this._parentCell === null)
            return false;

        return this._parentCell.horizontalStretchFactor !== 0 && this._parentCell.dockContentWidth;
    };

    this.heightControlledByParent = function() {
        if (this._parentCell === null)
            return false;

        return false; //this._parentCell.spanAllRows === true && this._parentCell.dockContentHeight;
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

    this._calculateGrid = function() {

        let columnData;

        this._gridColumnData = [];
        this._gridRowData = [];
        this._maxPreferredColumnHeight = 0;

        let top = 0;
        let firstRow = true;
        for (let r = 0; r < this._rowCount; r++) {
            let left = 0;
            let leftCell = null;
            let topCells = [];
            if (this._gridRowData[r] === undefined)
                this._gridRowData[r] = { top: top, height: 0 };
            let rowData = this._gridRowData[r];
            let firstCell = true;
            for (let c = 0; c < this._columnCount; c++) {

                if (this._gridColumnData[c] === undefined)
                    this._gridColumnData[c] = { left: 0, width: 0, tight: false };

                let cell = this.getCell(c, r);
                if (cell === null || cell.visible() === false) {
                    topCells[c] = null;
                    continue;
                }

                let preferredSize = cell.preferredSize();

                columnData = this._gridColumnData[c];

                let cellWidth = preferredSize.width;

                if (cell.fitToGrid) {

                    columnData.tight = true;

                    if (columnData.left < left)
                        columnData.left = left;

                    if (columnData.width < cellWidth)
                        columnData.width = cellWidth;
                }

                if (cell.spanAllRows === false || this._rowCount === 1) {
                    let rowHeight = preferredSize.height;
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

        for (let i = 0; i < this._gridColumnData.length - 1; i++) {
            columnData = this._gridColumnData[i];
            let nextColumnData = this._gridColumnData[i + 1];
            if (columnData.tight) {
                if (nextColumnData.left < columnData.left + columnData.width)
                    nextColumnData.left = columnData.left + columnData.width;
                else
                    columnData.width = nextColumnData.left - columnData.left;
            }
        }
    };

    this._ready = new Promise((resolve, reject) => {
        this._readyResolved = resolve;
    });

    this._readyResolved = null;
    this.ready = function() {
        return this._ready;
    };

    this._manipulating = 0;
    this.beginCellManipulation = function() {

        if (this._manipulating++ > 0)
            return;

        for (let i = 0; i < this._cells.length; i++) {
            let cell = this._cells[i];
            if (cell.isVirtual)
                continue;

            cell.beginManipulation();
        }
    };

    this._endCellManipulation = function(startIndex) {
        let i = -1;
        let count = 0;
        for (i = startIndex; i < this._cells.length && count < 50; i++) {
            let cell = this._cells[i];
            if (cell.isVirtual)
                continue;

            if (cell.manipulating()) {
                cell.endManipulation();
                count += 1;
            }
        }

        if (i < this._cells.length) {
            setTimeout(() => {
                this._endCellManipulation(i);
            }, 0);
        }
    };

    this.endCellManipulation = function(animate) {
        this._manipulating -= 1;
        if (this._manipulating > 0)
            return;

        this._endCellManipulation(0);
    };

    this._layoutGrid = function(type) {

        let contentHeight = 0;
        let contentWidth = 0;
        this._rowStrechDetails = [];
        this._postProcessCellList = [];
        for (let r = 0; r < this._rowCount; r++) {
            this._rowStrechDetails[r] = { flex: 0, fixed: 0 };
            let left = 0;
            let top = this._gridRowData[r].top;
            let height = this._gridRowData[r].height;
            let allowRowOnlyStrechFactor = true;
            let hasRowOnlyStrechFactor = false;
            for (let c = 0; c < this._columnCount; c++) {
                let cell = this.getCell(c, r);
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

                let columnWidth = this._gridColumnData[c].width;
                let width = cell.fitToGrid ? columnWidth : cell.preferredWidth();

                if (cell.isVirtual === false && (cell.spanAllRows === false || r === 0)) {
                    //if (type === 'height')
                    //    cell.adjustCellVertically(top, height);
                    //else if (type === 'width')
                    //    cell.adjustCellHorizontally(left, width);
                    //else
                        cell.adjustCell(left, top, width, height);
                }

                left += width;

                if (cell.horizontalStretchFactor > 0)
                    this._rowStrechDetails[r].flex += cell.horizontalStretchFactor;
                else
                    this._rowStrechDetails[r].fixed += width;


                if (left > contentWidth)
                    contentWidth = left;

                if ( ! cell._queuedForPostProcess && ((cell.data.row === this._rowCount - 1 || cell.spanAllRows) || (cell.horizontalStretchFactor > 0))) {
                    this._postProcessCellList.push(cell);
                    cell._queuedForPostProcess = true;
                }

            }
            if (r === this._rowCount - 1)
                contentHeight = top + height;
        }

        this.preferredWidth = contentWidth;
        this.preferredHeight = contentHeight;

        this.contentHeight = contentHeight;
        this.contentWidth = contentWidth;
    };

};

SuperClass.create(LayoutGrid);

module.exports.Grid = LayoutGrid;
//module.exports.prototype = LayoutGrid.prototype;
