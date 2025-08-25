
'use strict';

import LayoutGrid, { LayoutControl } from './layoutgrid';
import { BorderLayoutGrid } from './layoutgridbordersupport';
import TitledGridControl from './titledgridcontrol';
import type { MultiContainer } from './multicontainer';
import { GridControlProperties } from './gridcontrol';
import { LayoutStyle } from './controlcontainer';

type Constructor<T = {}> = new (...params: any[]) => T;
type InferType<T> = T extends Constructor<TitledGridControl<infer A>> ? A : never;
export function createChildLayoutSupport<T extends Constructor<TitledGridControl<P>>, P extends GridControlProperties = InferType<T>>(params: P, TBase: T) {
    if (isChildSupportProperties(params))
        return ChildLayoutSupport(LayoutControl<T,P>(TBase, BorderLayoutGrid));  
    else
        return TBase;
}

const TitledLayoutGrid = LayoutControl<Constructor<TitledGridControl<GridControlProperties & ChildSupportProperties>>>(TitledGridControl<GridControlProperties & ChildSupportProperties>, BorderLayoutGrid);
type TitledLayoutGridType = Constructor<InstanceType<typeof TitledLayoutGrid>>;

export enum ComplexLayoutStyle {
    List = "list",
    Inline= "inline",
    ListInline = "list-inline",
    InlineList = "inline-list"
}

export type ChildSupportProperties = {
    style: ComplexLayoutStyle;
    controls: any[];
}

export const isChildSupportProperties = function(obj: any): obj is ChildSupportProperties {
    return obj !== null && Array.isArray(obj.controls);
}

export function ChildLayoutSupport<TBase extends TitledLayoutGridType>(Base: TBase) {
    return class extends Base {
        _body: MultiContainer;
        _style: ComplexLayoutStyle;
        _parentStyle: LayoutStyle;
        _childStyle: LayoutStyle;
        controls = [];

        constructor(...args: any[]) {
            super(...args);
            this._style = this.getPropertyValue('style');
            let _styles = this._style.split('-');
            this._parentStyle = _styles[0] as LayoutStyle;
            this._childStyle = _styles[_styles.length - 1] as LayoutStyle;
            this.el.cellStatus = true;
        }

        override renderToGrid(grid: LayoutGrid, row, column, gridOwner) {
            this.el.classList.add('silky-layout-container', 'titled-group', 'top-title', 'silky-options-group', `silky-options-group-style-${this._parentStyle}`, `silky-control-margin-${this.getPropertyValue("margin")}`);
            if (this._subel.classList.contains('silky-control-label'))
                this.el.classList.add('heading');
            let cell = this.el.addCell(0, 0, this._subel);
            this._applyCellProperties(cell);

            return super.renderToGrid(grid, row, column, gridOwner);
        }

        setBody(body: MultiContainer) {
            this._body = body;
            this.controls = body.controls;
            body.el.classList.add('silky-control-bod', `silky-control-body-style-${this._parentStyle}`);
            
            if (this.el.classList.contains('heading'))
                body.el.setAttribute('role', 'region');
            else
                body.el.setAttribute('role', 'group');
            body.el.setAttribute('aria-labelledby', this.getLabelId());

            let rData = null;
            if (this._style.startsWith('list'))
                rData = body.renderToGrid(this.el, 1, 0, this);
            else
                rData = body.renderToGrid(this.el, 0, 1, this);

            return rData.cell;
        }

        getControls() {
            return this.controls;
        }
    }
}

export default createChildLayoutSupport;
