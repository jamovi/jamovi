'use strict';

const SuperClass = require('../common/superclass');
const LayoutGrid = require('./layoutgrid');
const TitledGridControl = require('./titledgridcontrol');
const LayoutGridBorderSupport = require('./layoutgridbordersupport');
const EnumPropertyFilter = require('./enumpropertyfilter');
const MultiContainer = require('./multicontainer');

const deepRenderToGrid = function(ctrl, context, toGrid, row, column) {
    let bodyContainers = [];
    let ctrlDef = ctrl.properties;
    if (ctrl.renderContainer)
        ctrl.renderContainer(context);
    else if (ctrlDef.controls !== undefined) {
        let style = ctrlDef.style === undefined ? "list" : ctrlDef.style.value;
        let childStyle = style.split('-');
        childStyle = childStyle[childStyle.length - 1];

        let looseCtrls = [];
        let controls = ctrl.getPropertyValue('controls');
        for (let child of controls) {
            if (child.typeName === 'Content') {
                let containerParams = { name: child.name, controls: child.controls, style: childStyle, _parentControl: ctrl };
                let childContainer = new ControlContainer(containerParams);
                childContainer.renderContainer(context);
                bodyContainers.push(childContainer);
            }
            else {
                looseCtrls.push(child);
            }
        }

        if (looseCtrls) {
            let containerParams = { controls: looseCtrls, style: childStyle, _parentControl: ctrl };

            let container = new ControlContainer(containerParams);
            container.renderContainer(context);
            bodyContainers.push(container);
        }
        
    }

    let cr2 = ctrl.renderToGrid(toGrid, row, column);

    if (bodyContainers.length > 0) {
        if (ctrl.setBody) {
            let body = new MultiContainer({ _parentControl: ctrl }, bodyContainers);
            if (ctrl.getPropertyValue('stretchFactor') > 0) {
                body.setPropertyValue('stretchFactor', 1);
            }

            let bodyCell = ctrl.setBody(body);
        }
        else
            throw "this control does not yet support child controls";
    }

    return cr2;
};

const ControlContainer = function(params) {

    LayoutGrid.extendTo(this);
    TitledGridControl.extendTo(this, params);
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
        let _lastCell = null;
        if (this.gridEntryPosition)
            _nextCell = { row: this.gridEntryPosition.row, column: this.gridEntryPosition.column };
        else
            this.gridEntryPosition = { row: 0, column: 0 };

        for (let i = 0; i < controls.length; i++) {
            let ctrlDef = controls[i];

            let cell = ctrlDef.cell;
            if (cell !== undefined) {
                _lastCell = { row:_nextCell.row, column: _nextCell.column };
                _nextCell.row = cell.row;
                _nextCell.column = cell.column * 2;
            }
            else
                ctrlDef.cell = { column: _nextCell.column, row: _nextCell.row };

            let ctrl = context.createControl(ctrlDef, this);
            if (ctrl === null)
                continue;

            let cr2 = deepRenderToGrid(ctrl, context, this, _nextCell.row, _nextCell.column);
            this.controls.push(ctrl);

            if (cell !== undefined) {
                if (_lastCell.row < _nextCell.row + cr2.height)
                    _lastCell.row = _nextCell.row;
                if (_lastCell.column < _nextCell.column + cr2.width)
                    _lastCell.column = _nextCell.column;
                _nextCell = _lastCell;
            }

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
