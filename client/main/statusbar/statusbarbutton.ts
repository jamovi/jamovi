
'use strict';

import ActionHub from '../actionhub';
import { StatusbarItemProperties } from './statusbar';
import ButtonElement from '../utils/buttonelement';

class StatusbarButton extends ButtonElement {
    _name: string = null;
    _properties: StatusbarItemProperties;

    constructor() {
        super();
    }

    setName(name: string, properties: StatusbarItemProperties) {
        this._name = name;
        this._properties = properties;
    }

    connectedCallback() {
        if (this._name === null)
            this._name = this.getAttribute('data-name');
        else
            this.setAttribute('data-name', this._name.toLowerCase());

        this.classList.add('jmv-statusbar-button');
        this.tabIndex = 0;
        this.setAttribute('aria-disabled', 'true');
        if (this._properties && this._properties.label)
            this.setAttribute('aria-label', this._properties.label);

        let action = ActionHub.get(this._name);
        this.setEnabled(action.get('enabled'));
        action.on('change:enabled', (event) => {
            this.setEnabled(event.changed.enabled);
        });

        this.addEventListener('click', event => this._clicked(event));
        this.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.keyCode == 13 || event.keyCode == 32) {
                this._clicked(event);
            }
        });
    }

    setEnabled(enabled: boolean) {
        if (enabled)
            this.removeAttribute('aria-disabled');
        else
            this.setAttribute('aria-disabled', 'true');
    }

    _clicked(event: Event) {
        let action = ActionHub.get(this._name);

        if (action.attributes.enabled) {
            action.do();
            this.dispatchEvent(new CustomEvent('menuActioned'));
        }

        event.stopPropagation();
        event.preventDefault();
    }
};

customElements.define('jmv-statusbar-button', StatusbarButton, { extends: 'button' });

export default StatusbarButton;
