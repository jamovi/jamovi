
'use strict';

import LayoutGrid, { LayoutGridItem } from './layoutgrid';
import { BorderLayoutGrid } from './layoutgridbordersupport';
import TitledGridControl from './titledgridcontrol';
import type { MultiContainer } from './multicontainer';

type Constructor<T = {}> = new (...params: any[]) => T;

export function createChildLayoutSupport<T extends Constructor<TitledGridControl>>(params, TBase: T) {
    if (params && params.controls)
        return ChildLayoutSupport(LayoutGridItem(TBase, BorderLayoutGrid));  
    else
        return TBase;
}

const TitledLayoutGrid = LayoutGridItem(TitledGridControl, BorderLayoutGrid);
type TitledLayoutGridType = typeof TitledLayoutGrid;

export function ChildLayoutSupport<TBase extends Constructor<InstanceType<TitledLayoutGridType>>>(Base: TBase) {
    return class extends Base {
        _body: MultiContainer;

        constructor(...args: any[]) {
            super(args[0]);
            this._style = this.getPropertyValue('style');
            this._styles = this._style.split('-');
            this._parentStyle = this._styles[0];
            this._childStyle = this._styles[this._styles.length - 1];
            this.el.cellStatus = true;
            this.controls = [];
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
