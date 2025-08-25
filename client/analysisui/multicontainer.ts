'use strict';


import GridControl, { GridControlProperties } from './gridcontrol';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { ControlContainer } from './controlcontainer';

export class MultiContainer extends GridControl<GridControlProperties> {
 
    _containers: ControlContainer[];
    _namedContainers: { [name: string ]: ControlContainer };
    _visibleContainer: ControlContainer;

    constructor(params: GridControlProperties, containers: ControlContainer[], parent) {
        super(params, parent);

        this._containers = containers;

        this._namedContainers = {};
        for (let container of containers) {
            let name = container.getPropertyValue('name');
            if (name) {
                this._namedContainers[name] = container;
                container.el.classList.add('container-hidden');
                container.el.setAttribute('data-content-name', name);
            }
        }

        this._visibleContainer = null;

        this.setRootElement(HTML.parse('<div class="jmv-multi-container"></div>'));
    }

    createItem() {
        for (let container of this._containers) {
            this.el.append(container.el);
        }
    }

    setContainer(name) {
        if (this._visibleContainer)
            this._visibleContainer.el.classList.add('container-hidden');
        
        this._visibleContainer = this._namedContainers[name];

        if (this._visibleContainer)
            this._visibleContainer.el.classList.remove('container-hidden');
    }
}

export default MultiContainer;