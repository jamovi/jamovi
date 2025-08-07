'use strict';

import focusLoop from '../../common/focusloop';
import { HTMLElementCreator as HTML } from '../../common/htmlelementcreator';
import { Transform } from '../dataset';


export default class TransformListItem extends HTMLElement {
    transform: Transform;
    name: string;
    checked: boolean;
    icon: HTMLElement;
    colour: HTMLElement;
    id: string;
    labelBtn: HTMLButtonElement;
    editBtn: HTMLButtonElement;
    duplicateBtn: HTMLButtonElement;
    removeBtn: HTMLButtonElement;

    constructor(transform: Transform, checked: boolean) {
        super();
        this.transform = transform;
        this.name = transform.name;
        this.checked = checked;

        this.setAttribute('role', 'presentation');
        this.classList.add("jmv-transform-list-item");
        this.icon = HTML.parse('<div class="icon"></div>');
        this.appendChild(this.icon);

        this.colour = HTML.parse(`<div class="colour" style="background-color: ${this._calculateColour(transform.colourIndex)}"></div>`);
        this.appendChild(this.colour);

        this.labelBtn = HTML.parse<HTMLButtonElement>(`<button role="listitem" id="${this.id}" class="label">${this.name}</button>`);
        this.labelBtn.id = focusLoop.getNextAriaElementId('listitem');
        this.appendChild(this.labelBtn);

        this.editBtn = HTML.parse<HTMLButtonElement>(`<button class="edit hidden" aria-label="${_('Edit transform - {transformName}', { transformName: this.name })}"></button>`);
        this.appendChild(this.editBtn);

        this.duplicateBtn = HTML.parse<HTMLButtonElement>(`<button class="duplicate hidden" aria-label="${_('Duplicate transform  - {transformName}', { transformName: this.name })}"></button>`);
        this.appendChild(this.duplicateBtn);

        this.removeBtn = HTML.parse<HTMLButtonElement>(`<button class="remove hidden" aria-label="${_('Delete transform  - {transformName}', { transformName: this.name })}"><span class="mif-cross"></span></button>`);
        this.appendChild(this.removeBtn);

        this._setupEventListeners();
    }

    private _calculateColour(colourIndex: number): string {
        const base = colourIndex % 12;
        const g = base % 6;
        const p = [0, 4, 2, 5, 1, 3];
        if (base < 6)
            return `hsl(${p[g] * 60}, 48%, 57%)`;
        return `hsl(${30 + (p[g] * 60)}, 17%, 52%)`;
    }

    private _setupEventListeners(): void {
        const showButtons = () => {
            this.editBtn.classList.remove('hidden');
            this.duplicateBtn.classList.remove('hidden');
            this.removeBtn.classList.remove('hidden');
        };

        const hideButtons = () => {
            this.editBtn.classList.add('hidden');
            this.duplicateBtn.classList.add('hidden');
            this.removeBtn.classList.add('hidden');
        };

        const emit = (type: string) => {
            this.dispatchEvent(new CustomEvent(type, { detail: this, bubbles: true }));
        };

        this.addEventListener('focusin', showButtons);
        this.addEventListener('pointerenter', showButtons);

        this.addEventListener('focusout', (event: FocusEvent) => {
            if (!this.contains(event.relatedTarget as Node))
                hideButtons();
        });

        this.addEventListener('pointerleave', hideButtons);

        this.editBtn.addEventListener('click', (event) => {
            emit('editing');
            event.preventDefault();
            event.stopPropagation();
        });

        this.duplicateBtn.addEventListener('click', (event) => {
            emit('duplicate');
            event.preventDefault();
            event.stopPropagation();
        });

        this.removeBtn.addEventListener('click', (event) => {
            emit('remove');
            event.preventDefault();
            event.stopPropagation();
        });

        this.labelBtn.addEventListener('click', () => {
            emit('selected');
        });
    }
}

customElements.define('jmv-transformlistitem', TransformListItem);