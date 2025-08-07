'use strict';

import MeasureListItem from './measurelistitem';
import focusLoop from '../../common/focusloop';
import { MeasureType } from '../dataset';
import { DropdownContent } from './dropdown';

type ParentElement = HTMLSelectElement | HTMLInputElement | HTMLElement & { value: string };

export default class MeasureList extends HTMLElement implements DropdownContent {
    private $middle: HTMLDivElement;
    private $parent?: ParentElement;
    private includeAuto: boolean;

    constructor(includeAuto: boolean = true) {
        super();
        this.includeAuto = includeAuto;
        this.id = focusLoop.getNextAriaElementId('list');

        this.classList.add('jmv-measure-list');
        this.setAttribute('role', 'list');

        this.$middle = document.createElement('div');
        this.$middle.className = 'middle';
        this.$middle.setAttribute('role', 'presentation');
        this.appendChild(this.$middle);

        this.populate();
    }

    public isScrollTarget(target: EventTarget | null): boolean {
        return target === this.$middle;
    }

    public setParent(element: ParentElement): void {
        if (this.$parent) {
            this.$parent.removeEventListener('change', this._valueChanged);
        }

        this.$parent = element;
        this._valueChanged();

        this.$parent.addEventListener('change', this._valueChanged);
    }

    private _valueChanged = (): void => {
        const highlighted = this.querySelector('.jmv-measure-list-item.highlighted') as HTMLElement | null;
        if (highlighted)
            highlighted.classList.remove('highlighted');

        if (!this.$parent)
            return;

        const val = this.$parent.value;
        const item = this.querySelector(`.jmv-measure-list-item[data-id="${val}"]`) as HTMLElement | null;
        if (item) {
            item.classList.add('highlighted');
            item.scrollIntoView(false);
            this.$parent.setAttribute('aria-activedescendant', item.id);
        }
    };

    private populate(): void {
        this.$middle.innerHTML = '';

        const items: MeasureListItem[] = [];

        if (this.includeAuto) {
            items.push(new MeasureListItem(MeasureType.NONE, _('Auto')));
        }

        items.push(new MeasureListItem(MeasureType.NOMINAL, _('Nominal')));
        items.push(new MeasureListItem(MeasureType.ORDINAL, _('Ordinal')));
        items.push(new MeasureListItem(MeasureType.CONTINUOUS, _('Continuous')));
        items.push(new MeasureListItem(MeasureType.ID, _('ID')));

        for (const item of items) {
            this.$middle.appendChild(item);
            this._createItemEvents(item);
        }
    }

    private _createItemEvents(item: MeasureListItem): void {
        item.addEventListener('selected', () => {
            const event = new CustomEvent('selected-measure-type', {
                detail: item.measureType,
            });
            this.dispatchEvent(event);
        });
    }
}

customElements.define('jmv-measuretype-list', MeasureList);
