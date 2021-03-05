'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

class Selection {
    constructor(model) {
        Object.assign(this, Backbone.Events);
        this.model = model;
        this._selectionNegative = false;
        this._handlers = [];
        this.clearSelectionList();
        this.rowNo = 0;
        this.colNo = 0;
        this.top = 0;
        this.bottom = 0;
        this.left = 0;
        this.right = 0;
        this.colFocus = 0;
        this.rowFocus = 0;

        this.columnStart = 0;
        this.columnEnd = 0;
        this.columnFocus = 0;
        this.columnPos = 0;
        this._calcKey = '';

        this.hiddenIncluded = false;
    }

    getRange(selection, hiddenIncluded) {

        if (hiddenIncluded === undefined)
            hiddenIncluded = this.hiddenIncluded;

        if (selection === undefined)
            selection = this;

        if (this.hiddenIncluded !== hiddenIncluded)
            this.legitimise(selection, true);

        if (hiddenIncluded)
            return { start: selection.columnStart, end: selection.columnEnd, focus: selection.columnFocus, pos: selection.columnPos };
        else
            return { start: selection.left, end: selection.right, focus: selection.colFocus, pos: selection.colNo };
    };

    _getRange(selection) {
        if (selection === undefined)
            selection = this;

        if (this.hiddenIncluded)
            return { start: selection.columnStart, end: selection.columnEnd, focus: selection.columnFocus, pos: selection.columnPos };
        else
            return { start: selection.left, end: selection.right, focus: selection.colFocus, pos: selection.colNo };
    };

    applyKey(selection, syncHidden) {
        selection._calcKey = this.compileKey(selection, syncHidden);
    };

    compileKey(selection, syncHidden) {
        if (syncHidden === undefined)
            syncHidden = ! this.hiddenIncluded;

        if (! syncHidden)
            return `${ selection.columnStart } : ${ selection.columnEnd }  : ${ selection.columnFocus }  : ${ selection.columnPos } : true`;
        else
            return `${ selection.left } : ${ selection.right } : ${ selection.colFocus } : ${ selection.colNo } : false`;
    };

    legitimise(selection, sync) {
        if (selection === undefined)
            selection = this;

        let syncHidden = ! this.hiddenIncluded;
        if (selection.columnStart === undefined || selection.columnEnd === undefined)
            syncHidden = true;
        else if (selection.left === undefined || selection.right === undefined)
            syncHidden = false;

        let key = this.compileKey(selection, syncHidden);
        if (key !== selection._calcKey) {
            if (sync) {
                if (! syncHidden) {
                    let range = this.createRange(selection.columnStart, selection.columnEnd, selection.columnPos, selection.columnFocus);
                    selection.left =  range.left;
                    selection.right = range.right;
                    selection.colNo = range.left;
                    key = range._calcKey;
                }
                else {
                    let leftColumn = this.model.getColumn(selection.left, true);
                    let rightColumn = this.model.getColumn(selection.right, true);
                    let posColumn = this.model.getColumn(selection.colNo, true);

                    selection.columnStart = leftColumn.index;
                    selection.columnEnd = rightColumn.index;
                    selection.columnPos = posColumn.index;

                    if (selection.colFocus !== undefined) {
                        let focusColumn = this.model.getColumn(selection.colFocus, true);
                        selection.columnFocus = focusColumn.index;
                    }
                }
            }

            selection._calcKey = key;
        }

        this._clipSelection(selection);
    };

    getColumnStart(selection) {
        if (selection === undefined)
            selection = this;

        this.legitimise(selection, true);

        return selection.columnStart;
    };

    getColumnEnd(selection) {
        if (selection === undefined)
            selection = this;

        this.legitimise(selection, true);

        return selection.columnEnd;
    };

    getColumnPos(selection) {
        if (selection === undefined)
            selection = this;

        this.legitimise(selection, true);

        return selection.columnPos;
    };

    createRange(start, end, pos, focus) {
        let startColumn = this.model.getColumn(start);
        let endColumn = this.model.getColumn(end);
        let posColumn = this.model.getColumn(pos);

        let left = startColumn.dIndex;
        if (left === -1) {
            let column = null;
            let rIndex = start;
            while (rIndex <= end && (column === null || column.dIndex === -1)) {
                column = this.model.getColumn(rIndex);
                rIndex += 1;
            }
            if (column !== null && column.dIndex !== -1)
                left = column.dIndex;
            else
                left = 0;
        }

        let right = endColumn.dIndex;
        if (right === -1) {
            let column = null;
            let rIndex = end;
            while (rIndex >= start && (column === null || column.dIndex === -1)) {
                column = this.model.getColumn(rIndex);
                rIndex -= 1;
            }
            if (column !== null && column.dIndex !== -1)
                right = column.dIndex;
            else
                right = left;
        }

        let colNo = posColumn.dIndex;
        if (colNo === -1) {
            let column = null;
            let rIndex = end;
            while (rIndex >= start && (column === null || column.dIndex === -1)) {
                column = this.model.getColumn(rIndex);
                rIndex -= 1;
            }
            if (column !== null && column.dIndex !== -1)
                colNo = column.dIndex;
            else
                colNo = left;
        }

        let colFocus = undefined;
        if (focus !== undefined) {
            let focusColumn = this.model.getColumn(focus);
            colFocus = focusColumn.dIndex;
            if (colFocus === -1) {
                let column = null;
                let rIndex = start;
                while (rIndex <= end && (column === null || column.dIndex === -1)) {
                    column = this.model.getColumn(rIndex);
                    rIndex += 1;
                }
                if (column !== null && column.dIndex !== -1)
                    colFocus = column.dIndex;
                else
                    colFocus = left;
            }
        }

        let newSelection = {
            left: left,
            right: right,
            colNo: colNo,
            colFocus: colFocus,
            rowNo: 0,
            top: 0,
            bottom: this.model.visibleRowCount() - 1,
            columnStart: start,
            columnEnd: end,
            columnPos: pos,
            columnFocus: focus
        }

        newSelection._calcKey = this.compileKey(newSelection, false);

        if (focus) {
            newSelection.colFocus = left;
            newSelection.rowFocus = 0;
            newSelection.columnFocus = start;
        }

        return newSelection;
    };

    clone() {
        return {
            rowNo: this.rowNo,
            colNo: this.colNo,
            top:   this.top,
            bottom: this.bottom,
            left:  this.left,
            right: this.right,
            colFocus: this.colFocus,
            rowFocus: this.rowFocus,
            columnStart: this.columnStart,
            columnEnd: this.columnEnd,
            columnFocus: this.columnFocus,
            columnPos: this.columnPos,
            _calcKey: this._calcKey
        };
    }

    _assign(range) {
        if (range.rowNo !== undefined)
            this.rowNo = range.rowNo;
        if (range.colNo !== undefined)
            this.colNo = range.colNo;
        if (range.top !== undefined)
            this.top = range.top;
        if (range.bottom !== undefined)
            this.bottom = range.bottom;
        if (range.left !== undefined)
            this.left = range.left;
        if (range.right !== undefined)
            this.right = range.right;
        if (range.colFocus !== undefined)
            this.colFocus = range.colFocus;
        if (range.rowFocus !== undefined)
            this.rowFocus = range.rowFocus;

        if (range.columnStart !== undefined)
            this.columnStart = range.columnStart;
        if (range.columnEnd !== undefined)
            this.columnEnd = range.columnEnd;
        if (range.columnFocus !== undefined)
            this.columnFocus = range.columnFocus;
        if (range.columnPos !== undefined)
            this.columnPos = range.columnPos;
        if (range._calcKey !== undefined)
            this._calcKey = range._calcKey;
    }

    modify(modifier) {
        let newSelection = this.clone();
        modifier(newSelection);
        this.setSelections(newSelection);
    }

    setSelection(rowNo, colNo, clearSelectionList) {
        if (this.hiddenIncluded) {
            let selection = this.createRange(colNo, colNo, colNo, colNo);
            selection.rowNo = rowNo;
            selection.top = rowNo;
            selection.bottom = rowNo;
            selection.rowFocus = rowNo;
            return this.setSelections(selection, clearSelectionList ? [] : null);
        }

        return this.setSelections({
            rowNo: rowNo,
            colNo: colNo,
            top:   rowNo,
            bottom: rowNo,
            left:  colNo,
            right: colNo,
            colFocus: colNo,
            rowFocus: rowNo }, clearSelectionList ? [] : null);
    }

    _clipSelection(selection) {
        for (let prop in selection) {
            if (selection[prop] < 0)
                selection[prop] = 0;
        }

        if (selection.colNo >= this.model.attributes.vColumnCount - 1)
            selection.colNo = this.model.attributes.vColumnCount - 1;
        if (selection.left >= this.model.attributes.vColumnCount - 1)
            selection.left = this.model.attributes.vColumnCount - 1;
        if (selection.right >= this.model.attributes.vColumnCount - 1)
            selection.right = this.model.attributes.vColumnCount - 1;
        if (selection.colFocus >= this.model.attributes.vColumnCount - 1)
            selection.colFocus = this.model.attributes.vColumnCount - 1;

        if (selection.columnStart >= this.model.attributes.columnCount - 1)
            selection.columnStart = this.model.attributes.columnCount - 1;
        if (selection.columnEnd >= this.model.attributes.columnCount - 1)
            selection.columnEnd = this.model.attributes.columnCount - 1;
        if (selection.columnFocus >= this.model.attributes.columnCount - 1)
            selection.columnFocus = this.model.attributes.columnCount - 1;
        if (selection.columnPos >= this.model.attributes.columnCount - 1)
            selection.columnPos = this.model.attributes.columnCount - 1;

        if (selection.rowNo >= this.model.attributes.vRowCount - 1)
            selection.rowNo = this.model.attributes.vRowCount - 1;
        if (selection.top >= this.model.attributes.vRowCount - 1)
            selection.top = this.model.attributes.vRowCount - 1;
        if (selection.bottom >= this.model.attributes.vRowCount - 1)
            selection.bottom = this.model.attributes.vRowCount - 1;
        if (selection.rowFocus >= this.model.attributes.vRowCount - 1)
            selection.rowFocus = this.model.attributes.vRowCount - 1;
    }

    registerChangeEventHandler(handler) {
        this._handlers.push(handler);
    }

    _onSelectionTypeChanged(type) {
        this.trigger('selectionTypeChanged', type);
    }

    _onSubselectionChanged() {
        this.trigger('subselectionChanged');
    }

    setSelections(mainSelection, subSelections, silent, ignoreTabStart) {

        if (mainSelection)
            this.legitimise(mainSelection, true);

        if (subSelections) {
            for (let selection of subSelections)
                this.legitimise(selection, true);
        }

        if (subSelections === undefined || Array.isArray(subSelections))
            this.clearSelectionList();

        if (subSelections && subSelections.length > 0) {
            this.subSelections = subSelections;
            this._onSubselectionChanged();
            this._onSelectionTypeChanged('multi');
        }
        else if (this.subSelections.length === 0) {
            this._onSelectionTypeChanged('single');
        }
        return this._onSelectionChanged(mainSelection, silent, ignoreTabStart);
    }

    _onSelectionChanged(range, silent, ignoreTabStart) {
        let oldSel = this.clone();

        this._assign(range);
        if (range.rowFocus === undefined)
            delete this.rowFocus;
        if (range.colFocus === undefined)
            delete this.colFocus;
        if (range.columnFocus === undefined)
            delete this.columnFocus;

        let promises = [];
        for (let handle of this._handlers) {
            let promise = handle(oldSel, silent, ignoreTabStart);
            if (promise)
                promises.push(promise);
        }

        return Promise.all(promises);
    }

    addNewSelectionToList(range, type) {
        this.legitimise(range, true);

        this._selectionNegative = type === 'negative';

        let prevSel = this.clone();
        this.subSelections.unshift(prevSel);
        this._onSelectionAppend(prevSel, this._selectionNegative);

        this._onSelectionChanged(range, false, false);
    }

    _onSelectionAppend(prevSel, subtract) {
        this.trigger('selectionAppended', prevSel, subtract);
    }

    selectionToColumnBlocks() {
        let range = this._getRange();
        let blocks = [{ left: range.start, right: range.end }];

        let tryApply = (selection, index) => {
            let absorbed = false;
            let modified = false;
            for (let i = 0; i < blocks.length; i++) {
                let block = blocks[i];
                if (block === selection)
                    continue;
                let leftIn = selection.left >= block.left && selection.left <= (block.right + 1);
                let leftDown = selection.left < block.left;
                let rightIn = selection.right >= (block.left - 1) && selection.right <= block.right;
                let rightUp = selection.right > block.right;

                if (!leftIn && !rightIn && leftDown && rightUp) {
                    block.right = selection.right;
                    block.left = selection.left;
                    absorbed = true;
                    modified = true;
                }
                else if (leftIn && rightUp) {
                    block.right = selection.right;
                    absorbed = true;
                    modified = true;
                }
                else if (leftDown && rightIn) {
                    block.left = selection.left;
                    absorbed = true;
                    modified = true;
                }
                else if (leftIn && rightIn)
                    absorbed = true;

                if (absorbed) {
                    if (index !== undefined) {
                        blocks.splice(index, 1);
                        i = index <= i ? i - 1 : i;
                    }
                    if (modified)
                        tryApply(block, i);
                    break;
                }
            }
            if (absorbed === false && index === undefined)
                blocks.push({ left: selection.left, right: selection.right });
        };

        for (let selection of this.subSelections) {
            let range = this._getRange(selection);
            tryApply({ left: range.start, right: range.end });
        }

        blocks.sort((a,b) => a.start - b.start);

        return blocks;
    }

    cellInSelection(rowNo, colNo) {
        let range = this._getRange(this);
        if (rowNo >= this.top && rowNo <= this.bottom &&
             colNo >= range.start && colNo <= range.end) {
                 return true;
             }

        for (let selection of this.subSelections) {
            let range = this._getRange(selection);
            if (rowNo >= selection.top && rowNo <= selection.bottom &&
                 colNo >= range.start && colNo <= range.end)
                     return true;
        }

        return false;
    }

    isFullColumnSelectionClick(colNo) {
        let range = this._getRange(this);
        let check = false;
        if (colNo >= range.start && colNo <= range.end)
            check = this.top === 0 && this.bottom === this.model.visibleRowCount() - 1;

        if (check === false) {
            for (let selection of this.subSelections) {
                let range = this._getRange(selection);
                if (colNo >= range.start && colNo <= range.end) {
                    check = selection.top === 0 && selection.bottom === this.model.visibleRowCount() - 1;
                }
                if (check)
                    break;
            }
        }

        return check;
    }

    isFullRowSelectionClick(rowNo) {
        let check = false;
        if (rowNo >= this.top && rowNo <= this.bottom) {
            let range = this._getRange(this);
            check = range.start === 0 && range.end === this.model.attributes.columnCount - 1;
        }

        if (check === false) {
            for (let selection of this.subSelections) {
                if (rowNo >= selection.top && rowNo <= selection.bottom) {
                    let range = this._getRange(selection);
                    check = range.start === 0 && range.end === this.model.attributes.columnCount - 1;
                }
                if (check)
                    break;
            }
        }

        return check;
    }

    clearSelectionList() {
        this.subSelections = [];

        this._onSelectionCleared();
    }

    _onSelectionCleared() {
        this.trigger('selectionCleared');
    }

    currentSelectionToColumns() {
        let columnsObj = {};

        let range = this._getRange(this);
        for (let c = range.start; c <= range.end; c++) {
            let column = this.model.getColumn(c, ! this.hiddenIncluded);
            columnsObj[column.id] = column;
        }

        for (let selection of this.subSelections) {
            let range = this._getRange(selection);
            for (let c = range.start; c <= range.end; c++) {
                let column = this.model.getColumn(c, ! this.hiddenIncluded);
                columnsObj[column.id] = column;
            }
        }

        let columns = [];
        for (let id in columnsObj)
            columns.push(columnsObj[id]);

        columns.sort((a, b) => a.index - b.index);

        return columns;
    }

    currentSelectionToRowBlocks() {
        let blocks = [];
        this.updateColumnDataBlocks(blocks, this);

        for (let selection of this.subSelections)
            this.updateColumnDataBlocks(blocks, selection);

        return blocks;
    }

    updateColumnDataBlocks(blocks, selection, index) {
        if (blocks.length === 0)
            blocks.push({ rowStart: selection.top, rowCount: selection.bottom - selection.top + 1 });
        else {
            let absorbed = false;
            let modified = false;
            for (let i = 0; i < blocks.length; i++) {
                let block = blocks[i];
                if (block === selection._block)
                    continue;

                let blockRowEnd = block.rowStart + block.rowCount - 1;
                let topIn = selection.top >= block.rowStart && selection.top <= (blockRowEnd + 1);
                let topDown = selection.top < block.rowStart;
                let bottomIn = selection.bottom >= (block.rowStart - 1) && selection.bottom <= blockRowEnd;
                let bottomUp = selection.bottom > blockRowEnd;

                if (!topIn && !bottomIn && topDown && bottomUp) {
                    block.rowCount = selection.bottom - selection.top + 1;
                    block.rowStart = selection.top;
                    absorbed = true;
                    modified = true;
                }
                else if (topIn && bottomUp) {
                    block.rowCount = selection.bottom - block.rowStart + 1;
                    absorbed = true;
                    modified = true;
                }
                else if (topDown && bottomIn) {
                    block.rowCount += block.rowStart - selection.top;
                    block.rowStart = selection.top;
                    absorbed = true;
                    modified = true;
                }
                else if (topIn && bottomIn)
                    absorbed = true;

                if (absorbed) {
                    if (index !== undefined) {
                        blocks.splice(index, 1);
                        i = index <= i ? i - 1 : i;
                    }
                    if (modified)
                        this.updateColumnDataBlocks(blocks, { top: block.rowStart, bottom: block.rowStart + block.rowCount - 1, _block: block }, i);
                    break;
                }
            }
            if (absorbed === false && index === undefined)
                blocks.push({ rowStart: selection.top, rowCount: selection.bottom - selection.top + 1 });
        }
    }

    convertAreaDataToSelections(data) {
        let selections = [];
        for (let block of data)
            selections.push({top: block.rowStart, bottom: block.rowStart + block.rowCount - 1, left: block.columnStart, right: block.columnStart + block.columnCount - 1 });

        if (selections.length > 0) {
            selections[0].rowNo = selections[0].top;
            selections[0].colNo = selections[0].left;
        }
        return selections;
    }

    _rangesOverlap(range1, range2) {
        let verticalOverlap = ((range1.top < range2.top && range1.bottom < range2.top) || (range1.top > range2.bottom && range1.bottom > range2.bottom)) === false;

        let r1 = this._getRange(range1);
        let r2 = this._getRange(range2);
        let horizontalOverlap = ((r1.start < r2.start && r1.end < r2.start) || (r1.start > r2.end && r1.end > r2.end)) === false;
        return verticalOverlap && horizontalOverlap;
    }

    resolveSelectionList($el) {
        if ( ! this._selectionNegative)
            return false;

        for (let i = 0; i < this.subSelections.length; i++) {
            let $subSel = $el.find('.jmv-table-cell-secondary-selected');
            let subSel = this.subSelections[i];
            if (subSel.left >= this.left && subSel.right <= this.right &&
                    subSel.top >= this.top && subSel.bottom <= this.bottom) {
                $($subSel[i]).remove();
                this.subSelections.splice(i, 1);
                i -= 1;
            }
            else if (this._rangesOverlap(this, subSel)) {

                $($subSel[i]).remove();
                this.subSelections.splice(i, 1);

                let overlapRange = {
                    top:   Math.max(this.top, subSel.top),
                    bottom: Math.min(this.bottom, subSel.bottom),
                    left:  Math.max(this.left, subSel.left),
                    right: Math.min(this.right, subSel.right)
                };

                let top = overlapRange.top - subSel.top;
                let bottom = subSel.bottom - overlapRange.bottom;
                let left = overlapRange.left - subSel.left;
                let right = subSel.right - overlapRange.right;

                let toAdd = [];
                if (top > 0) {
                    let topSelection = {
                        top:   subSel.top,
                        bottom: subSel.top + top - 1,
                        left:  subSel.left,
                        right: subSel.right };
                    topSelection.rowNo = topSelection.top;
                    topSelection.colNo = topSelection.left;
                    toAdd.push(topSelection);
                }

                if (bottom > 0) {
                    let bottomSelection = {
                        top:   subSel.bottom - bottom + 1,
                        bottom: subSel.bottom,
                        left:  subSel.left,
                        right: subSel.right };
                    bottomSelection.rowNo = bottomSelection.top;
                    bottomSelection.colNo = bottomSelection.left;
                    toAdd.push(bottomSelection);
                }

                if (left > 0) {
                    let leftSelection = {
                        top:   subSel.top + top,
                        bottom: subSel.bottom - bottom,
                        left:  subSel.left,
                        right: subSel.left + left - 1 };
                    leftSelection.rowNo = leftSelection.top;
                    leftSelection.colNo = leftSelection.left;
                    toAdd.push(leftSelection);
                }

                if (right > 0) {
                    let rightSelection = {
                        top:   subSel.top + top,
                        bottom: subSel.bottom - bottom,
                        left:  subSel.right - right + 1,
                        right: subSel.right };
                    rightSelection.rowNo = rightSelection.top;
                    rightSelection.colNo = rightSelection.left;
                    toAdd.push(rightSelection);
                }

                this.subSelections.splice.apply(this.subSelections, [i, 0].concat(toAdd));
                i += toAdd.length - 1;
            }
        }

        this._selectionNegative = false;

        if (this.subSelections.length > 0) {
            let $subSel = $el.find('.jmv-table-cell-secondary-selected');
            $($subSel[0]).remove();
            let mainSelection = this.subSelections[0];
            this.subSelections.splice(0, 1);
            this.setSelections(mainSelection, this.subSelections);
        }
        else
            this.setSelection(this.rowNo, this.colNo);

        return true;
    }

    moveCursor(direction, extend, ignoreTabStart) {

        let range = this.clone();
        let rowNo = range.rowNo;
        let colNo = range.colNo;

        let scrollLeft = false;
        let scrollRight = false;
        let scrollUp = false;
        let scrollDown = false;

        switch (direction) {
            case 'left':
                if (extend) {
                    if (this.hiddenIncluded) {
                        if (this.getColumnEnd() > this.getColumnPos()) {
                            range.columnEnd--;
                            range.columnFocus = range.columnEnd;
                        }
                        else if (this.getColumnStart() > 0) {
                            range.columnStart--;
                            range.columnFocus = range.columnStart;
                            scrollLeft = true;
                        }
                        else {
                            return;
                        }
                    }
                    else {
                        if (range.right > range.colNo) {
                            range.right--;
                            range.colFocus = range.right;
                        }
                        else if (range.left > 0) {
                            range.left--;
                            range.colFocus = range.left;
                            scrollLeft = true;
                        }
                        else {
                            return;
                        }
                    }
                }
                else {
                    if (this.hiddenIncluded) {
                        if (this.getColumnStart() > 0) {
                            range.columnStart = range.columnStart - 1;
                            scrollLeft = true;
                        }
                        else
                            range.columnStart = 0;

                        range.columnPos  = range.columnStart;
                        range.columnEnd  = range.columnStart;
                        range.columnFocus = range.columnStart;
                    }
                    else {
                        if (colNo > 0) {
                            colNo--;
                            scrollLeft = true;
                        }
                        else
                            colNo = 0;

                        range.colNo  = colNo;
                        range.left   = colNo;
                        range.right  = colNo;
                        range.colFocus = colNo;
                    }

                    range.top    = rowNo;
                    range.bottom = rowNo;
                    range.rowNo  = rowNo;
                    range.rowFocus = rowNo;
                }
                break;
            case 'right':
                if (extend) {
                    if (this.hiddenIncluded) {
                        if (this.getColumnStart() < this.getColumnPos()) {
                            range.columnStart++;
                            range.columnFocus = range.columnStart;
                        }
                        else if (this.getColumnEnd() < this.model.attributes.columnCount - 1) {
                            range.columnEnd++;
                            range.columnFocus = range.columnEnd;
                            scrollRight = true;
                        }
                        else {
                            return;
                        }
                    }
                    else {
                        if (range.left < range.colNo) {
                            range.left++;
                            range.colFocus = range.left;
                        }
                        else if (range.right < this.model.attributes.vColumnCount - 1) {
                            range.right++;
                            range.colFocus = range.right;
                            scrollRight = true;
                        }
                        else {
                            return;
                        }
                    }

                }
                else {
                    if (this.hiddenIncluded) {
                        if (range.colNo < this.model.attributes.columnCount - 1) {
                            range.columnStart = range.columnStart + 1;
                            scrollRight = true;
                        }
                        else
                            range.columnStart = this.model.attributes.columnCount - 1;

                        range.columnPos  = range.columnStart;
                        range.columnEnd  = range.columnStart;
                        range.columnFocus = range.columnStart;
                    }
                    else {

                        if (range.colNo < this.model.attributes.vColumnCount - 1) {
                            colNo = range.colNo + 1;
                            scrollRight = true;
                        }
                        else
                            colNo = this.model.attributes.vColumnCount - 1;

                        range.colNo  = colNo;
                        range.left   = colNo;
                        range.right  = colNo;
                        range.colFocus = colNo;
                    }

                    range.top    = rowNo;
                    range.bottom = rowNo;
                    range.rowNo  = rowNo;
                    range.rowFocus = rowNo;
                }
                break;
            case 'up':
                if (extend) {
                    if (range.bottom > range.rowNo) {
                        range.bottom--;
                        range.rowFocus = range.bottom;
                    }
                    else if (range.top > 0) {
                        range.top--;
                        range.rowFocus = range.top;
                        scrollUp = true;
                    }
                    else {
                        return;
                    }
                }
                else {
                    if (rowNo > 0) {
                        rowNo--;
                        scrollUp = true;
                    }
                    else {
                        rowNo = 0;
                    }
                    range.top    = rowNo;
                    range.bottom = rowNo;
                    range.rowNo  = rowNo;
                    range.rowFocus = rowNo;
                    range.colNo  = colNo;
                    range.left   = colNo;
                    range.right  = colNo;
                    range.colFocus = colNo;
                }
                break;
            case 'down':
                if (extend) {
                    if (range.top < range.rowNo) {
                        range.top++;
                        range.rowFocus = range.top;
                    }
                    else if (range.bottom < this.model.attributes.vRowCount - 1) {
                        range.bottom++;
                        range.rowFocus = range.bottom;
                        scrollDown = true;
                    }
                    else {
                        return;
                    }
                }
                else {
                    if (range.rowNo < this.model.attributes.vRowCount - 1) {
                        rowNo = range.rowNo + 1;
                        scrollDown = true;
                    }
                    else {
                        rowNo = this.model.attributes.rRowCount - 1;
                    }
                    range.top    = rowNo;
                    range.bottom = rowNo;
                    range.rowNo  = rowNo;
                    range.rowFocus = rowNo;
                    range.colNo  = colNo;
                    range.left   = colNo;
                    range.right  = colNo;
                    range.colFocus = colNo;
                }
                break;
        }

        this.legitimise(range, true);
        this.setSelections(range, [], false, ignoreTabStart);
    }

    createSelectionsFromColumns(rowNo, columns, silent, ignoreTabStart) {
        columns.sort((a, b) => a.index - b.index);

        let selections = [];
        let selection = { };
        for (let column of columns) {
            if (selection.colNo !== undefined) {
                if (column.dIndex === selection.right + 1) {
                    selection.right += 1;
                    selection.columnEnd = column.index;
                }
                else {
                    selections.push(selection);
                    selection = { };
                }
            }

            if (selection.colNo === undefined) {
                selection = {
                    rowNo: rowNo,
                    top: rowNo,
                    bottom: rowNo,
                    left: column.dIndex,
                    right: column.dIndex,
                    colNo: column.dIndex,
                    columnPos: column.index,
                    columnStart: column.index,
                    columnEnd: column.index
                };

            }
        }

        this.setSelections(selection, selections, silent, ignoreTabStart);
    }

    undoRedoDataToSelection(events) {
        let selections = [];
        if (events.dataWrite && events.dataWrite.data.length > 0) {
            for (let i = 0; i < events.dataWrite.data.length; i++) {
                let range = events.dataWrite.data[i];
                selections.push({
                    top: range.rowStart,
                    bottom: range.rowStart + range.rowCount - 1,
                    left: range.columnStart,
                    right: range.columnStart + range.columnCount - 1,
                    colFocus: range.columnStart,
                    rowFocus: range.rowStart,
                    colNo: range.columnStart,
                    rowNo: range.rowStart
                });
            }
        }
        else if (events.insertData && events.insertData.ids.length > 0) {
            for (let i = 0; i < events.insertData.ids.length; i++) {
                let column = this.model.getColumnById(events.insertData.ids[i]);
                if (column.columnType === 'none')
                    continue;

                let merged = false;
                let index = column.dIndex;
                for (let selection of selections) {
                    if (index === selection.left - 1) {
                        selection.left = index;
                        selection.colFocus = index;
                        selection.colNo = index;
                        merged = true;
                    }
                    else if (index === selection.right + 1) {
                        selection.right = index;
                        merged = true;
                    }
                    if (merged)
                        break;
                }
                if (merged === false) {
                    selections.push({
                        top: 0,
                        bottom: this.model.visibleRowCount() - 1,
                        left: index,
                        right: index,
                        colFocus: index,
                        rowFocus: this.rowNo,
                        colNo: index,
                        rowNo: this.rowNo
                    });
                }
            }
        }
        else if (events.rowData.rowsDeleted.length > 0 || events.rowData.rowsInserted.length > 0) {
            let rowDataList = events.rowData.rowsDeleted.concat(events.rowData.rowsInserted);
            let blocks = [];
            for (let i = 0; i < rowDataList.length; i++) {
                let rowData = rowDataList[i];
                this.updateColumnDataBlocks(blocks, { top: rowData.rowStart, bottom: rowData.rowStart + rowData.count - 1 });
            }
            blocks.sort((a, b) => a.rowStart - b.rowStart);
            for (let range of blocks) {
                selections.push({
                    rowNo: range.rowStart,
                    top: range.rowStart,
                    bottom: range.rowStart + range.rowCount - 1,
                    left: 0,
                    right: this.model.attributes.vColumnCount - 1,
                    colNo: this.colNo,
                    colFocus: this.colNo,
                    rowFocus:  range.rowStart,
                });
            }
        }
        if (selections.length === 0 && events.data && events.data.changes) {
            for (let change of events.data.changes) {
                if (change.dIndex === -1 || (change.created && change.columnType === 'none') || (change.deleted && change.columnType === 'none'))
                    continue;

                if ( ! change.deleted && (change.columnTypeChanged ||
                    change.measureTypeChanged ||
                    change.dataTypeChanged ||
                    change.levelNameChanges.length > 0 ||
                    change.formulaChanged ||
                    change.nameChanged ||
                    change.hiddenChanged) === false)
                    continue;

                let merged = false;
                let index = change.dIndex;
                for (let selection of selections) {
                    if (index === selection.left - 1) {
                        selection.left = index;
                        selection.colFocus = index;
                        selection.colNo = index;
                        merged = true;
                    }
                    else if (index === selection.right + 1) {
                        selection.right = index;
                        merged = true;
                    }
                    if (merged)
                        break;
                }
                if (merged === false) {
                    selections.push({
                        top: 0,
                        bottom: this.model.visibleRowCount() - 1,
                        left: index,
                        right: index,
                        colFocus: index,
                        rowFocus: this.top,
                        colNo: index,
                        rowNo: this.rowNo
                    });
                }
            }
        }
        if (selections.length > 0) {
            selections.sort((a, b) => a.left - b.left);
            selections.sort((a, b) => a.top - b.top);
            this.setSelections(selections[0], selections.slice(1));
        }
    }

    selectAll() {
        let range = {
            rowNo: 0,
            colNo: 0,
            left: 0,
            right: this.model.visibleRealColumnCount() - 1,
            top: 0,
            bottom: this.model.visibleRowCount() - 1 };

        this.setSelections(range);
    }

    refreshSelection() {
        if (this.model.attributes.editingVar !== null) {
            let now = this.model.getEditingColumns(!this.hiddenIncluded);
            if (now !== null && now.length > 0)
                this.createSelectionsFromColumns(this.rowNo, now);
            else
                this.setSelections(this, this.subSelections, true);
        }
        else
            this.setSelections(this, this.subSelections, true);
    }

    deleteCellContents() {
        let selections = this.subSelections.concat([this]);
        this.applyValuesToSelection(selections, null);
    }

    applyValuesToSelection(selections, value) {
        if (value === undefined)
            value = null;

        let dataset = this.model;
        let data = [];
        let valueIsFunc = $.isFunction(value);
        for (let selection of selections) {
            let clippedSel = selection;
            if (value === null) {
                if (selection.top > dataset.attributes.rowCount - 1)
                    continue;

                clippedSel = { top: Math.max(0, selection.top), bottom: Math.min(dataset.attributes.rowCount - 1, selection.bottom), right: Math.min(dataset.visibleRealColumnCount() - 1, selection.right), left: Math.max(0, selection.left)};
            }
            else {
                if (selection.top > dataset.attributes.vRowCount - 1)
                    continue;

                clippedSel = { top: Math.max(0, selection.top), bottom: Math.min(dataset.attributes.vRowCount - 1, selection.bottom), left: Math.max(0, selection.left), right: Math.min(dataset.attributes.vColumnCount - 1, selection.right)};
            }

            let block = { rowStart: clippedSel.top, rowCount: clippedSel.bottom - clippedSel.top + 1, columnStart: clippedSel.left, columnCount: clippedSel.right - clippedSel.left + 1, clear: value === null };
            if (block.clear)
                block.values = [];
            else {
                let values = new Array(block.columnCount);
                block.values = values;
                for (let c = 0; c < block.columnCount; c++) {
                    if (valueIsFunc) {
                        let cells = new Array(block.rowCount);
                        for (let r = 0; r < block.rowCount; r++)
                            cells[r] = valueIsFunc(block.columnStart + c, block.rowStart + r);
                        values[c] = values;
                    }
                    else
                        values[c] = new Array(block.rowCount).fill(value);
                }
            }
            data.push(block);
        }

        return dataset.changeCells(data);
    }
}

module.exports = Selection;
