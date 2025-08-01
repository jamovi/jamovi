'use strict';

import $ from 'jquery';
import { Descriptions } from '../vareditor/formulatoolbar';
import { DropdownContent } from '../vareditor/dropdown';

function insertText(el, newText) {
    let sel = window.getSelection();
    let range = sel.getRangeAt(0);
    let start = range.startOffset;
    let end = range.endOffset;
    let text = el.innerText;
    let before = text.substring(0, start);
    let after  = text.substring(end);

    el.textContent = before + newText + after;
    sel.setBaseAndExtent(el.firstChild, start + newText.length, el.firstChild, start + newText.length);

    el.focus();
}

function allFunctions(functionsContent): Descriptions {
    let descriptions = {};

    const createItem = (name, value, labelText) => {
        const div = document.createElement('div');
        div.className = 'item';
        div.dataset.name = name;
        div.dataset.value = value;
        div.innerHTML = value;
        functionsContent.appendChild(div);
        descriptions[name] = { label: labelText, content: '' };
    };

    createItem('equal', '==', _('Equal to'));
    createItem('notequal', '!=', _('Not equal to'));
    createItem('gt', '>', _('Greater than'));
    createItem('lt', '<', _('Less than'));
    createItem('gte', '>=', _('Greater than or equal to'));
    createItem('lte', '<=', _('Less than or equal to'));

    functionsContent.firstChild.classList.add('item-activated'); // Activate first item by default

    return descriptions;
}

class Dropdown extends HTMLElement implements DropdownContent {
    private ops: HTMLDivElement;
    private label: HTMLDivElement;
    private description: HTMLDivElement;
    private functions: HTMLDivElement;
    private functionsTitle: HTMLDivElement;
    private functionsContent: HTMLDivElement;
    private descriptions: Descriptions;
    private $formula: $<HTMLElement> | null = null;
    private formula: HTMLElement | null = null;

    constructor() {
        super();
        this.className = 'jmv-operator-dropdown-options';

        this.ops = document.createElement('div');
        this.ops.className = 'ops-box';
        this.appendChild(this.ops);

        this.label = document.createElement('div');
        this.label.className = 'option-label';
        this.label.textContent = 'This is a label!';
        this.appendChild(this.label);

        this.description = document.createElement('div');
        this.description.className = 'option-description';
        this.description.textContent = 'This is the place where the option description will go!';
        this.appendChild(this.description);

        this.functions = document.createElement('div');
        this.functions.className = 'op';
        this.ops.appendChild(this.functions);

        this.functionsTitle = document.createElement('div');
        this.functionsTitle.className = 'title';
        this.functionsTitle.textContent = _('Operators');
        this.functions.appendChild(this.functionsTitle);

        this.functionsContent = document.createElement('div');
        this.functionsContent.className = 'content';
        this.functions.appendChild(this.functionsContent);

        this.descriptions = allFunctions(this.functionsContent);

        const defaultInfo = this.descriptions.equal;
        if (defaultInfo) {
            this.label.textContent = defaultInfo.label;
            this.description.textContent = defaultInfo.content;
        }

        this.functionsContent.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('item') && this.formula) {
                this.formula.focus();
                insertText(this.formula, target.dataset.value || '');
                const inputEvent = new Event('input', { bubbles: true });
                this.formula.dispatchEvent(inputEvent);
            }
        });

        this.functionsContent.addEventListener('mouseenter', (event) => {
            const target = event.target as HTMLElement;
            if (target.classList.contains('item')) {
                const items = this.functionsContent.querySelectorAll('.item');
                items.forEach(item => item.classList.remove('item-activated'));
                target.classList.add('item-activated');

                const info = this.descriptions[target.dataset.name || ''];
                if (info) {
                    this.label.textContent = info.label;
                    this.description.textContent = info.content;
                } else {
                    this.label.textContent = '';
                    this.description.textContent = _('No information about this function is available');
                }
            } else {
                this.label.textContent = '';
                this.description.textContent = '';
            }
        }, true);
    }

    public isScrollTarget(target: HTMLElement): boolean {
        return target === this.functionsContent;
    }

    public show(formula: $<HTMLElement>): void {
        this.$formula = formula;
        this.formula = formula[0];
    }

    public focusedOn(): $<HTMLElement> | null {
        return this.$formula;
    }
}

customElements.define('jmv-operatorselector', Dropdown);

export default Dropdown;