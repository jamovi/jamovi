
'use strict';

import focusLoop from '../common/focusloop';
import LayoutGrid from './layoutgrid';

export interface ICellData { 
    cell: LayoutCell;
    row: number;
    column: number;
    spans: { rows: number, columns: number }, 
    listIndex: number;
    initialized: boolean; 
    hasNewContent: boolean;
};

export type HorizontalAlignment = 'center' | 'right' | 'left' | 'stretch' | 'auto';
export type VerticalAlignment = 'center' | 'top' | 'bottom' | 'stretch' | 'auto';

export interface ICellProperties {
    visible?: boolean;
    hAlign?: HorizontalAlignment;
    vAlign?: VerticalAlignment;
    spans?: { rows: number, columns: number };
}

export interface ICellContentsItem {
    el: HTMLElement;
    getSpans?(): { rows: number, columns: number }
}

export class LayoutCell extends HTMLElement {

    static defaultFormat = 'minmax(max-content, max-content)';

    content: HTMLElement | null = null;
    previousContent: HTMLElement = null;
    _clickable: boolean = false;
    _id: number;
    item: HTMLElement | ICellContentsItem = null;
    data: ICellData;
    isVirtual: boolean = false;
    spanAllRows: boolean = false;
    horizontalStretchFactor: number = 0;
    _parentLayout: LayoutGrid;
    hAlign: HorizontalAlignment = "left";
    vAlign: VerticalAlignment  = "top";
    _visible: boolean = true;
    _selected = false;
    _initialized = false;
    private _expandingTimer = null;
    private animationFrame = null;
    private diconnectionId = null;

    constructor(parent: LayoutGrid, properties?: ICellProperties) {
        super();

        this.style.display = 'flex';
        this.style.justifySelf = 'stretch';
        this.style.alignSelf = 'stretch';
        this.style.opacity = '0';
        this.style.visibility = 'hidden';
        this.style.position = 'relative';
        this.style.boxSizing = 'border-box';
        this.classList.add('layout-cell','not-rendered');

        this.setAttribute('id', focusLoop.getNextAriaElementId('cell'));
        this.setAttribute('role', 'presentation');

        //if (parent.editable)
        //    this.style.border = "1px dotted red";

        this.item = null;
        this._parentLayout = parent;

        this.isSelected = this.isSelected.bind(this);
        this.setSelection = this.setSelection.bind(this);

        this.horizontalStretchFactor = 0;

        if (properties) {
            if (properties.visible === false) {
                this._visible = properties.visible;
                this.classList.add("cell-invisible");
                this.classList.add('cell-disconnected');
                this.style.opacity = '0';
                this.style.visibility = 'hidden';
                this.style.height = '0px';
                this.setAttribute('data-collapsed', 'true');
            }

            if (properties.hAlign)
                this.setHorizontalAlign(properties.hAlign);
            if (properties.vAlign)
                this.setVerticalAlign(properties.vAlign);
        }
    }

    /*connectedCallback() {
        if (this.parentElement instanceof LayoutGrid)
            this._parentLayout = this.parentElement;
    }

    disconnectedCallback() {
        this._parentLayout = null;
    }

    connectedMoveCallback() {
        if (this.parentElement instanceof LayoutGrid)
            this._parentLayout = this.parentElement;
    }*/

    makeSticky(dockcss: Partial<Record<keyof CSSStyleDeclaration, string>> = undefined) {
        if (dockcss === undefined) {
            dockcss = {
                zIndex: '10',
                top: '0px'
            };
        }

        if (dockcss.zIndex === undefined)
            dockcss.zIndex = '111';

        dockcss.position = 'sticky';

        // Apply styles to the element
        Object.assign(this.style, dockcss);
    }

    blockInsert(direction) {
        if (this._parentLayout.editable)
            this.style["border" + direction.charAt(0).toUpperCase() + direction.slice(1) + "Style"] = "none";
    }
    
    clickable(value) {
        this._clickable = value;
    }

    setSelection(value, ctrlKey, shiftKey) {
        if (value && this.visible() === false)
            return;

        if (this._selected !== value) {
            this._selected = value;
            let event = new CustomEvent<{ ctrlKey: Boolean, shiftKey: boolean, cell: LayoutCell }>('layoutcell.selectionChanged', { detail: { ctrlKey, shiftKey, cell: this }, bubbles: true })
            this.dispatchEvent(event);
        }
    }

    isSelected() {
        return this._selected;
    }

    setContent(item: HTMLElement | ICellContentsItem) {

        if (this.content !== null)
            this.previousContent = this.content;

        this.item = item;
        if (item instanceof HTMLElement)
            this.content = item;
        else if (item !== null)
            this.content = item.el;
        else
            this.content = null;
            

        if (this.content !== null) {
            let css: Partial<Record<keyof CSSStyleDeclaration, string>> = {};
            css.position = 'relative';
            if (this.hAlign === 'stretch' || this.vAlign === 'stretch') {
                css.flexGrow = '1';
                css.flexShrink = '1';
            }
            Object.assign(this.content.style, css);            
        }

        this.render();
    }

    render() {

        if (this.previousContent !== null) {
            this.previousContent.remove();
            this.previousContent = null;
        }

        if (this.content) {
            if (this.content instanceof HTMLElement)
                this.append(this.content);
            else
                this.content = null;
        }

        this.classList.remove("not-rendered");
        this.classList.add("rendered");
        if (this._visible) {
            this.style.opacity = '1';
            this.style.visibility = 'visible';
        }
    }

    visible() {
        return this._visible;
    }

    collapse(immediately) {

        if (this._expandingTimer) {
            clearTimeout(this._expandingTimer);
            this._expandingTimer = null;
        }
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        if (immediately)
            this.style.height = 0 + 'px';
        else {
            let sectionHeight = this.scrollHeight;

            let elementTransition = this.style.transition;
            this.style.transition = '';

            this.animationFrame = requestAnimationFrame(() => {
                this.style.height = sectionHeight + 'px';
                this.style.transition = elementTransition;
                this.animationFrame = requestAnimationFrame(() => {
                    this.style.height = 0 + 'px';
                    this.animationFrame = null;
                });
            });
        }

        this.setAttribute('data-collapsed', 'true');
    }

    expand(immediately) {

        if (this._expandingTimer) {
            clearTimeout(this._expandingTimer);
            this._expandingTimer = null;
        }
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        if (immediately)
            this.style.height = null;
        else {
            let sectionHeight = this.scrollHeight;
            this.style.height = sectionHeight + 'px';

            this._expandingTimer = setTimeout(() => {
                this.style.height = null;
                this._expandingTimer = null;
            }, 200);
        }

        this.setAttribute('data-collapsed', 'false');
    }

    setVisibility(visible, immediately=false) {
        if (this._visible !== visible) {
            this._visible = visible;

            if (this.diconnectionId)
                clearTimeout(this.diconnectionId);

            if (this._visible) {
                this.classList.remove('cell-disconnected');
                this.classList.remove("cell-invisible");
                this.expand(immediately);
            }
            else {
                this.classList.add("cell-invisible");
                if (immediately)
                    this.classList.add('cell-disconnected');
                else {
                    this.diconnectionId = setTimeout(() => {
                        this.classList.add('cell-disconnected');
                        this.diconnectionId = null;
                    }, 200);
                }
                this.collapse(immediately);
            }
            this.style.opacity = this._visible ? '1' : '0';
            this.style.visibility = this._visible ? 'visible' : 'hidden';

            let event = new CustomEvent('layoutcell.visibleChanged', { bubbles: true });
            this.dispatchEvent(event);
        }
    }

    setStretchFactor(factor) {
        if (factor === this.horizontalStretchFactor)
            return;

        this.horizontalStretchFactor = factor;

        if (this.horizontalStretchFactor > 0 && this.hAlign === "left")
            this.setHorizontalAlign('stretch');

        let endColumn = this.data.column;
        if (this.data.spans)
            endColumn = this.data.column + this.data.spans.columns - 1;
        for (let column = this.data.column; column <= endColumn; column++)
            this._parentLayout.setStretchFactor(column, factor);

        this.updateGridProperties();

        let event = new CustomEvent<LayoutCell>('layoutcell.horizontalStretchFactorChanged', { detail: this })
        this.dispatchEvent(event);
    }

    rightCell() {
        let cell = null;
        let c = this.data.column + 1;
        if (c < this._parentLayout._columnCount) {

            do {
                cell = this._parentLayout.getCell(c, this.data.row);
                c += 1;
            }
            while (cell === null && c < this._parentLayout._columnCount);
        }
        return cell;
    }

    topCell(onlyVisible) {
        let row = this.data.row - 1;
        let cell = this._parentLayout.getCell(this.data.column, row);
        if (onlyVisible) {
            while (cell && (cell._clickable === false || cell.visible() === false)) {
                row -= 1;
                cell = this._parentLayout.getCell(this.data.column, row);
            }

        }
        return cell;
    }

    leftCell() {
        let cell = null;
        let c = this.data.column - 1;
        if (c < this._parentLayout._columnCount) {

            do {
                cell = this._parentLayout.getCell(c, this.data.row);
                c -= 1;
            }
            while (cell === null && c >= 0);
        }
        return cell;
    }

    bottomCell(onlyVisible) {
        let row = this.data.row + 1;
        let cell = this._parentLayout.getCell(this.data.column, row);
        if (onlyVisible) {
            while (cell && (cell._clickable === false || cell.visible() === false)) {
                row += 1;
                cell = this._parentLayout.getCell(this.data.column, row);
            }
                
        }
        return cell;
    }

    setHorizontalAlign(hAlign: HorizontalAlignment) {
        if (! this.content)
            return;

        switch (hAlign) {
            case 'stretch':
                this.style.justifyContent = 'stretch';
                this.content.style.flexGrow = '1';
                this.content.style.flexShrink = '1';
                break;
            case 'left':
                this.style.justifyContent = 'flex-start';
                this.content.style.flexGrow = '';
                this.content.style.flexShrink = '';
                break;
            case 'right':
                this.style.justifyContent = 'flex-end';
                this.content.style.flexGrow = '';
                this.content.style.flexShrink = '';
                break;
            case 'center':
                this.style.justifyContent = 'center';
                this.content.style.flexGrow = '';
                this.content.style.flexShrink = '';
                break;
            default:
                this.style.justifyContent = 'auto';
                this.content.style.flexGrow = '';
                this.content.style.flexShrink = '';
                break;
        }

        this.hAlign = hAlign;
    }

    setVerticalAlign(vAlign: VerticalAlignment) {
        if (! this.content)
            return;

        switch (vAlign) {
            case 'stretch':
                this.style.alignItems = 'stretch';
                this.content.style.flexGrow = '1';
                this.content.style.flexShrink = '1';
                break;
            case 'top':
                this.style.alignItems = 'flex-start';
                this.content.style.flexGrow = '';
                this.content.style.flexShrink = '';
                break;
            case 'bottom':
                this.style.alignItems = 'flex-end';
                this.content.style.flexGrow = '';
                this.content.style.flexShrink = '';
                break;
            case 'center':
                this.style.alignItems = 'center';
                this.content.style.flexGrow = '';
                this.content.style.flexShrink = '';
                break;
            default:
                this.style.alignItems = 'auto';
                this.content.style.flexGrow = '';
                this.content.style.flexShrink = '';
                break;
        }

        this.vAlign = vAlign;
    }

    setAlignment(hAlign: HorizontalAlignment, vAlign: VerticalAlignment) {
        this.setHorizontalAlign(hAlign);
        this.setVerticalAlign(vAlign);
    }

    setDimensionMinMax(minWidth=-1, maxWidth=-1, minHeight=-1, maxHeight=-1) {
        if (! this.content)
            return;

        let data: Partial<Record<keyof CSSStyleDeclaration, string>> = { };
        if (minWidth !== -1)
            data.minWidth = minWidth.toString();
        if (maxWidth !== -1)
            data.maxWidth = maxWidth.toString();
        if (minHeight !== -1)
            data.minHeight = minHeight.toString();
        if (maxHeight !== -1)
            data.maxHeight = maxHeight.toString();

        Object.assign(this.content.style, data); 
    }

    setSpanAllRows(value) {
        if (this.spanAllRows === value)
            return;
        
        this.spanAllRows = value;
        if (value) {
            this.style.gridRowEnd = '-1';
        }
        else {
            this.style.gridRowEnd = '';
        }
        this.updateGridProperties();
        let event = new CustomEvent<LayoutCell>('layoutcell.spanAllRowsChanged', { detail: this })
        this.dispatchEvent(event);
    }

    updateGridProperties(fromSide: 'right' | 'left' | 'none' = 'none') {

        let columnEnd = 'span ' + this.data.spans.columns;

        let leftCell = this.leftCell();
        let rightCell = this.rightCell();

        if (this.horizontalStretchFactor > 0) {
            if (this.spanAllRows === false && leftCell === null && rightCell === null) {
                columnEnd = '-1';
                for (let column = this.data.column; column <= this.data.column + this.data.spans.columns - 1; column++)
                    this._parentLayout.setStretchFactor(column, LayoutCell.defaultFormat, true);
                this._parentLayout.setLayoutStretch(true);
            }
            else {
                for (let column = this.data.column; column <= this.data.column + this.data.spans.columns - 1; column++)
                    this._parentLayout.setStretchFactor(column, this.horizontalStretchFactor);
                columnEnd = 'span ' + this.data.spans.columns; //(rightCell.data.column - this.data.column + 1);
            }
        }

        if (fromSide !== 'left' && leftCell !== null && leftCell.horizontalStretchFactor > 0)
            leftCell.updateGridProperties('right');
        if (fromSide !== 'right' && rightCell !== null && rightCell.horizontalStretchFactor > 0)
            rightCell.updateGridProperties('left');

        this.style.gridColumn = (this.data.column + 1) + '/ ' + columnEnd;
        this.style.gridRow = (this.data.row + 1) + ' / ' + (this.spanAllRows ? '-1' : ('span ' + this.data.spans.rows));
    }
}

customElements.define('jmv-layoutcell', LayoutCell);

export default LayoutCell;
