'use strict';

import Tracker from './itemtracker';
import focusLoop from '../common/focusloop';

import b64 from '../common/utils/b64';
import { contextMenuListener } from '../common/utils';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

import './refs';
import { EventMap } from '../common/eventmap';
import { ReferenceNumbers } from './refs';
import { AnalysisStatus, IElement } from './create';
import { ResultsContextMenuItem } from '../common/contextmenutypes';

export interface ElementData {
    level?: number;
    fmt: any;
    parent: View;
    update: (item: View, element: IElement, options, level: number, mode: string, devMode, fmt, refTable) => boolean;
    create?: (element: IElement, options, level: number, parent: View, mode: string, devMode, fmt, refTable ) => View;
    mode: string;
    devMode: boolean;
}

export interface ElementModel<T = any> {
    refs?: string[ ],
    refTable?: any,
    name: string,
    title: string,
    error: { message: string },
    status: AnalysisStatus,
    stale: boolean,
    options: any,
    element: T
}

export class Model<T extends ElementModel> extends EventMap<T> {
    constructor(data: T) {
        super(data);
    }
}

type InferType<T> = T extends Model<infer A> ? A : never;

export abstract class View<M extends Model<T> = any, T extends ElementModel = InferType<M>> extends HTMLElement {
    layout: Tracker = new Tracker();
    model: M;
    $errorPlacement: HTMLElement;
    addIndex: number = 1;
    refs: ReferenceNumbers;
    ready: Promise<void>;
    parent: View;
    level: number;
    updateItem: (item: View, element: IElement, options, level, mode, devMode, fmt, refTable) => boolean;
    fmt: any;
    mode: string;

    constructor(model: M, data: ElementData, interalFocus?: boolean) {
        super();

        this.model = model;

        this.updateItem = data.update;
        this.parent = data.parent;
        this.level = (data.level !== undefined) ? data.level : 0;
        this.fmt = data.fmt;
        this.mode = data.mode;

        this.classList.add('jmv-results-item');
        const errorMsgId = focusLoop.getNextAriaElementId('errormsg');
        this.setAttribute('aria-errormessage', errorMsgId);
        this.setAttribute('data-name', b64.enc(this.model.attributes.name));

        contextMenuListener(this, event => {
            event.stopPropagation();
            this._sendEvent({ type: 'menu', data: { entries: [], pos: { left: event.pageX, top: event.pageY } } });
            event.preventDefault();
            return false;
        });

        this.$errorPlacement = HTML.parse(`<div id="${errorMsgId}" class="jmv-results-error-placement"></div>`);
        this.append(this.$errorPlacement);

        this.refs = new ReferenceNumbers();
        this.refs.setTable(this.model.attributes.refTable);
        this.refs.setRefs(this.model.attributes.refs);
        this.appendChild(this.refs);

        if ( ! interalFocus)
            this.setFocusElement(this);

        this.ready = Promise.resolve();
    }

    setFocusElement(element: HTMLElement) {
        element.classList.add('selectedable-result-item')
        element.setAttribute('tabindex', '0');
        element.addEventListener('keydown', (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.code === 'KeyC') {
                if (document.activeElement === element) {
                    this.copyContentToClipboard()
                    event.stopPropagation();
                }
            }
        });
    }

    render() {
        let error = this.model.get('error');
        if (error !== null) {
            if (this.classList.contains('jmv-results-error'))
                this.$errorPlacement.querySelector('.jmv-results-error-message').textContent = error.message;
            else {
                this.classList.add('jmv-results-error');
                this.$errorPlacement.append(HTML.parse(`<div class="error-box"><div class="icon"></div><div class="jmv-results-error-message">${ error.message }</div></div>`));
            }
            this.setAttribute('aria-invalid', 'true');
        }
        else {
            this.classList.remove('jmv-results-error');
            this.$errorPlacement.innerHTML = '';
            this.removeAttribute('aria-invalid');
        }
    }

    _collapseSection() {
        let sectionHeight = this.scrollHeight;

        let elementTransition = this.style.transition;
        this.style.transition = '';

        requestAnimationFrame(() => {
            this.style.height = sectionHeight + 'px';
            this.style.transition = elementTransition;
            requestAnimationFrame(() => {
                this.style.height = 0 + 'px';
            });
        });
    }

    _expandSection(value) {

        this.setAttribute('data-expanding', 'true');
        let sectionHeight = this.scrollHeight;

        this.style.height = value === undefined ? sectionHeight : value;

        this.addEventListener('transitionend', (e) => {
            this.removeEventListener('transitionend', e.callee);
            this.style.height = null;
            this.setAttribute('data-expanding', 'false');
        });
    }

    abstract label(): string;
    abstract type(): string;

    update(data) {

        if (this.updateItem(this, data.element, data.options, data.level, data.mode, data.devMode, data.fmt, data.refTable)) {
            this.layout.begin();
            this.render();
            this.layout.end();
            return true;
        }
        return false;
    }

    addContent($el: HTMLElement) {
        let before = this.children[this.addIndex - 1];
        before.after($el);
        this.addIndex += 1;
    }

    copyContentToClipboard() {
        this._sendEvent({ type: 'copy', data: { address: this.address(), type: this.type(),
            label: this.label(),
            name: this.type().toLowerCase() } });
    }

    _sendEvent(event) {
        if (this.parent === null)
            return;

        if (event.type === 'copy')
            this.parent._sendEvent(event);
        else if (event.type === 'menu') {
            let options = this._menuOptions();
            let entry = {
                type: this.type(),
                label: this.label(),
                name: this.type().toLowerCase(),
                address: this.address(),
                title: this.model.attributes.title,
                options: options,
            };
            event.data.entries.unshift(entry);
            this.parent._sendEvent(event);
        }
    }

    _menuOptions() : ResultsContextMenuItem[] {
        const split: { name:string, label: string }[] = [];
        if (this.type() !== 'Image')
            split.push({ name: 'copyLatex', label: _('Copy Latex') });

        return [ { name: 'copy', label: _('Copy'), splitType: 'options', split }, { name: 'export', label: `${_('Export')}...` }, { name: 'addNote', label: _('Add Note')} ];
    }

    address() {
        let addr;
        if (this.parent && this.parent.address) {
            addr = this.parent.address();
            addr.push(this.model.attributes.name);
        }
        else {
            addr = [ ];
        }
        return addr;
    }

    isRoot() {
        return ! (this.parent && this.parent.address);
    }
}

export abstract class CollectionView<M extends Model<T> = any, T extends ElementModel = InferType<M>> extends View<M, T> {
    constructor(model: M, data: ElementData, interalFocus?: boolean) {
        super(model, data, interalFocus);
    }

    abstract get(address: string[]) : View;
}

export default { View, Model };
