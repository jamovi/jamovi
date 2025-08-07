'use strict';

import VariableListItem from './variablelistitem';
import focusLoop from '../../common/focusloop';
import { Column } from '../dataset';
import { DropdownContent } from './dropdown';

class VariableList extends HTMLElement implements DropdownContent {
    private $none: HTMLDivElement;
    private $middle: HTMLDivElement;
    private $parent: HTMLInputElement | HTMLSelectElement | null = null;
    public items: VariableListItem[] = [];

    constructor() {
        super();
        this.id = focusLoop.getNextAriaElementId('list');

        // Create main container

        this.classList.add('jmv-variable-list');
        this.setAttribute('role', 'list');

        // 'None' item
        this.$none = document.createElement('div');
        this.$none.className = 'jmv-variable-list-item none-item';
        this.$none.dataset.id = "0";
        this.$none.setAttribute('role', 'listitem');
        this.$none.textContent = _('None');
        this.appendChild(this.$none);

        // Middle container
        this.$middle = document.createElement('div');
        this.$middle.className = 'middle';
        this.$middle.setAttribute('role', 'presentation');
        this.appendChild(this.$middle);

        // Event for 'None' item
        this.$none.addEventListener('click', () => {
            const customEvent = new CustomEvent('selected-variable', {
                detail: { name: _('None'), id: 0 },
                bubbles: true
            });
            this.dispatchEvent(customEvent);
        });

        this._valueChanged = this._valueChanged.bind(this);
    }

    public isScrollTarget(target: EventTarget | null): boolean {
        return target === this.$middle;
    }

    public setParent(element: HTMLInputElement | HTMLSelectElement): void {
        if (this.$parent)
            this.$parent.removeEventListener('change', this._valueChanged);

        this.$parent = element;

        this._valueChanged();

        this.$parent.addEventListener('change', this._valueChanged);
    }

    private _valueChanged(): void {
        // Remove highlights
        const highlightedItems = this.querySelectorAll('.jmv-variable-list-item.highlighted');
        highlightedItems.forEach(el => el.classList.remove('highlighted'));

        if (!this.$parent) return;

        const val = this.$parent.value;
        const selectedItem = this.querySelector<HTMLElement>(`.jmv-variable-list-item[data-id="${val}"]`);
        if (selectedItem) {
            selectedItem.classList.add('highlighted');
            selectedItem.scrollIntoView(false);
            this.$parent.setAttribute('aria-activedescendant', selectedItem.id || '');
        }
    }

    public populate(columns: Column[], excludeNone?: boolean): void {
        if (excludeNone)
            this.$none.classList.add('hidden');
        else
            this.$none.classList.remove('hidden');

        this.items = [];
        this.$middle.innerHTML = '';

        for (const column of columns) {
            const item = new VariableListItem(column);
            this.items.push(item);
            this.$middle.appendChild(item);

            item.setAttribute('data-id', column.id.toString());
            this._createItemEvents(item);
        }

        if (this.$parent) {
            const highlighted = this.querySelector<HTMLElement>(`.jmv-variable-list-item[data-id="${this.$parent.value}"]`);
            if (highlighted) {
                highlighted.classList.add('highlighted');
            }
        }
    }

    private _createItemEvents(item: VariableListItem): void {
        item.addEventListener('selected', () => {
            const customEvent = new CustomEvent('selected-variable', {
                detail: item.variable,
                bubbles: true
            });
            this.dispatchEvent(customEvent);
        });
    }
}

customElements.define('jmv-variable-list', VariableList);

export default VariableList;