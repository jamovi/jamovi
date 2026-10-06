'use strict';

import interactionManager from '../common/interactionmanager';

import Elem, { ElementData, ElementModel } from './element';
import { h, htmlTrusted, setRich }  from '../common/htmlelementcreator';
import { AnalysisStatus } from './create';

export interface ISvgElementData {
    content: string;
    scripts: string[];
    stylesheets: string[];
    path: string;
}

export class Model extends Elem.Model<ElementModel<ISvgElementData>> {
    constructor(data?: ElementModel<ISvgElementData>) {
        super(data || {
            name: 'name',
            title: '(no title)',
            element: {
                content: '',
                stylesheets: [],
                scripts: [],
                path: '',
            },
            error: null,
            status: AnalysisStatus.ANALYSIS_COMPLETE,
            stale: false,
            options: { },
        } as ElementModel<ISvgElementData>);
    }
}

// a press anywhere on the svg selects it, as a press anywhere on an image
// does. a module which wants presses on some part of its svg for itself marks
// that part (or an ancestor of it) with this class
const INTERACTIVE = '.jmv-results-svg-interactive';

// a module can ask for its svg to be a particular size -- one typed into it,
// say -- by dispatching this from the svg, with { width, height } in pixels
// as its detail. the size is applied and stored just as a drag's is
const RESIZE_EVENT = 'jmv-results-svg-resize';

const clampSize = (size: number) => Math.min(2000, Math.max(50, size));

export class View extends Elem.View<Model> {

    $title: HTMLHeadingElement;
    $size: HTMLElement;
    $grip: HTMLElement;
    promises: Promise<string>[];
    _svgEl: SVGElement | null;

    constructor(model: Model, data: ElementData) {
        super(model, data, true);

        this._svgEl = null;

        this._handleLinkClick = this._handleLinkClick.bind(this);

        this.classList.add('jmv-results-svg');

        const titleId = interactionManager.nextAriaId('svg');
        this.setAttribute('role', 'img');
        this.setAttribute('aria-labelledby', titleId);

        this.$title = h(`h${this.level+1}` as keyof HTMLElementTagNameMap,
            { id: titleId, class: 'jmv-results-svg-title' }) as HTMLHeadingElement;
        this.prepend(this.$title);

        this.$size = h('div', { class: 'size-display ignore-html' });
        this.append(this.$size);

        // the grip lives beside the module's markup rather than in it, and
        // css anchors it to the corner of the selected svg
        this.$grip = h('div', { class: 'jmv-results-svg-grip ignore-html' });
        this.$grip.addEventListener('pointerdown',
            (event: PointerEvent) => this._gripPressed(event));
        this.append(this.$grip);

        this.addEventListener(RESIZE_EVENT, (event: Event) => {
            const { width, height } = (event as CustomEvent).detail ?? { };
            if ( ! this._svgEl || ! (width > 0) || ! (height > 0))
                return;
            const w = clampSize(width);
            const h = clampSize(height);
            this._svgEl.style.width = `${ w }px`;
            this._svgEl.style.height = `${ h }px`;
            this._commitSize(w, h);
        });

        this.promises = [ ];

        const doc = this.model.attributes.element as ISvgElementData;

        for (const ss of doc.stylesheets) {
            const promise = this._insertSS(`module/${ ss }`);
            this.promises.push(promise);
        }

        for (const script of doc.scripts) {
            const el = h('script', { src: `module/${ script }`, class: 'module-asset' });
            const promise = new Promise<string>((resolve, reject) => {
                el.addEventListener('load', () => resolve(script));
                el.addEventListener('error', () => reject(new Error(`Failed to load script: ${ script }`)));
            });
            this.promises.push(promise);
            document.head.appendChild(el);
        }

        this.render();
    }

    type() {
        return 'Svg';
    }

    label() {
        return _('Image');
    }

    render(): void {

        if (this.model.attributes.title) {
            setRich(this.$title, this.model.attributes.title);
            this.$title.style.display = '';
        }
        else {
            this.$title.textContent = '';
            this.$title.style.display = 'none';
        }

        // the model's attributes are Partial<>, but createItem() always
        // provides the element
        const doc = this.model.attributes.element as ISvgElementData;

        if (doc.content !== '')
            this.ready = this._renderContent(doc);
        else if (doc.path)
            this.ready = this._renderStoredSvg();
    }

    // the analysis has provided the markup and scripts which draw the svg
    async _renderContent(doc: ISvgElementData): Promise<void> {

        try {
            // wait for the module's js and css to have loaded
            await Promise.all(this.promises);
        }
        catch (cause: unknown) {
            // only the assets failing to load means a missing module. we
            // deliberately don't guard the rendering below -- anything that
            // throws there is a fault, and shouldn't be quietly papered over
            // with the stored svg
            await this._renderStoredSvg(cause);
            return;
        }

        this._setContent(doc.content);
    }

    // the module's assets are what draw the svg, so when they can't be
    // loaded -- the module not being installed, most likely -- we fall back
    // to the svg we harvested when this was saved
    async _renderStoredSvg(cause?: unknown): Promise<void> {

        const doc = this.model.attributes.element as ISvgElementData;

        if ( ! doc.path) {
            if (cause)
                console.log(cause);
            return;
        }

        try {
            this._setContent(await this._fetchSvg(doc.path));
        }
        catch (e: unknown) {
            console.log(e);
        }
    }

    _setContent(content: string) {

        // a rerun replaces the svg, and the selection should survive that
        const wasSelected = this._svgEl !== null
            && this._svgEl === document.activeElement;

        const nodes = Array.from(htmlTrusted<HTMLDivElement>(`<div>${ content }</div>`).childNodes);
        let $content = this.querySelector('.content');
        if ($content)
            $content.replaceChildren(...nodes);
        else
            this.addContent($content = h('div', { class: 'content' }, ...nodes));

        $content.querySelectorAll('a[href]')
            .forEach(el => el.addEventListener('click', this._handleLinkClick));

        this._runScripts($content);
        this._adoptSvg($content);

        if (wasSelected && this._svgEl)
            (this._svgEl as unknown as HTMLElement).focus({ preventScroll: true });
    }

    // the svg is what the user selects, and what the grip resizes
    _adoptSvg($content: Element) {

        // prefer the svg the module has explicitly marked as selectable
        const svgEl = $content.querySelector<SVGElement>('svg.jmv-results-svg-selection')
            ?? $content.querySelector<SVGElement>('svg');

        this._svgEl = svgEl;
        if ( ! svgEl)
            return;

        this._applySize(svgEl);
        this.setFocusElement(svgEl as unknown as HTMLElement);

        svgEl.addEventListener('pointerdown', (event) => {
            if ( ! this._isInteractive(event.target, svgEl))
                (svgEl as unknown as HTMLElement).focus({ preventScroll: true });
        });
        // focusing is the default action of a mouse press, so preventing it
        // leaves a press on an interactive part from selecting the svg. the
        // module's own handlers, and the click, are unaffected. a field in
        // the svg takes the focus itself, and needs the press to place its
        // caret
        svgEl.addEventListener('mousedown', (event) => {
            const field = (event.target as Element | null)?.closest?.(
                'input, textarea, select, [contenteditable]');
            if (this._isInteractive(event.target, svgEl) && ! field)
                event.preventDefault();
        });
    }

    _isInteractive(target: EventTarget | null, svgEl: SVGElement) {
        const interactive = (target as Element | null)?.closest?.(INTERACTIVE);
        return !! interactive && svgEl.contains(interactive);
    }

    // css `resize` can't be used here: it needs a scroll container, and the
    // clip that comes with one swallows the svg's selection ring
    _gripPressed(event: PointerEvent) {

        const svgEl = this._svgEl;
        if (event.button !== 0 || ! svgEl)
            return;

        // preventDefault() keeps the browser from moving focus off the svg,
        // which would take the selection ring -- and the grip with it -- away
        event.preventDefault();
        event.stopPropagation();

        const $grip = event.currentTarget as HTMLElement;
        $grip.setPointerCapture(event.pointerId);

        const rect = svgEl.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        let width = rect.width;
        let height = rect.height;
        let changed = false;
        // in rtl the grip sits at the left edge, so dragging the box bigger
        // is dragging towards a *smaller* clientX
        const dir = getComputedStyle(this).direction === 'rtl' ? -1 : 1;

        const moved = (e: PointerEvent) => {
            width = clampSize(rect.width + (e.clientX - startX) * dir);
            height = clampSize(rect.height + (e.clientY - startY));
            svgEl.style.width = `${ width }px`;
            svgEl.style.height = `${ height }px`;
            this.$size.innerText = `${ Math.round(width) } x ${ Math.round(height) }`;
            this.$size.style.opacity = '1';
            changed = true;
        };

        const released = (e: PointerEvent) => {
            $grip.releasePointerCapture(e.pointerId);
            $grip.removeEventListener('pointermove', moved);
            $grip.removeEventListener('pointerup', released);
            $grip.removeEventListener('pointercancel', released);
            this.$size.style.opacity = '0';
            if (changed)
                this._commitSize(width, height);
        };

        $grip.addEventListener('pointermove', moved);
        $grip.addEventListener('pointerup', released);
        $grip.addEventListener('pointercancel', released);
    }

    // the size the user has dragged the svg to is stored as results options,
    // which are saved with the analysis but don't rerun it. until there is
    // one, the svg is whatever size the module made it
    _sizeOptionName(dimension: 'width' | 'height') {
        return `results/${ this.address().join('/') }/${ dimension }`;
    }

    _applySize(svgEl: SVGElement) {

        const options = this.model.attributes.options ?? { };
        const width = options[this._sizeOptionName('width')];
        const height = options[this._sizeOptionName('height')];

        if (typeof width === 'number' && typeof height === 'number') {
            svgEl.style.width = `${ width }px`;
            svgEl.style.height = `${ height }px`;
        }
    }

    _commitSize(width: number, height: number) {

        width = Math.round(width);
        height = Math.round(height);

        // the options come back to us with the next results, but anything
        // rendering this before then should keep the dragged size
        const options = this.model.attributes.options;
        if (options) {
            options[this._sizeOptionName('width')] = width;
            options[this._sizeOptionName('height')] = height;
        }

        window.setParam(this.address(), { width, height });
        interactionManager.announce(_('Image resized to {width} by {height}', { width, height }));
    }

    _runScripts($content: Element) {
        // scripts inside innerHTML are not executed by the browser. to run them,
        // we clone each script's text into a new element, append it to the head
        // (which triggers execution), then immediately remove it and the original.
        for (const script of $content.querySelectorAll<HTMLScriptElement>('script')) {
            const nu = document.createElement('script');
            nu.textContent = script.textContent;
            document.head.appendChild(nu);
            nu.parentNode?.removeChild(nu);
            script.parentNode?.removeChild(script);
        }
    }

    async _fetchSvg(path: string) {
        const response = await fetch(`res/${ encodeURI(path) }`);
        if ( ! response.ok)
            throw new Error(`Failed to load svg: ${ path }`);
        return await response.text();
    }

    _handleLinkClick(event: Event) {
        if (event.target instanceof HTMLElement) {
            const href = event.target.getAttribute('href');
            if (href)
                window.openUrl(href);
        }
    }

    _insertSS(url: string) {
        return new Promise<string>((resolve, reject) => {
            fetch(url)
            .then(response => response.text())
            .then(data => {
                const style = document.createElement('style');
                style.className = 'module-asset';
                style.textContent = data;
                document.head.appendChild(style);
                resolve(data);
            })
            .catch(err => reject(err));
        });
    }
}

customElements.define('jmv-results-svg', View);

export default { Model, View };
