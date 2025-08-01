'use strict';

import $ from 'jquery';
import focusLoop from '../../common/focusloop';

export interface DropdownContent extends HTMLElement {
    isScrollTarget: (target: EventTarget | null) => boolean;
}

interface ShowOptions {
    data: {
        dropdown: Dropdown;
        check: boolean;
    };
}

class Dropdown extends HTMLElement {
    private _inTools: boolean = false;
    private _shown: boolean = false;
    private _waiting: boolean = false;
    private _resolve: (() => void) | null = null;
    private _promise: Promise<void> | null = null;
    private $$formulaWrapper: $<HTMLElement> | null = null;
    private $formula: HTMLElement | null = null;
    private $content: DropdownContent | null = null;
    private $contents: HTMLDivElement;
    private _boundHide: (() => void) | null = null;

    constructor() {
        super();

        this.classList.add('jmv-dropdown-widget', 'dropdown-hidden', 'dropdown-remove');
        this.tabIndex = -1;

        this.$contents = document.createElement('div');
        this.$contents.className = 'jmv-dropdown-contents';
        this.append(this.$contents);

        focusLoop.addFocusLoop(this, {
            level: 1,
            hoverFocus: false,
            closeHandler: () => this.hide({ data: { dropdown: this, check: false } }),
            exitKeys: ['Escape']
        });

        window.addEventListener('resize', () => this._findPosition());
        window.addEventListener('scroll', this._onScroll, true);
        document.addEventListener('mousedown', this._onDocumentMouseDown);
        this.addEventListener('focusout', this._onFocusOut);
    }

    private _onScroll = (event: Event) => {
        if (this._shown && !this._waiting && this.$content?.isScrollTarget(event.target) === false) {
            this.hide({ data: { dropdown: this, check: false } });
        }
    };

    private _onDocumentMouseDown = (event: MouseEvent) => {
        const inTool = this._elementContainsPoint(this, event);
        const inFormula = this.$formula ? this._elementContainsPoint(this.$formula, event) : false;

        this._inTools = inTool;

        if (!inTool && !inFormula) {
            this.hide({ data: { dropdown: this, check: false } });
        }
    };

    private _onFocusOut = (event: FocusEvent) => {
        if (!this.contains(event.relatedTarget as Node) && event.relatedTarget !== this.$formula) {
            this.hide({ data: { dropdown: this, check: false } });
        }
    };

    private _elementContainsPoint(element: HTMLElement, event: MouseEvent): boolean {
        const rect = element.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right &&
               event.clientY >= rect.top && event.clientY <= rect.bottom;
    }

    private _findPosition() {
        if (!this.$formula || !this._shown) return;

        this.classList.remove('dropdown-remove');

        setTimeout(() => {
            this.classList.remove('dropdown-hidden');
            this.addEventListener('transitionend', () => {
                this._waiting = false;
            }, { once: true });
        }, 0);

        const rect = this.$formula.getBoundingClientRect();
        const top = rect.top + rect.height + 1 + window.scrollY;
        const left = rect.left + window.scrollX;

        this.style.position = 'absolute';
        this.style.top = `${top}px`;
        this.style.left = `${left}px`;
        this.style.minWidth = `${this.$formula.offsetWidth}px`;
    }

    public show($formula: $<HTMLElement>, content: DropdownContent, wait: boolean = false): Promise<void> {
        const formulaEl = $formula[0];

        if (content !== this.$content) {
            if (this.$content) {
                this.$content.remove();
                this.$content.removeEventListener('hide-dropdown', this._boundHide!);
            }

            if (this._resolve) {
                this._resolve();
                this._resolve = null;
            }

            this.$content = content;
            this._boundHide = () => this.hide({ data: { dropdown: this, check: false } });
            this.$content.addEventListener('hide-dropdown', this._boundHide);
            this.$contents.append(this.$content);
        }

        if (!this._resolve) {
            this._promise = new Promise<void>((resolve) => {
                this._resolve = resolve;
            });
        }

        setTimeout(() => {
            focusLoop.enterFocusLoop(this, { withMouse: false, exitSelector: formulaEl });
        }, 200);

        if (this._shown && formulaEl === this.$formula) {
            return this._promise!;
        }

        this._shown = true;
        this._waiting = wait;

        if (this.$formula) {
            this.$formula.setAttribute('aria-expanded', 'false');
            this.$formula.removeEventListener('focusout', this._onFocusOut);
        }

        this.$$formulaWrapper = $formula;
        this.$formula = formulaEl;

        if (this.$formula) {
            this.$formula.setAttribute('aria-expanded', 'true');
            this.$formula.addEventListener('focusout', this._onFocusOut);
        }

        if (!wait) {
            this._findPosition();
        }

        return this._promise!;
    }

    public hide(event: ShowOptions) {
        const { dropdown: self, check } = event.data;

        if ((!check || !self._inTools) && self._shown) {
            self.classList.add('dropdown-hidden', 'dropdown-remove');
            self.$content?.removeEventListener('hide-dropdown', this._boundHide!);
            self.$formula?.dispatchEvent(new CustomEvent('editor:closing'));
            self.$formula?.setAttribute('aria-expanded', 'false');

            self.$formula = null;
            self._shown = false;
            self._waiting = false;

            if (this._resolve) {
                this._resolve();
                this._resolve = null;
            }
        }

        self._inTools = false;
    }

    get formula() {
        return this.$$formulaWrapper;
    }

    get inTools() {
        return this._inTools;
    }

    get isVisible() {
        return this._shown;
    }

    get content() {
        return this.$content;
    }

    public enter() {
        focusLoop.enterFocusLoop(this, { withMouse: false, exitSelector: this.$formula! });
    }

    public hasFocus(relatedTarget: Element | null = document.activeElement): boolean {
        return !!relatedTarget && (this.contains(relatedTarget) || this === relatedTarget);
    }
}

customElements.define('jmv-dropdown', Dropdown);

const dropdownInstance = new Dropdown();

document.body.append(dropdownInstance);

export default {
    init: () => {},
    show: (formula: $<HTMLElement>, content: DropdownContent, wait = false) => dropdownInstance.show(formula, content, wait),
    hide: () => dropdownInstance.hide({ data: { dropdown: dropdownInstance, check: false } }),
    updatePosition: () => dropdownInstance['_findPosition'](),
    focusedOn: () => dropdownInstance.formula,
    clicked: () => dropdownInstance.inTools,
    isVisible: () => dropdownInstance.isVisible,
    content: () => dropdownInstance.content,
    enter: () => dropdownInstance.enter(),
    hasFocus: (relatedTarget?: Element | null) => dropdownInstance.hasFocus(relatedTarget ?? null)
};
