'use strict';

import Tracker from './itemtracker';
import interactionManager from '../common/interactionmanager';

import b64 from '../common/utils/b64';
import { contextMenuListener } from '../common/utils';
import { h }  from '../common/htmlelementcreator';

import './refs';
import { EventMap } from '../common/eventmap';
import { ReferenceNumbers } from './refs';
import { AnalysisStatus } from './analysisstatus';
import type { IElement } from './create';
import { ResultsContextMenuItem } from '../common/contextmenutypes';
import { CHANGED_CLASS, ElementAddon, ElementAddonChange, addonKey, updateAddonMark } from './addonmark';

export interface ElementData {
    level?: number;
    fmt: any;
    parent: View;
    update: (item: View, element: IElement, options, level: number, mode: string, devMode, fmt, refTable) => boolean;
    create?: (element: IElement, options, level: number, parent: View, mode: string, devMode, fmt, refTable ) => View;
    mode: string;
    devMode: boolean;
    addon?: ElementAddon;
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
    // the addons which changed this element, see setAddon()
    modifiedBy?: ElementAddonChange[],
    element: T
}

export class Model<T extends ElementModel> extends EventMap<T> {
    constructor(data: T) {
        super(data);
    }
}

type InferType<T> = T extends Model<infer A> ? A : never;

// holds #results at a minimum height while errors slide open or closed;
// overlapping holds keep the largest height until the last is released
const resultsHeightHolds = new Map<HTMLElement, number[]>();

function holdResultsHeight(results: HTMLElement, height: number) {
    let holds = resultsHeightHolds.get(results);
    if (holds === undefined) {
        holds = [];
        resultsHeightHolds.set(results, holds);
    }
    holds.push(height);
    results.style.minHeight = `${ Math.max(...holds) }px`;

    let released = false;
    return () => {
        if (released)
            return;
        released = true;
        holds.splice(holds.indexOf(height), 1);
        if (holds.length === 0) {
            resultsHeightHolds.delete(results);
            results.style.minHeight = '';
        }
        else
            results.style.minHeight = `${ Math.max(...holds) }px`;
    };
}

export abstract class View<M extends Model<T> = any, T extends ElementModel = InferType<M>> extends HTMLElement {
    layout: Tracker = new Tracker();
    model: M;
    $errorPlacement: HTMLElement;
    _errorSlideEnd: (() => void) | null = null;
    addIndex: number = 1;
    refs: ReferenceNumbers;
    ready: Promise<void>;
    parent: View;
    level: number;
    updateItem: (item: View, element: IElement, options, level, mode, devMode, fmt, refTable) => boolean;
    fmt: any;
    mode: string;
    // the addon this element is from, as ns::name, or '' for its analysis'.
    // it's known before the element's children are made, so a child from
    // the same addon doesn't repeat its mark
    addonKey: string = '';
    $addonMark: HTMLButtonElement | null = null;

    constructor(model: M, data: ElementData, interalFocus?: boolean) {
        super();

        this.model = model;

        this.updateItem = data.update;
        this.parent = data.parent;
        this.level = (data.level !== undefined) ? data.level : 0;
        this.fmt = data.fmt;
        this.mode = data.mode;
        this.addonKey = addonKey(data.addon);

        this.classList.add('jmv-results-item');
        const errorMsgId = interactionManager.nextAriaId('errormsg');
        this.setAttribute('aria-errormessage', errorMsgId);
        this.setAttribute('data-name', b64.enc(this.model.attributes.name));

        contextMenuListener(this, event => {
            event.stopPropagation();
            this._sendEvent({ type: 'menu', data: { entries: [], pos: { left: event.pageX, top: event.pageY } } });
            event.preventDefault();
            return false;
        });

        this.$errorPlacement = h('div', { id: errorMsgId, class: 'jmv-results-error-placement' });
        this.append(this.$errorPlacement);

        this.refs = new ReferenceNumbers();
        this.refs.setTable(this.model.attributes.refTable);
        this.refs.setRefs(this.model.attributes.refs);
        this.appendChild(this.refs);

        if ( ! interalFocus)
            this.setFocusElement(this);

        this.ready = Promise.resolve();
    }

    setAddon(addon: ElementAddon, changes?: ElementAddonChange[]) {
        this.addonKey = addonKey(addon);
        const parentKey = (this.parent as any)?.addonKey ?? '';
        const had = this.$addonMark;
        this.$addonMark = updateAddonMark(this.$addonMark, addon, changes, parentKey);
        if (this.$addonMark !== null && had === null)
            this.connectAddonMark(this.$addonMark);
        else if (this.$addonMark === null && had !== null)
            this.setAddonHighlight(false);
        this.placeAddonMark();
    }

    // the mark highlights what the addon added or changed while it's hovered,
    // or focused from the keyboard, and while it's pressed (it's a toggle, so
    // the highlight can be kept, from the keyboard too). a click leaves the
    // mark focused, but that focus isn't from the keyboard, so it doesn't
    // keep the highlight once the pointer leaves
    connectAddonMark(mark: HTMLButtonElement) {
        const pressed = () => mark.getAttribute('aria-pressed') === 'true';
        const keyboardFocused = () => mark.matches(':focus-visible');
        const update = () => this.setAddonHighlight(pressed() || mark.matches(':hover') || keyboardFocused());
        mark.addEventListener('mouseenter', () => this.setAddonHighlight(true));
        mark.addEventListener('mouseleave', () => update());
        mark.addEventListener('focus', () => update());
        mark.addEventListener('blur', () => update());
        mark.addEventListener('click', (event) => {
            // (not a click on the results, which selects the analysis)
            event.stopPropagation();
            mark.setAttribute('aria-pressed', pressed() ? 'false' : 'true');
            update();
        });
    }

    // highlights the parts of this element an addon changed (those with
    // CHANGED_CLASS), or, if none are marked (it's an element an addon added,
    // or one whose changes aren't to parts), the whole element
    setAddonHighlight(on: boolean) {
        const parts = this.querySelector(`.${ CHANGED_CLASS }`) !== null;
        this.classList.toggle('jmv-results-addon-highlight', on);
        this.classList.toggle('jmv-results-addon-highlight-whole', on && ! parts);
    }

    // the title the addon mark is part of, or null for an element with none
    addonMarkHost(): HTMLElement | null {
        return null;
    }

    // places the addon mark at the end of the title. the title is remade
    // when the element renders, so this is called after each update too. an
    // element with no title (or an empty one) has the mark at its top end
    placeAddonMark() {
        const mark = this.$addonMark;
        if (mark === null)
            return;
        const host = this.addonMarkHost();
        const hasTitle = host !== null
            && host.style.display !== 'none'
            && (host.textContent ?? '').trim() !== '';
        mark.classList.toggle('in-corner', ! hasTitle);
        this.classList.toggle('jmv-results-addon-cornered', ! hasTitle);
        if (hasTitle)
            this.insertAddonMark(host!, mark);
        else if (mark.parentElement !== this)
            this.prepend(mark);
    }

    insertAddonMark(host: HTMLElement, mark: HTMLElement) {
        if (mark.parentElement !== host || host.lastChild !== mark)
            host.append(mark);
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
            const message = this.$errorPlacement.querySelector('.jmv-results-error-message');
            if (message)
                message.textContent = error.message;
            else {
                this.$errorPlacement.append(h('div', { class: 'jmv-results-error-slide' },
                    h('div', { class: 'error-box' },
                        h('div', { class: 'icon' }),
                        h('div', { class: 'jmv-results-error-message' }, error.message))));
            }
            this.classList.add('jmv-results-error');
            this.$errorPlacement.classList.remove('pending');
            this.setAttribute('aria-invalid', 'true');
            if ( ! this.$errorPlacement.classList.contains('shown'))
                this._slideError(true);
        }
        else if (this._isInProgress() && this.$errorPlacement.classList.contains('shown')) {
            // the error is cleared at init and only comes back (if at all) once the
            // analysis has run, so hold it in place until then rather than bouncing
            this.$errorPlacement.classList.add('pending');
        }
        else if (this.$errorPlacement.classList.contains('shown')) {
            this.$errorPlacement.classList.remove('pending');
            this.classList.remove('jmv-results-error');
            this.removeAttribute('aria-invalid');
            this._slideError(false);
        }
    }

    // the results frame is resized by the main window with its own height
    // transition, and resizing it on every frame of the slide makes it flicker.
    // so the results are held at their larger height for the duration of the
    // slide, so that the frame is only resized once (before opening, or after
    // closing)
    _slideError(show: boolean) {
        const placement = this.$errorPlacement;
        const results = this.closest<HTMLElement>('#results');

        this._errorSlideEnd?.();
        this._errorSlideEnd = null;

        const finish = () => {
            if ( ! placement.classList.contains('shown'))
                placement.replaceChildren();
        };

        if (results === null || parseFloat(getComputedStyle(placement).transitionDuration) === 0) {
            placement.classList.toggle('shown', show);
            finish();
            return;
        }

        let height: number;
        if (show) {
            // measure the opened height with the transition off
            placement.style.transition = 'none';
            placement.classList.add('shown');
            height = results.getBoundingClientRect().height;
            placement.classList.remove('shown');
            placement.offsetHeight; // force layout so the slide starts from closed
            placement.style.transition = '';
        }
        else {
            height = results.getBoundingClientRect().height;
        }

        const release = holdResultsHeight(results, height);
        const onEnd = (event: TransitionEvent) => {
            if (event.target !== placement)
                return;
            end();
            finish();
        };
        const end = () => {
            placement.removeEventListener('transitionend', onEnd);
            placement.removeEventListener('transitioncancel', onEnd);
            this._errorSlideEnd = null;
            release();
        };
        placement.addEventListener('transitionend', onEnd);
        placement.addEventListener('transitioncancel', onEnd);
        this._errorSlideEnd = end;

        placement.classList.toggle('shown', show);
    }

    _isInProgress() {
        const status = this.model.attributes.status;
        return status === AnalysisStatus.ANALYSIS_INITED
            || status === AnalysisStatus.ANALYSIS_RUNNING
            || status === AnalysisStatus.ANALYSIS_RENDERING;
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
            this.placeAddonMark();
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
        if (this.type() === 'Table')
            split.push({ name: 'copyImage', label: _('Copy as Image') });
        if (this.type() !== 'Image' && this.type() !== 'Html' && this.type() !== 'Svg')
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
