'use strict';

import LayoutGrid, { LayoutGridItem } from './layoutgrid';
import TitledGridControl from './titledgridcontrol';
import { BorderLayoutGrid } from './layoutgridbordersupport';
import EnumPropertyFilter from './enumpropertyfilter';
import MultiContainer from './multicontainer';

export const deepRenderToGrid = function(ctrl, context, toGrid: LayoutGrid, row, column, gridOwner) {
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
                if (ctrl.getPropertyValue('stretchFactor') > 0)
                    containerParams.stretchFactor = 1;
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

            if (ctrl.getPropertyValue('stretchFactor') > 0)
                containerParams.stretchFactor = 1;
            
            let container = new ControlContainer(containerParams);
            container.renderContainer(context);
            bodyContainers.push(container);
        }
        
    }

    let cr2 = ctrl.renderToGrid(toGrid, row, column, gridOwner);

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

export const ControlContainer = ControlContainerItem();

export function ControlContainerItem<T extends new () => BorderLayoutGrid = typeof BorderLayoutGrid>(Grid: T = BorderLayoutGrid as T) {
    return class  extends LayoutGridItem(TitledGridControl, Grid) {
        controls: any[] = [];
        
        constructor(params) {
            super(params);

            this.el.editable = true;
            this.el.cellStatus = true;

            this.el.classList.add("silky-control-container", "silky-layout-container");
            //this.el.style.border = "1px dotted red";
            this.el.classList.add("silky-control-margin-" + this.getPropertyValue("margin"));
        }

        protected registerProperties(properties) {
            super.registerProperties(properties);

            this.registerSimpleProperty("style", "list", new EnumPropertyFilter(["list", "inline"], "list"));
            this.registerSimpleProperty("name", null);
            this.registerSimpleProperty("labelSource", null);
            this.registerSimpleProperty("margin", "none", new EnumPropertyFilter(["small", "normal", "large", "none"], "none"));
        }

        getLabelId() {
            if (this.labelSourceCtrl)
                return this.labelSourceCtrl.getValueId();

            return null;
        }

        getControls() {
            return this.controls;
        }

        onContainerRendering(context) {

        }

        renderContainer(context) {
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

                let cr2 = deepRenderToGrid(ctrl, context, this.el, _nextCell.row, _nextCell.column, this);
                this.controls.push(ctrl);

                let labelSource = this.getPropertyValue('labelSource');
                if (labelSource && ctrlDef.name === labelSource) {
                    this.labelSourceCtrl = ctrl;
                    this.el.setAttribute('role', 'group');
                    this.el.setAttribute('aria-labelledby', ctrl.getValueId());
                }

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
        }
    }
}
