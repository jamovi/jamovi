
'use strict';


import MissingValueListItem from './missingvaluelistitem';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

class MissingValueList extends HTMLElement {

    $list: HTMLElement;
    items: MissingValueListItem[];

    constructor() {
        super();

        this.classList.add('jmv-missing-value-list');

        this.$list = HTML.parse('<div class="list"></div>');
        this.append(this.$list);

        let $bottom = HTML.parse('<div class="bottom"></div>');
        this.append($bottom);
        let $createNew = HTML.parse(`<div class="add-missing-value" tabindex="0"><div class="insert"></div><div>${_('Add Missing Value')}</div></div>`);
        $bottom.append($createNew);

        $createNew.addEventListener('click', (event) => {
            this.createNew();
        });

        $createNew.addEventListener('keydown', (event) => {
            if ( event.keyCode === 13) {   //enter
                this.createNew();
                event.preventDefault();
                event.stopPropagation();
            }
        });

        this.items = [];
    }

    populate(values) {
        if (values !== null && values.length === this.items.length) {
            for (let i = 0; i < this.items.length; i++) {
                let item = this.items[i];
                item.setValue(values[i]);
            }
        }
        else {
            this.$list.innerHTML = '';
            this.items = [];
            if (values !== null) {
                for (let value of values) {
                    let item = new MissingValueListItem(value);
                    this.items.push(item);
                    this.$list.append(item);
                    this._createItemEvents(item);
                }
            }
        }
    }

    createNew() {
        let item = new MissingValueListItem('');
        this.items.push(item);
        item.classList.add('hidden');
        this.$list.append(item);
        this._createItemEvents(item);
        this.dispatchEvent(new CustomEvent('add-missing-value'));
        setTimeout(() => {
            this.$list.scrollTo({
                top: this.$list.scrollHeight,
                behavior: 'smooth'
            });
            item.classList.remove('hidden');
            item.querySelector<HTMLElement>('.formula').focus();
        },0);
    }

    isScrollTarget(target: EventTarget | null) {
        return target === this.$list;
    }

    isConditionValid(text: string) {

        let trimText = text.trim();
        let validOps = ['==', '!=', '<=', '>=', '<', '>', '='];

        for (let i = 0; i < validOps.length; i++) {
            let op = validOps[i];
            if (trimText.startsWith(op)) {
                if (trimText.length > op.length)
                    return true;
                else
                    return false;
            }
        }

        return false;
    }

    getValue() {
        let value = [];
        let j = 0;
        for (let i = 0; i < this.items.length; i++) {
            let condition = this.items[i].value;
            if (this.isConditionValid(condition))
                value[j++] = condition;
        }
        return value;
    }

    _createItemEvents(item: MissingValueListItem) {
        item.addEventListener('removed', (x) => {
            let indexRemoved = -1;
            this.items = this.items.filter((i, j) => {
                if (i === item)
                    indexRemoved = j;
                return i !== item;
            });
            let $fp = item;
            ["webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend"].forEach(eventName => {
                $fp.addEventListener('eventName', (event) => {
                    $fp.remove();
                }, { once: true });
            });
            $fp.classList.add('remove');
            this._collapseSection($fp);
            this.dispatchEvent(new CustomEvent('missing-value-removed', { detail: indexRemoved }));
        });
        item.addEventListener('value-changed', (x) => {
            this.dispatchEvent(new CustomEvent('missing-values-changed'));
        });
    }

    _collapseSection(element: HTMLElement) {
        let sectionHeight = element.scrollHeight;

        let elementTransition = element.style.transition;
        element.style.transition = '';

        requestAnimationFrame(() => {
            element.style.height = sectionHeight + 'px';
            element.style.transition = elementTransition;
            requestAnimationFrame(() => {
                element.style.height = 0 + 'px';
            });
        });
    }

    _expandSection(element: HTMLElement, value: string) {

        element.setAttribute('data-expanding', 'true');
        let sectionHeight = element.scrollHeight;

        element.style.height = value === undefined ? `${sectionHeight}px` : value;

        element.addEventListener('transitionend', (e) => {
            element.removeEventListener('transitionend', e.callee);
            element.style.height = null;
            element.setAttribute('data-expanding', 'false');
        });
    }
}

customElements.define('jmv-missing-value-list', MissingValueList);

export default MissingValueList;
