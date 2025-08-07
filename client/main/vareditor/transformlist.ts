
'use strict';

import TransformListItem from './transformlistitem';
import focusLoop from '../../common/focusloop';
import { HTMLElementCreator as HTML } from '../../common/htmlelementcreator';
import { Transform } from '../dataset';
import { DropdownContent } from './dropdown';


export default class TransformList extends HTMLElement implements DropdownContent {
    id: string;
    top: HTMLElement;
    none: HTMLButtonElement;
    middle: HTMLElement;
    bottom: HTMLElement;
    createNew: HTMLButtonElement;

    constructor() {
        super();
        this.id = focusLoop.getNextAriaElementId('list');
        this.classList.add("jmv-transform-list");
        this.setAttribute('role', 'list');

        this.top = HTML.parse(`<div class="top"></div>`);
        this.appendChild(this.top);

        this.none = HTML.parse<HTMLButtonElement>(`<button role="listitem" class="transform-none-item">${_('None')}</button>`);
        this.top.appendChild(this.none);

        this.middle = HTML.parse(`<div role="presentation" class="middle"></div>`);
        this.appendChild(this.middle);

        this.bottom = HTML.parse(`<div role="presentation" class="bottom"></div>`);
        this.appendChild(this.bottom);

        this.createNew = HTML.parse<HTMLButtonElement>(`<button role="listitem" class="transform-create">${_('Create New Transform...')}</button>`);
        this.bottom.appendChild(this.createNew);

        this._attachEventHandlers();
    }

    private _attachEventHandlers(): void {
        this.createNew.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('create-transform', { bubbles: true }));
        });

        this.none.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('selected-transform', {
                detail: { name: 'None', id: 0 },
                bubbles: true
            }));
        });
    }

    public isScrollTarget(target: EventTarget | null): boolean {
        return target === this.middle;
    }

    public populate(transforms: Transform[]): void {
        this.middle.innerHTML = ''; // Clear content

        for (const transform of transforms) {
            const item = new TransformListItem(transform, false);
            this.middle.appendChild(item);
            this._createItemEvents(item);
        }
    }

    private _createItemEvents(item: TransformListItem): void {
        item.addEventListener('selected', () => {
            this.dispatchEvent(new CustomEvent('selected-transform', {
                detail: item.transform,
                bubbles: true
            }));
        });

        item.addEventListener('editing', () => {
            this.dispatchEvent(new CustomEvent('edit-transform', {
                detail: item.transform,
                bubbles: true
            }));
        });

        item.addEventListener('duplicate', () => {
            this.dispatchEvent(new CustomEvent('duplicate-transform', {
                detail: item.transform,
                bubbles: true
            }));
        });

        item.addEventListener('remove', () => {
            this.dispatchEvent(new CustomEvent('remove-transform', {
                detail: item.transform,
                bubbles: true
            }));
        });
    }
}

customElements.define('jmv-transform-list', TransformList);
