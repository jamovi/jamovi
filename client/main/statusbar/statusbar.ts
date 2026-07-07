'use strict';

import StatusbarButton from './statusbarbutton';
import { h }  from '../../common/htmlelementcreator';

export type StatusbarItemProperties = { dock?: 'left' | 'right', value? : any, label?: string };
export type StatusbarItem = { $el: HTMLElement, properties: StatusbarItemProperties };

class Statusbar extends HTMLElement {

    _infoLabels: { [id: string]: StatusbarItem };

    constructor() {
        super();
        this.classList.add('jmv-status-bar');
        this.setAttribute('role', 'region');
        this.setAttribute('aria-label', _('Data status bar'));
        this.replaceChildren(
            h('div', { class: 'left-dock', role: 'presentation' }),
            h('div', { class: 'right-dock', role: 'presentation' }));

        this.addEventListener('dblclick', event => this._dblclicked(event));

        this._infoLabels = {};

    }
    
    _dblclicked(event: MouseEvent) {
        event.stopPropagation();
        event.preventDefault();
    }

    addElement(id: string, $element: HTMLElement, properties: StatusbarItemProperties) : StatusbarItem {
        if (properties === undefined)
            properties = { };

        if (properties.dock === undefined)
            properties.dock = 'right';

        let item = { $el: $element, properties: properties };
        this._infoLabels[id] = item;

        let $el = this.querySelector('.' + properties.dock + '-dock');
        $el.append($element);

        return item;
    }

    addInfoLabel(id: string, properties: StatusbarItemProperties) {
        if (properties === undefined)
            properties = { value: '' };

        let label = properties.label === undefined ? properties.value : (properties.label + ' ' + properties.value);
        this.addElement(id, h('div', { class: 'jmv-status-bar-info-item', 'data-id': id }, label), properties);
    }

    updateInfoLabel(id: string, value: any) {
        let item = this._infoLabels[id];
        if (item.properties.value != value) {
            item.properties.value = value;
            item.$el.textContent = (item.properties.label === undefined ? item.properties.value : (item.properties.label + ' ' + item.properties.value));
        }
    }

    removeInfoLabel(id: string) {
        let item = this._infoLabels[id];
        item.$el.remove();
        delete this._infoLabels[id];
    }

    addActionButton(name: string, properties: StatusbarItemProperties) {
        let button = new StatusbarButton();
        button.setName(name, properties);
        this.addElement(name, button, properties);
    }
}

customElements.define('jmv-statusbar', Statusbar);

export default Statusbar;
