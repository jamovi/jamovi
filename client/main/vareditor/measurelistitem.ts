'use strict';

import focusLoop from '../../common/focusloop';
import { MeasureType } from '../dataset';

class MeasureListItem extends HTMLElement {
    measureType: MeasureType;
    name: string;
    id: string;
    $icon: HTMLElement;
    $label: HTMLElement;

    constructor(measureType: MeasureType, text?: string) {
        super();
        this.measureType = measureType;
        this.name = text ? text : measureType;

        this.id = focusLoop.getNextAriaElementId('listitem');
        const labelId = focusLoop.getNextAriaElementId('label');

        this.id = this.id;
        this.classList.add('jmv-measure-list-item');
        this.setAttribute('aria-labelledby', labelId);
        this.setAttribute('role', 'listitem');
        this.setAttribute('data-id', measureType);

        this.$icon = document.createElement('div');
        this.$icon.className = `icon measure-type-${this.measureType}`;
        this.appendChild(this.$icon);

        this.$label = document.createElement('div');
        this.$label.id = labelId;
        this.$label.className = 'label';
        this.$label.textContent = this.name;
        this.appendChild(this.$label);

        this.addEventListener('click', () => {
            const event = new CustomEvent('selected', { detail: this });
            this.dispatchEvent(event);
        });
    }
}

customElements.define('jmv-measurelistitem', MeasureListItem);

export default MeasureListItem;
