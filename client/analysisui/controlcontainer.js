'use strict';

const SuperClass = require('../common/superclass');
const LayoutGrid = require('./layoutgrid').Grid;
const GridControl = require('./gridcontrol');
const LayoutGridBorderSupport = require('./layoutgridbordersupport');
const EnumPropertyFilter = require('./enumpropertyfilter');

const deepRenderToGrid = function(ctrl, context, toGrid, row, column) {
    let bodyContainer = null;
    let ctrlDef = ctrl.properties;
    if (ctrl.renderContainer)
        ctrl.renderContainer(context);
    else if (ctrlDef.controls !== undefined) {
        let style = ctrlDef.style === undefined ? "list" : ctrlDef.style.value;
        let childStyle = style.split('-');
        childStyle = childStyle[childStyle.length - 1];

        let containerParams = { controls: ctrl.getPropertyValue('controls'), style: childStyle, _parentControl: ctrl };

        bodyContainer = new ControlContainer(containerParams);
        bodyContainer.renderContainer(context);
    }

    let cr2 = ctrl.renderToGrid(toGrid, row, column);

    if (bodyContainer !== null) {
        if (ctrl.setBody) {
            if (ctrl.getPropertyValue('stretchFactor') > 0)
                bodyContainer.setPropertyValue('stretchFactor', 1);
            let bodyCell = ctrl.setBody(bodyContainer);
        }
        else
            throw "this control does not yet support child controls";
    }

    return cr2;
};

const ControlContainer = function(params) {

    LayoutGrid.extendTo(this);
    GridControl.extendTo(this, params);
    LayoutGridBorderSupport.extendTo(this);

    this.editable = true;

    this.registerSimpleProperty("style", "list", new EnumPropertyFilter(["list", "inline"], "list"));
    this.registerSimpleProperty("name", null);
    this.registerSimpleProperty("margin", "none", new EnumPropertyFilter(["small", "normal", "large", "none"], "none"));

    this.$el.addClass("silky-control-container silky-layout-container");
    //this.$el.css("border", "1px dotted red");
    this.$el.addClass("silky-control-margin-" + this.getPropertyValue("margin"));

    this.controls = [];

    this.getControls = function() {
        return this.controls;
    };

    this.renderContainer = function(context) {
        if (this.onContainerRendering)
            this.onContainerRendering(context);

        let currentStyle = this.getPropertyValue("style");
        let controls = this.getPropertyValue("controls");
        let _nextCell = { row: 0, column: 0 };
        if (this.gridEntryPosition)
            _nextCell = { row: this.gridEntryPosition.row, column: this.gridEntryPosition.column };
        else
            this.gridEntryPosition = { row: 0, column: 0 };

        for (let i = 0; i < controls.length; i++) {
            let ctrlDef = controls[i];

            let cell = ctrlDef.cell;
            if (cell !== undefined) {
                _nextCell.row = cell.row;
                _nextCell.column = cell.column;
            }
            else
                ctrlDef.cell = { column: _nextCell.column, row: _nextCell.row };

            let ctrl = context.createControl(ctrlDef, this);
            if (ctrl === null)
                continue;

            let cr2 = deepRenderToGrid(ctrl, context, this, _nextCell.row, _nextCell.column);
            this.controls.push(ctrl);

            if (currentStyle.startsWith('inline')) {
                _nextCell.row = this.gridEntryPosition.row;
                _nextCell.column = _nextCell.column + cr2.width;
            }
            else {
                _nextCell.row = _nextCell.row + cr2.height;
                _nextCell.column = this.gridEntryPosition.column;
            }
        }
        if (this.onContainerRendered)
            this.onContainerRendered();
    };
};

SuperClass.create(ControlContainer);

module.exports = { container: ControlContainer, renderContainerItem: deepRenderToGrid };
