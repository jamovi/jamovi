'use strict';

import $ from 'jquery'; // for backwards compatibility

import ControlBase, { ControlBaseProperties, Margin } from './controlbase';
import LayoutCell, { ICellContentsItem } from './layoutcell';
import EnumPropertyFilter from './enumpropertyfilter';
import LayoutGrid from './layoutgrid';
import { isTemplateItemControlProperties } from './templateitemcontrol';

export interface IRenderReturnData { height: number, width: number, cell?: LayoutCell };

export enum HorizontalAlignment {
  Left = "left",
  Center = "center",
  Right = "right"
}

export enum VerticalAlignment {
  Top = "top",
  Center = "center",
  Bottom = "bottom"
}

function isVerticalAlignment(value: string): value is VerticalAlignment {
  return Object.values(VerticalAlignment).includes(value as VerticalAlignment);
}

function isHorizontalAlignment(value: string): value is HorizontalAlignment {
  return Object.values(HorizontalAlignment).includes(value as HorizontalAlignment);
}

export type GridControlProperties = ControlBaseProperties & {
    stretchFactor: number;
    horizontalAlignment: HorizontalAlignment;
    verticalAlignment: VerticalAlignment;
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
    useSingleCell: boolean;
    cell: { row: number, column: number };
    contentLink: boolean;  // displays the control with specific content of a content selector. The value is a bool however in the yaml it is a string of the content path.
}

export class GridControl<T extends GridControlProperties> extends ControlBase<T> {
    _fabricatedItem: boolean;
    _cell = null;
    protected _el?: HTMLElement;

    /**
     * @deprecated Should not be used. Rather use `(property) Control.el: HTMLElement`.
     */
    _$el: any;

    constructor(params: T, parent) {
        super(params, parent);
        
        this._fabricatedItem = false;

        this._cell = null;
    }

    get el() {
        return this._el;
    }

    get $el() : any {
        return this._$el;
    }

    setRootElement(el: HTMLElement): void {
        this._el = el;
        this._$el = $(this._el);
    }

    onRenderToGrid?(grid: LayoutGrid, row: number, column: number, owner): IRenderReturnData;

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty("stretchFactor", 0);
        this.registerSimpleProperty("horizontalAlignment", HorizontalAlignment.Left, new EnumPropertyFilter(HorizontalAlignment, HorizontalAlignment.Left));
        this.registerSimpleProperty("verticalAlignment", VerticalAlignment.Top, new EnumPropertyFilter(VerticalAlignment, VerticalAlignment.Top));
        this.registerSimpleProperty("minWidth", -1);
        this.registerSimpleProperty("minHeight", -1);
        this.registerSimpleProperty("maxWidth", -1);
        this.registerSimpleProperty("maxHeight", -1);
        this.registerSimpleProperty("cell", null);
        this.registerSimpleProperty("useSingleCell", false);
        this.registerSimpleProperty("contentLink", true); // displays the control with specific content of a content selector. The value is a bool however in the yaml it is a string of the content path.
    }

    override onPropertyChanged(name)  {
        super.onPropertyChanged(name);
        if (name === 'contentLink') {
            if (this._cell)
                this._cell.setVisibility(this.getPropertyValue('contentLink'), true);
        }
    }
    
    usesSingleCell() {
        return this.el !== undefined && this.onRenderToGrid === undefined;
    }

    _applyCellProperties(cell: LayoutCell): void {

        if (this.hasProperty('horizontalAlignment'))
            cell.setHorizontalAlign(this.getPropertyValue('horizontalAlignment'));

        if (this.hasProperty('verticalAlignment'))
            cell.setVerticalAlign(this.getPropertyValue('verticalAlignment'));

        if (this.hasProperty('stretchFactor'))
            cell.setStretchFactor(this.getPropertyValue('stretchFactor'));

        cell.setDimensionMinMax(this.getPropertyValue('minWidth'), this.getPropertyValue('maxWidth'), this.getPropertyValue('minHeight'), this.getPropertyValue('maxHeight'));

        if (this.isPropertyDefined('contentLink') && cell.content === this.el) {
            cell.setVisibility(this.getPropertyValue('contentLink'), true);
            this._cell = cell;
        }
    }

    getSpans() {
        if (this.isPropertyDefined('cell'))
            return { rows: 1, columns: 2 };
        return { rows: 1, columns: 1 };
    }

    createItem() {

    }

    addedContentToCell(cell) {

    }

    componentItemsMerged() {

    }

    renderToGrid(grid: LayoutGrid, row, column, gridOwner) : IRenderReturnData {
        let spans = this.getSpans();
        let useSingleCell = this.getPropertyValue("useSingleCell");
        if (this.usesSingleCell()) {
            if (this.createItem)
                this.createItem();

            if (isTemplateItemControlProperties(this.params)) {
                let templateName = this.getTemplateInfo().templateName;
                if (templateName !== undefined)
                    this.el.classList.add('item-template', templateName);
            }

            let cell = grid.addCell(column, row, this as ICellContentsItem);
            this._applyCellProperties(cell);

            if (this.addedContentToCell)
                this.addedContentToCell(cell);

            return { height: spans.rows, width: spans.columns, cell: cell };
        }
        else if (this.onRenderToGrid && this.usesSingleCell() === false && useSingleCell === true){
            let wrapper = new LayoutGrid();

            //LayoutGrid.extendTo(this);
            wrapper.classList.add('silky-layout-grid');
            wrapper.classList.add('multi-cell-wrapper');
            if (isTemplateItemControlProperties(this.params)) {
                let templateName = this.getTemplateInfo().templateName;
                if (templateName !== undefined)
                    wrapper.classList.add('item-template ' + templateName);
            }
            if (this.componentItemsMerged)
                this.componentItemsMerged();
            if (this.hasProperty("margin")) {
                let margin = this.getPropertyValue("margin");
                wrapper.classList.add("silky-control-margin-" + margin);
                this.setPropertyValue("margin", Margin.None);
            }

            let returnData = this.onRenderToGrid(wrapper, 0, 0, gridOwner);
            this.setRootElement(wrapper); // this makes it comply with ICellContentsItem interface

            if (returnData.height > 0 || returnData.width > 0) {
                let cell = grid.addCell(column, row, this as ICellContentsItem); // see above
                this._applyCellProperties(cell);
                if (this.addedContentToCell)
                    this.addedContentToCell(cell);
                return { height: 1, width: 1, cell: cell };
            }
            return { height: 0, width: 0 };
        }
        else if (this.usesSingleCell() && this._fabricatedItem && useSingleCell === false) {
            this.el.innerHTML = '';
            delete this._el;
            delete this._$el;
            this._fabricatedItem = false;
        }

        let returnData: IRenderReturnData = { height: 0, width: 0 };
        if (this.onRenderToGrid)
            returnData = this.onRenderToGrid(grid, row, column, gridOwner);

        if (returnData.cell)
            this._applyCellProperties(returnData.cell);

        return returnData;
    }
}

export default GridControl;
