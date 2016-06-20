'use strict';

var _ = require('underscore');
var $ = require('jquery');
var LayoutGrid = require('./layoutgrid').Grid;
var GridControl = require('./gridcontrol');
var ControlBase = require('./controlbase');
var LayoutGridBorderSupport = require('./layoutgridbordersupport');

var ControlContainer = function(params) {

    ControlBase.extendTo(this, params);
    LayoutGrid.extendTo(this);
    GridControl.extend(this);
    LayoutGridBorderSupport.extendTo(this);

    this.registerSimpleProperty("stretchFactor", 0);
    this.registerSimpleProperty("animate", false);
    this.registerSimpleProperty("style", "list");
    this.registerSimpleProperty("name", null);


    this.onRenderToGrid = function(grid, row, column) {

        this.$el.addClass("silky-control-container");

        var stretchFactor = this.getPropertyValue("stretchFactor");
        var animate = this.getPropertyValue("animate");

        var cell = grid.addLayout(column, row, true, this);

        cell.setStretchFactor(stretchFactor);
        this._animateCells = animate;

        return { height: 1, width: 1 };
    };

    this.renderContainer = function(context, level) {
        if (this.onContainerRendering)
            this.onContainerRendering(context);

        var currentStyle = this.getPropertyValue("style");
        var controls = this.getPropertyValue("controls");
        var _nextCell = { row: 0, column: 0 };
        for (var i = 0; i < controls.length; i++) {
            var ctrlDef = controls[i];

            var itemLevel = ctrlDef.level;
            if (_.isUndefined(itemLevel)) {
                ctrlDef.level = level;
                itemLevel = level;
            }

            var cell = ctrlDef.cell;
            if (_.isUndefined(cell) === false) {
                _nextCell.row = cell[1];
                _nextCell.column = cell[0];
            }
            else
                ctrlDef.cell = [_nextCell.column, _nextCell.row];

            var ctrl = context.createControl(ctrlDef);
            if (ctrl === null)
                continue;

            var bodyContainer = null;
            if (ctrl.renderContainer) {
                var labeledGroup = _.isUndefined(ctrlDef.label) === false;
                ctrl.renderContainer(context, labeledGroup ? itemLevel + 1 : itemLevel);
            }
            else if (_.isUndefined(ctrlDef.controls) === false) {
                ctrlDef.style = _.isUndefined(ctrlDef.style) ? "list" : ctrlDef.style;
                bodyContainer = new ControlContainer( { name: ctrlDef.name + "_children", controls: ctrlDef.controls, style: ctrlDef.style });
                bodyContainer.$el.addClass("silky-options-indented-" + ctrlDef.style);
                bodyContainer.renderContainer(context, itemLevel);
            }

            var cr2 = ctrl.renderToGrid(this, _nextCell.row, _nextCell.column);
            if (bodyContainer !== null) {
                if (ctrlDef.style === 'inline')
                    _nextCell.column += cr2.width;
                else
                    _nextCell.row += cr2.height;
                cr2 = bodyContainer.renderToGrid(this, _nextCell.row, _nextCell.column);
            }

            if (currentStyle === 'inline') {
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

ControlContainer.extendTo = function(target, params) {
    ControlContainer.call(target, params);
};

module.exports = ControlContainer;
