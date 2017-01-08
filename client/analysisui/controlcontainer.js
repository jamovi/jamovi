'use strict';

var _ = require('underscore');
var $ = require('jquery');
var SuperClass = require('../common/superclass');
var LayoutGrid = require('./layoutgrid').Grid;
var GridControl = require('./gridcontrol');
var ControlBase = require('./controlbase');
var LayoutGridBorderSupport = require('./layoutgridbordersupport');
var EnumPropertyFilter = require('./enumpropertyfilter');

var ControlContainer = function(params) {

    ControlBase.extendTo(this, params);
    LayoutGrid.extendTo(this);
    GridControl.extendTo(this);
    LayoutGridBorderSupport.extendTo(this);

    this.editable = true;

    this.registerSimpleProperty("stretchFactor", 0);
    this.registerSimpleProperty("style", "list", new EnumPropertyFilter(["list", "inline"], "list"));
    this.registerSimpleProperty("name", null);
    this.registerSimpleProperty("margin", "none", new EnumPropertyFilter(["small", "normal", "large", "none"], "none"));

    this.$el.addClass("silky-control-container silky-layout-container");
    //this.$el.css("border", "1px dotted red");

    this.onRenderToGrid = function(grid, row, column) {

        this.$el.addClass("silky-control-margin-" + this.getPropertyValue("margin"));

        var stretchFactor = this.getPropertyValue("stretchFactor");

        var cell = grid.addLayout(column, row, true, this);

        cell.setStretchFactor(stretchFactor);

        return { height: 1, width: 1, cell: cell };
    };

    this.renderContainer = function(context) {
        if (this.onContainerRendering)
            this.onContainerRendering(context);

        var currentStyle = this.getPropertyValue("style");
        var controls = this.getPropertyValue("controls");
        var _nextCell = { row: 0, column: 0 };
        for (var i = 0; i < controls.length; i++) {
            var ctrlDef = controls[i];

            var cell = ctrlDef.cell;
            if (cell !== undefined) {
                _nextCell.row = cell.row;
                _nextCell.column = cell.column;
            }
            else
                ctrlDef.cell = { column: _nextCell.column, row: _nextCell.row };

            var ctrl = context.createControl(ctrlDef);
            if (ctrl === null)
                continue;

            var bodyContainer = null;
            if (ctrl.renderContainer) {
                var labeledGroup = _.isUndefined(ctrlDef.label) === false;
                ctrl.renderContainer(context);
            }
            else if (_.isUndefined(ctrlDef.controls) === false) {
                ctrlDef.style = _.isUndefined(ctrlDef.style) ? "list" : ctrlDef.style;
                var childStyle = ctrlDef.style.split('-');
                childStyle = childStyle[childStyle.length - 1];

                bodyContainer = new ControlContainer( { name: ctrlDef.name + "_children", controls: ctrlDef.controls, style: childStyle });
                bodyContainer.renderContainer(context);
            }

            var cr2 = ctrl.renderToGrid(this, _nextCell.row, _nextCell.column);
            if (bodyContainer !== null) {
                if (ctrl.setBody)
                    ctrl.setBody(bodyContainer);
                else
                    throw "this control does not yet support child controls";
            }

            if (currentStyle.startsWith('inline')) {
                _nextCell.row = 0;
                _nextCell.column = _nextCell.column + cr2.width;
            }
            else {
                _nextCell.row = _nextCell.row + cr2.height;
                _nextCell.column = 0;
            }
        }
        if (this.onContainerRendered)
            this.onContainerRendered();
    };
};

SuperClass.create(ControlContainer);

module.exports = ControlContainer;
