'use strict';

var _ = require('underscore');
var $ = require('jquery');
var LayoutGrid = require('./layoutgrid').Grid;
var GridControl = require('./gridcontrol');
var ControlBase = require('./controlbase');

var ControlContainer = function(uiModel, params) {

    ControlBase.extendTo(this, params);
    LayoutGrid.extendTo(this);
    GridControl.extend(this);

    this.registerSimpleProperty("stretchFactor", 0);
    this.registerSimpleProperty("level", 0);
    this.registerSimpleProperty("animate", false);
    this.registerSimpleProperty("style", "list");

    this.model = uiModel;

    this.onRenderToGrid = function(grid, row, column) {
        var name = this.getPropertyValue("name");
        var stretchFactor = this.getPropertyValue("stretchFactor");
        var animate = this.getPropertyValue("animate");

        var cell = grid.addLayout(name + '_group', column, row, true, this);

        cell.setStretchFactor(stretchFactor);
        this._animateCells = animate;

        return { height: 1, width: 1 };
    };

    this.renderLayout = function(level) {
        if (this.onLayoutRendering)
            this.onLayoutRendering();

        var currentStyle = this.getPropertyValue("style");
        var items = this.getPropertyValue("items");
        var _nextCell = { row: 0, column: 0 };
        for (var i = 0; i < items.length; i++) {
            var item = items[i];

            var cell = item.cell;
            if (_.isUndefined(cell) === false) {
                _nextCell.row = cell[1];
                _nextCell.column = cell[0];
            }

            var isGroup = _.isUndefined(item.items) === false;

            if (isGroup === true) {

                if (_.isUndefined(item.type))
                    item.type = "group";

                if (_.isUndefined(item.level))
                    item.level = level;

                var newGroup = this.model.createContainer(item);

                var cr1 = { height: 0, width: 0 };
                if (newGroup !== null && newGroup.getPropertyValue("stage") === "release") {
                    var labeledGroup = _.isUndefined(item.label) === false;
                    newGroup.renderLayout(labeledGroup ? item.level + 1 : item.level);
                    cr1 = newGroup.renderToGrid(this, _nextCell.row, _nextCell.column);
                }
                _nextCell.row += cr1.height;
            }
            else {

                var ctrl = this.model.createControl(item);
                if (ctrl !== null) {
                    var stage = ctrl.getPropertyValue("stage");
                    if (stage === "release") {
                        var cr2 = ctrl.renderToGrid(this, _nextCell.row, _nextCell.column);

                        if (currentStyle === 'inline') {
                            _nextCell.row = 0;
                            _nextCell.column = _nextCell.column + cr2.width;
                        }
                        else {
                            _nextCell.row = _nextCell.row + cr2.height;
                            _nextCell.column = 0;
                        }
                    }
                }
            }
        }
        if (this.onLayoutRendered)
            this.onLayoutRendered();
    };
};

ControlContainer.extendTo = function(target, uiModel, params) {
    ControlContainer.call(target, uiModel, params);
};

module.exports = ControlContainer;
