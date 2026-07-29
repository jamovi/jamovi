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
            element: { content: '', stylesheets: [], scripts: [], path: '' },
            error: null,
            status: AnalysisStatus.ANALYSIS_COMPLETE,
            stale: false,
            options: { },
        });
    }
}

export class View extends Elem.View<Model> {

    $title: HTMLHeadingElement;
    promises: Promise<string>[];

    constructor(model: Model, data: ElementData) {
        super(model, data);

        this._handleLinkClick = this._handleLinkClick.bind(this);

        this.classList.add('jmv-results-svg');

        const titleId = interactionManager.nextAriaId('svg');
        this.setAttribute('role', 'img');
        this.setAttribute('aria-labelledby', titleId);

        this.$title = h(`h${this.level+1}` as keyof HTMLElementTagNameMap,
            { id: titleId, class: 'jmv-results-svg-title' }) as HTMLHeadingElement;
        this.prepend(this.$title);

        this.promises = [ ];

        const doc = this.model.attributes.element;

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

    render() {

        if (this.model.attributes.title) {
            setRich(this.$title, this.model.attributes.title);
            this.$title.style.display = '';
        }
        else {
            this.$title.textContent = '';
            this.$title.style.display = 'none';
        }

        const doc = this.model.attributes.element;

        if (doc.content !== '') {
            // the analysis has provided the markup and scripts which draw the
            // svg. wait for the js and css to have loaded before running them
            this.ready = Promise.all(this.promises)
                .then(() => this._setContent(doc.content))
                .then(() => this._runScripts());
        }
        else if (doc.path) {
            // no markup, so this element was restored from a file; the svg we
            // harvested when it was saved is all that remains of it
            this.ready = this._fetchSvg(doc.path)
                .then((svg) => this._setContent(svg));
        }
    }

    _setContent(content: string) {

        let $content = this.querySelector('.content');

        if ($content) {
            $content.querySelectorAll('a[href]')
                .forEach(el => el.removeEventListener('click', this._handleLinkClick));
            $content.replaceChildren(
                ...Array.from(htmlTrusted<HTMLDivElement>(`<div>${ content }</div>`).childNodes));
        }
        else {
            this.addContent(h('div', { class: 'content' },
                ...Array.from(htmlTrusted<HTMLDivElement>(`<div>${ content }</div>`).childNodes)));
            $content = this.querySelector('.content');
        }

        $content.querySelectorAll('a[href]')
            .forEach(el => el.addEventListener('click', this._handleLinkClick));
    }

    _runScripts() {
        // scripts inside innerHTML are not executed by the browser. to run them,
        // we clone each script's text into a new element, append it to the head
        // (which triggers execution), then immediately remove it and the original.
        const $content = this.querySelector('.content');
        for (const script of $content.querySelectorAll<HTMLScriptElement>('script')) {
            const nu = document.createElement('script');
            nu.textContent = script.textContent;
            document.head.appendChild(nu);
            nu.parentNode.removeChild(nu);
            script.parentNode.removeChild(script);
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
