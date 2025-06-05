
'use strict';


import { LayoutGridItem } from './layoutgrid';
import GridControl from './gridcontrol';
import MultiContainer from './multicontainer';
const focusLoop = require('../common/focusloop');
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export class LayoutCollapseView extends LayoutGridItem(GridControl) {
    header: HTMLElement;
    _body: MultiContainer;

    constructor(params) {
        super(params);

        this._collapsed = this.getPropertyValue('collapsed');

        this._body = null;
    }

    protected registerProperties(properties) {
        super.registerProperties(properties);
        this.registerSimpleProperty("collapsed", false);
        this.registerSimpleProperty("label", null);
        this.registerSimpleProperty("stretchFactor", 1);
    }

    createItem() {
        this.el.classList.add(`jmv-collapse-view`, `titled-group`, `top-title`, `silky-layout-container`, `silky-options-group`, `silky-options-group-style-list`, `silky-control-margin-${this.getPropertyValue("margin")}`);

        let groupText = this.getPropertyValue('label');
        groupText = this.translate(groupText);
        let t = '<div class="silky-options-collapse-icon" style="display: inline;"> <span class="silky-dropdown-toggle"></span></div>';
        this.labelId = focusLoop.getNextAriaElementId('label');
        this.header = HTML.parse(`<button id="${this.labelId}" aria-level="2" class="silky-options-collapse-button silky-control-margin-${this.getPropertyValue("margin")}" style="white-space: nowrap;">${t + groupText }</button>`);

        this.header.setAttribute('aria-expanded', (! this._collapsed).toString());

        if (this._collapsed) {
            this.el.classList.add('view-colapsed');
            this.header.classList.add('silky-gridlayout-collapsed');
        }

        this._headerCell = this.el.addCell(0, 0, this.header);
        this._headerCell.setStretchFactor(1);

        this.header.addEventListener('click', (event) => {
            this.toggleColapsedState();
        });
    }

    setBody(body: MultiContainer) {
        let bodyId = body.el.getAttribute('id');
        if (!bodyId) {
            bodyId = focusLoop.getNextAriaElementId('body');
            body.el.setAttribute('id', bodyId);
        }
        body.el.setAttribute('role', 'region');
        body.el.setAttribute('aria-labelledby', this.labelId);

        this.header.setAttribute('aria-controls', bodyId);

        this._body = body;
        body.el.classList.add("silky-control-body");
        let data = body.renderToGrid(this.el, 1, 0, this);
        this._bodyCell = data.cell;
        this._bodyCell.setVisibility(this._collapsed === false, true);
        body.el.setAttribute('aria-hidden', this._collapsed);
        return data.cell;
    }

    collapse() {

        if (this._collapsed)
            return;

        this.header.classList.add("silky-gridlayout-collapsed");
        this.el.classList.add('view-colapsed');
        this._body.el.setAttribute('aria-hidden', 'true');

        this.setContentVisibility(false);
        this._collapsed = true;
        this.header.setAttribute('aria-expanded', 'false');
    }

    setContentVisibility(visible) {
        this._bodyCell.setVisibility(visible);
    }

    expand() {

        if ( ! this._collapsed)
            return;

        this.header.classList.remove("silky-gridlayout-collapsed");
        this.el.classList.remove('view-colapsed');
        this._body.el.setAttribute('aria-hidden', 'false');

        this.setContentVisibility(true);
        this._collapsed = false;
        this.header.setAttribute('aria-expanded', 'true');
    }

    toggleColapsedState() {
        if (this._collapsed)
            this.expand();
        else
            this.collapse();
    }
}

export default LayoutCollapseView;
