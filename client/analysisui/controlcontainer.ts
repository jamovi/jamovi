'use strict';

import LayoutGrid from './layoutgrid';
import TitledGridControl from './titledgridcontrol';
import { BorderLayoutGrid } from './layoutgridbordersupport';
import EnumPropertyFilter from './enumpropertyfilter';
import MultiContainer from './multicontainer';
import { GridControlProperties } from './gridcontrol';
import { Margin } from './controlbase';
import { Control, IControlProvider } from './optionsview';
import { ComplexLayoutStyle, isChildSupportProperties } from './childlayoutsupport';

export const deepRenderToGrid = function<P extends GridControlProperties>(ctrl: Control<P>, context: IControlProvider, toGrid: LayoutGrid, row, column, gridOwner) {
    let bodyContainers: ControlContainer[] = [];
    let ctrlDef = ctrl.params;
    if (ctrl.renderContainer)
        ctrl.renderContainer(context);
    else if (isChildSupportProperties(ctrlDef)) {
        let style = ctrlDef.style === undefined ? ComplexLayoutStyle.List : ctrlDef.style;
        let childStyleList = style.split('-');
        let childStyle = childStyleList[childStyleList.length - 1] as LayoutStyle.List;

        let looseCtrls = [];
        let controls = ctrl.getPropertyValue('controls');
        for (let child of controls) {
            if (child.typeName === 'Content') {
                let containerParams: ControlContainerProperties = { name: child.name, controls: child.controls, style: childStyle };
                if (ctrl.getPropertyValue('stretchFactor') > 0)
                    containerParams.stretchFactor = 1;
                let childContainer = new ControlContainer(containerParams, ctrl);
                childContainer.renderContainer(context);
                bodyContainers.push(childContainer);
            }
            else {
                looseCtrls.push(child);
            }
        }

        if (looseCtrls) {
            let containerParams: ControlContainerProperties = { controls: looseCtrls, style: childStyle };

            if (ctrl.getPropertyValue('stretchFactor') > 0)
                containerParams.stretchFactor = 1;
            
            let container = new ControlContainer(containerParams, ctrl);
            container.renderContainer(context);
            bodyContainers.push(container);
        }
        
    }

    let cr2 = ctrl.renderToGrid(toGrid, row, column, gridOwner);

    if (bodyContainers.length > 0) {
        if (ctrl.setBody) {
            let body = new MultiContainer({ }, bodyContainers, ctrl);
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

export enum LayoutStyle {
    List = "list",
    Inline = "inline"
}


export type ControlContainerProperties = GridControlProperties & {
    style?: LayoutStyle;
    margin?: Margin;
    name?: string;
    labelSource?: string;
    controls: any[];
}

export class ControlContainer<P extends ControlContainerProperties = ControlContainerProperties, TGrid extends new () => BorderLayoutGrid = typeof BorderLayoutGrid> extends TitledGridControl<P> {

    controls: any[] = [];
    declare _el: InstanceType<TGrid>;
    labelSourceCtrl: Control<any>;
    gridEntryPosition: {row: number, column: number };

    constructor(params: P, parent, Grid: TGrid = BorderLayoutGrid as TGrid) {
        super(params, parent);
        this.setRootElement(new Grid());

        this.el.editable = true;
        this.el.cellStatus = true;

        this.el.classList.add("silky-control-container", "silky-layout-container");
        //this.el.style.border = "1px dotted red";
        this.el.classList.add("silky-control-margin-" + this.getPropertyValue("margin"));

        
    }

    override get el() {
        return this._el;
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty("style", LayoutStyle.List, new EnumPropertyFilter(LayoutStyle, LayoutStyle.List));
        this.registerSimpleProperty("name", null);
        this.registerSimpleProperty("labelSource", null);
        this.registerSimpleProperty("margin", Margin.None, new EnumPropertyFilter(Margin, Margin.None));
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

    renderContainer(context: IControlProvider) {
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

    protected onContainerRendered?(): void;
}
