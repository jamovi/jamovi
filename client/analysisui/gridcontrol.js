'use strict';

const SuperClass = require('../common/superclass');
const ControlBase = require('./controlbase');
const EnumPropertyFilter = require('./enumpropertyfilter');
const LayoutGrid = require('./layoutgrid');

const GridControl = function(params) {

    ControlBase.extendTo(this, params);

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

    this._override('onPropertyChanged', (baseFunction, name) => {
        if (baseFunction) baseFunction.call(this, name);
        if (name === 'contentLink') {
            if (this._cell)
                this._cell.setVisibility(this.getPropertyValue('contentLink'), true);
        }
    });

    this._fabricatedItem = false;

    this.usesSingleCell = function() {
        return this.$el !== undefined && this.onRenderToGrid === undefined;
    };

    this._applyCellProperties = function(cell) {

        if (this.hasProperty('horizontalAlignment'))
            cell.setHorizontalAlign(this.getPropertyValue('horizontalAlignment'));

        if (this.hasProperty('verticalAlignment'))
            cell.setVerticalAlign(this.getPropertyValue('verticalAlignment'));

        if (this.hasProperty('stretchFactor'))
            cell.setStretchFactor(this.getPropertyValue('stretchFactor'));

        cell.setDimensionMinMax(this.getPropertyValue('minWidth'), this.getPropertyValue('maxWidth'), this.getPropertyValue('minHeight'), this.getPropertyValue('maxHeight'));

        if (this.isPropertyDefined('contentLink') && cell.$content === this.$el) {
            cell.setVisibility(this.getPropertyValue('contentLink'), true);
            this._cell = cell;
        }
    };

    this.getSpans = function () {
        if (this.isPropertyDefined('cell'))
            return { rows: 1, columns: 2 };
        return { rows: 1, columns: 1 };
    };

    this._cell = null;

    this.renderToGrid = function(grid, row, column) {
        let spans = this.getSpans();
        let useSingleCell = this.getPropertyValue("useSingleCell");
        if (this.usesSingleCell()) {
            if (this.createItem)
                this.createItem();

            if (this.hasProperty('itemKey')) {
                let templateName = this.getTemplateInfo().templateName;
                if (templateName !== undefined)
                    this.$el.addClass('item-template ' + templateName);
            }

            let cell = grid.addCell(column, row, this);
            this._applyCellProperties(cell);

            if (this.addedContentToCell)
                this.addedContentToCell(cell);

            return { height: spans.rows, width: spans.columns, cell: cell };
        }
        else if (this.onRenderToGrid && this.usesSingleCell() === false && useSingleCell === true){
            LayoutGrid.extendTo(this);
            this.$el.addClass('silky-layout-grid');
            this.$el.addClass('multi-cell-wrapper');
            if (this.hasProperty('itemKey')) {
                let templateName = this.getTemplateInfo().templateName;
                if (templateName !== undefined)
                    this.$el.addClass('item-template ' + templateName);
            }
            if (this.componentItemsMerged)
                this.componentItemsMerged();
            if (this.hasProperty("margin")) {
                let margin = this.getPropertyValue("margin");
                this.$el.addClass("silky-control-margin-" + margin);
                this.setPropertyValue("margin", "none");
            }
            let returnData = this.onRenderToGrid(this, 0, 0);
            if (returnData.height > 0 || returnData.width > 0) {
                let cell = grid.addCell(column, row, this);
                this.render();
                this._applyCellProperties(cell);
                if (this.addedContentToCell)
                    this.addedContentToCell(cell);
                return { height: 1, width: 1, cell: cell };
            }
            return { height: 0, width: 0 };
        }
        else if (this.usesSingleCell() && this._fabricatedItem && useSingleCell === false) {
            this.$el.empty();
            delete this.$el;
            this._fabricatedItem = false;
        }

        let returnData = { height: 0, width: 0 };
        if (this.onRenderToGrid)
            returnData = this.onRenderToGrid(grid, row, column);

        if (returnData.cell)
            this._applyCellProperties(returnData.cell);

        return returnData;
    };

};

SuperClass.create(GridControl);

module.exports = GridControl;
