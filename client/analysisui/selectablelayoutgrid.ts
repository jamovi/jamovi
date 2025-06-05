
'use strict';


import { LayoutCell } from './layoutcell';
import BorderLayoutGrid from './layoutgridbordersupport';

export class SelectableLayoutGrid extends BorderLayoutGrid {
    _selectedCells: LayoutCell[] = [];
    fullRowSelect: boolean = false;
    _rootCell: LayoutCell = null;
    hasFocus: boolean = false;

    constructor() {
        super();

        this.classList.add('selectable-list');

        this.setAttribute('aria-multiselectable', 'true');
        this.setAttribute('tabindex', '0');
        this.setAttribute('role', 'listbox');
        this.addEventListener('focus', (event) => {
            if (this._selectedCells.length === 0 && this._cells.length > 0) {
                let index = 0;
                let cell = this._cells[index];
                while ((cell._clickable === false || cell.visible() === false) && index + 1 < this._cells.length) {
                    index += 1;
                    cell = this._cells[index];
                }
                if (cell._clickable && cell.visible())
                    this.selectCell(cell);
            }
            let nextEvent = new CustomEvent('layoutgrid.gotFocus');
            this.dispatchEvent(nextEvent);
        });

        this.addEventListener('keydown', (event) => {
            if (this._selectedCells.length === 0)
                return;
            
            let ctrlKey = event.ctrlKey;
            if (navigator.platform == "MacIntel")
                ctrlKey = event.metaKey;
            
            if (event.keyCode === 40) { //down key
                this.selectCell(this._selectedCells[this._selectedCells.length - 1].bottomCell(true), ctrlKey, event.shiftKey, true);
                event.preventDefault();
            }
            else if (event.keyCode === 38) { //up key
                this.selectCell(this._selectedCells[this._selectedCells.length - 1].topCell(true), ctrlKey, event.shiftKey, true);
                event.preventDefault();
            }
        });
    }

    selectCell(cell: LayoutCell, ctrlKey = false, shiftKey = false, toogleValue = false) {
        if (cell === null)
            return;

        if ( ! toogleValue) {
            var selected = cell.isSelected();
            if (selected)
                return;
        }
        
        ctrlKey = ctrlKey === undefined ? false : ctrlKey;
        shiftKey = shiftKey === undefined ? false : shiftKey;

        this.onSelectionChanged(cell, ctrlKey, shiftKey);
    }

    onSelectionChanged(cell: LayoutCell, ctrlKey = false, shiftKey = false) {
        var changed = false;
        var selected = cell.isSelected();
        var selectedCell = null;
        var cells = null;

        if (this._selectedCells.length > 0 && shiftKey) {
            var cell2 = this._rootCell;
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
                if (((rStart*rDir >= rSel*rDir) && (cStart*cDir >= cSel*cDir) && ((rDiff * rDir) >= ((rEnd - rSel) * rDir)) && ((cDiff * cDir) >= ((cEnd - cSel) * cDir))) === false)  //outside of range
                    this._setCellSelection(false, selectedCell, false, false);
            }

            this._selectedCells = [];

            for (var r = rStart; r*rDir <= rEnd*rDir; r+=rDir) {
                for (var c = cStart; c*cDir <= cEnd*cDir; c+=cDir) {
                    var tCell = this.getCell(c, r);
                    if (tCell.visible()) {
                        cells = this.setCellSelection(true, tCell, ctrlKey, shiftKey);
                        for (var u = 0; u < cells.length; u++)
                            this._selectedCells.unshift(cells[u]);
                        if (this.fullRowSelect)
                            break;
                    }
                }
            }
            changed = true;
        }
        else if (selected === false || (ctrlKey === false && this._selectedCells.length > 1)) {
            changed = true;
            cells = this.setCellSelection(true, cell, ctrlKey, shiftKey);
            if (ctrlKey) {
                for (var h = 0; h < cells.length; h++)
                    this._selectedCells.push(cells[h]);
            }
            else {
                for (var j = 0; j < this._selectedCells.length; j++) {
                    selectedCell = this._selectedCells[j];
                    if (this.isCellInArray(selectedCell, cells) === false)
                        this._setCellSelection(false, selectedCell, false, false);
                }
                this._selectedCells = cells;
            }

            this._rootCell = (this._selectedCells.length > 0) ? this._selectedCells[this._selectedCells.length - 1] : null;
        }
        else if (ctrlKey && this._selectedCells.length > 0) {
            changed = true;
            cells = this.setCellSelection(false, cell, ctrlKey, shiftKey);
            if (ctrlKey) {
                for (var k = 0; k < this._selectedCells.length; k++) {
                    selectedCell = this._selectedCells[k];
                    if (this.isCellInArray(selectedCell, cells)) {
                        this._selectedCells.splice(k, 1);
                        break;
                    }
                }
            }
            this._rootCell = (this._selectedCells.length > 0) ? this._selectedCells[this._selectedCells.length - 1] : null;
        }

        var gotFocus = this.hasFocus === false;
        this.hasFocus = true;

        if (gotFocus) {
            let nextEvent = new CustomEvent('layoutgrid.gotFocus');
            this.dispatchEvent(nextEvent);
        }

        if (changed) {
            let nextEvent = new CustomEvent('layoutgrid.selectionChanged');
            this.dispatchEvent(nextEvent);
        }

    }

    _setCellSelection(value, cell: LayoutCell, ctrlKey = false, shiftKey = false) {
        cell.setSelection(value, ctrlKey, shiftKey);
        if (value) {
            cell.classList.add('selected');
            cell.setAttribute('aria-selected', 'true');
            this.setAttribute('aria-activedescendant', cell.getAttribute('id'));
        }
        else {
            if (this.getAttribute('aria-activedescendant') === cell.getAttribute('id'))
                this.setAttribute('aria-activedescendant', this._selectedCells[this._selectedCells.length - 1].getAttribute('id'));
            cell.classList.remove('selected');
            cell.setAttribute('aria-selected', 'false');
        }
    }

    setCellSelection(value, cell: LayoutCell, ctrlKey = false, shiftKey = false) {
        var cells: LayoutCell[] = [];
        var selected = null;
        this._setCellSelection(value, cell, ctrlKey, shiftKey);
        if (this.fullRowSelect) {
            var next = cell.leftCell();
            while (next !== null) {
                if (next.visible()) {
                    selected = next.isSelected();
                    if (selected !== value)
                        this._setCellSelection(value, next, ctrlKey, shiftKey);
                    cells.push(next);
                }
                next = next.leftCell();
            }
            next = cell.rightCell();
            while (next !== null) {
                if (next.visible()) {
                    selected = next.isSelected();
                    if (selected !== value)
                        this._setCellSelection(value, next, ctrlKey, shiftKey);
                    cells.push(next);
                }
                next = next.rightCell();
            }
        }
        cells.push(cell);
        return cells;
    }

    isCellInArray(cell: LayoutCell, array) {
        for (var i = 0; i < array.length; i++) {
            if (cell._id === array[i]._id)
                return true;
        }
        return false;
    }

    clearSelection() {
        var changed = false;
        for (var i = 0; i < this._selectedCells.length; i++) {
            var selectedCell = this._selectedCells[i];
            selectedCell.setSelection(false, false, false);
            selectedCell.classList.remove('selected');
            changed = true;
        }
        this._selectedCells = [];

        var lostFocus = this.hasFocus === true;
        this.hasFocus = false;

        if (lostFocus) {
            let nextEvent = new CustomEvent('layoutgrid.lostFocus');
            this.dispatchEvent(nextEvent);
        }

        if (changed) {
            let nextEvent = new CustomEvent('layoutgrid.selectionChanged');
            this.dispatchEvent(nextEvent);
        }
    }

    selectedCellCount(): number {
        return this._selectedCells.length;
    }

    getSelectedCell(index) {
        return this._selectedCells[index];
    }

    override onCellRemoved(cell: LayoutCell) {
        super.onCellRemoved(cell);

        for (var i = 0; i < this._selectedCells.length; i++) {
            var selectedCell = this._selectedCells[i];
            if (selectedCell._id === cell._id) {
                this._selectedCells.splice(i, 1);
                let nextEvent = new CustomEvent('layoutgrid.selectionChanged');
                this.dispatchEvent(nextEvent);
                break;
            }
        }
    }

    override onCellInitialising(cell: LayoutCell): void {
        super.onCellInitialising(cell);

        cell.addEventListener('touchstart', (event) => {
            if (cell._clickable === false)
                return;

            let ctrlKey = event.ctrlKey;
            if (navigator.platform == "MacIntel")
                ctrlKey = event.metaKey;
            if (cell.isSelected() === false)
                this.onSelectionChanged(cell, ctrlKey, event.shiftKey);
            else {
                cell.addEventListener('touchend', (event) => {
                    let ctrlKey = event.ctrlKey;
                    if (navigator.platform == "MacIntel")
                        ctrlKey = event.metaKey;
                    this.onSelectionChanged(cell, ctrlKey, event.shiftKey);
                }, { once: true });
            }
        });
        cell.addEventListener('focus', () => {
            if (cell._clickable === false)
                return;

            if (cell.isSelected() === false)
                this.onSelectionChanged(cell, false, false);
        });
        cell.addEventListener('mousedown', (event) => {
            if (cell._clickable === false)
                return;

            let ctrlKey = event.ctrlKey;
            if (navigator.platform == "MacIntel")
                ctrlKey = event.metaKey;

            if (cell.isSelected() === false)
                this.onSelectionChanged(cell, ctrlKey, event.shiftKey);
            else {
                cell.addEventListener('mouseup', (event) => {
                    let ctrlKey = event.ctrlKey;
                    if (navigator.platform == "MacIntel")
                        ctrlKey = event.metaKey;
                    this.onSelectionChanged(cell, ctrlKey, event.shiftKey);
                }, { once: true });
            }
        });
        cell.addEventListener('layoutcell.visibleChanged', () => {
            if (cell.isSelected() && cell.visible() === false) {
                this.onSelectionChanged(cell, true, false);
            }
        });
    }
}

customElements.define('jmv-selectgrid', SelectableLayoutGrid);



export default SelectableLayoutGrid;
