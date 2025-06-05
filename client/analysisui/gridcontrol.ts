'use strict';

import ControlBase from './controlbase';
import LayoutCell, { ICellContentsItem } from './layoutcell';
const EnumPropertyFilter = require('./enumpropertyfilter');
import LayoutGrid from './layoutgrid';

export interface IRenderReturnData { height: number, width: number, cell?: LayoutCell };


export class GridControl extends ControlBase {
    _fabricatedItem: boolean;
    _cell = null;
    el?: HTMLElement;

    constructor(params) {
        super(params);
        
        this._fabricatedItem = false;

        this._cell = null;
    }

    onRenderToGrid?(grid: LayoutGrid, row: number, column: number, owner): IRenderReturnData;

    protected registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty("stretchFactor", 0);
        this.registerSimpleProperty("horizontalAlignment", "left", new EnumPropertyFilter(["left", "center", "right"], "left"));
        this.registerSimpleProperty("verticalAlignment", "top", new EnumPropertyFilter(["top", "center", "bottom"], "top"));
        this.registerSimpleProperty("minWidth", -1);
        this.registerSimpleProperty("minHeight", -1);
        this.registerSimpleProperty("maxWidth", -1);
        this.registerSimpleProperty("maxHeight", -1);
        this.registerSimpleProperty("cell", null);
        this.registerSimpleProperty("useSingleCell", false);
        this.registerSimpleProperty("contentLink", true); // displays the control with specific content of a content selector. The value is a bool however in the yaml it is a string of the content path.
    }

    onPropertyChanged(name)  {
        super.onPropertyChanged(name);
        if (name === 'contentLink') {
            if (this._cell)
                this._cell.setVisibility(this.getPropertyValue('contentLink'), true);
        }
    }
    
    usesSingleCell() {
        return this.el !== undefined && this.onRenderToGrid === undefined;
    }

    _applyCellProperties(cell) {

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

            if (this.hasProperty('itemKey')) {
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
            if (this.hasProperty('itemKey')) {
                let templateName = this.getTemplateInfo().templateName;
                if (templateName !== undefined)
                    wrapper.classList.add('item-template ' + templateName);
            }
            if (this.componentItemsMerged)
                this.componentItemsMerged();
            if (this.hasProperty("margin")) {
                let margin = this.getPropertyValue("margin");
                wrapper.classList.add("silky-control-margin-" + margin);
                this.setPropertyValue("margin", "none");
            }

            let returnData = this.onRenderToGrid(wrapper, 0, 0, gridOwner);
            this.el = wrapper; // this makes it comply with ICellContentsItem interface

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
            delete this.el;
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
