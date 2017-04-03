'use strict';

const SuperClass = require('../common/superclass');
const ControlBase = require('./controlbase');
const EnumPropertyFilter = require('./enumpropertyfilter');
const LayoutGrid = require('./layoutgrid').Grid;

const GridControl = function(params) {

    ControlBase.extendTo(this, params);

    this.registerSimpleProperty("fitToGrid", false);
    this.registerSimpleProperty("stretchFactor", 0);
    this.registerSimpleProperty("horizontalAlignment", "left", new EnumPropertyFilter(["left", "center", "right"], "left"));
    this.registerSimpleProperty("verticalAlignment", "top", new EnumPropertyFilter(["top", "center", "bottom"], "top"));
    this.registerSimpleProperty("minWidth", -1);
    this.registerSimpleProperty("minHeight", -1);
    this.registerSimpleProperty("maxWidth", -1);
    this.registerSimpleProperty("maxHeight", -1);
    this.registerSimpleProperty("cell", null);
    this.registerSimpleProperty("useSingleCell", false);

    this._fabricatedItem = false;

    this.usesSingleCell = function() {
        return this.$el !== undefined && this.onRenderToGrid === undefined;
    };

    this._applyCellProperties = function(cell) {

        if (this.hasProperty('horizontalAlignment'))
            cell.setHorizontalAlign(this.getPropertyValue('horizontalAlignment'));

        if (this.hasProperty('verticalAlignment'))
            cell.setVerticalAlign(this.getPropertyValue('verticalAlignment'));

        if (this.hasProperty('fitToGrid'))
            cell.fitToGrid = this.getPropertyValue('fitToGrid');

        if (this.hasProperty('stretchFactor'))
            cell.setStretchFactor(this.getPropertyValue('stretchFactor'));

        cell.minimumWidth = this.getPropertyValue('minWidth');
        cell.maximumWidth = this.getPropertyValue('maxWidth');
        cell.minimumHeight = this.getPropertyValue('maxHeight');
        cell.maximumHeight = this.getPropertyValue('minHeight');
    };

    this.renderToGrid = function(grid, row, column) {

        let useSingleCell = this.getPropertyValue("useSingleCell");
        if (this.usesSingleCell()) {
            if (this.createItem)
                this.createItem();

            if (this.hasProperty('itemKey')) {
                let templateName = this.getTemplateInfo().templateName;
                if (templateName !== undefined)
                    this.$el.addClass(templateName);
            }

            let cell = grid.addCell(column, row, false, this);
            this._applyCellProperties(cell);

            if (this.addedContentToCell)
                this.addedContentToCell(cell);

            return { height: 1, width: 1, cell: cell };
        }
        else if (this.onRenderToGrid && this.usesSingleCell() === false && useSingleCell === true){
            LayoutGrid.extendTo(this);
            this.$el.addClass('silky-layout-grid');
            this.$el.addClass('multi-cell-wrapper');
            if (this.hasProperty('itemKey')) {
                let templateName = this.getTemplateInfo().templateName;
                if (templateName !== undefined)
                    this.$el.addClass(templateName);
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
                let cell = grid.addCell(column, row, this.getPropertyValue('fitToGrid'), this);
                this.render();
                this._applyCellProperties(cell);
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
