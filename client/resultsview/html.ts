'use strict';

import Elem, { ElementData, ElementModel } from './element';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { AnalysisStatus } from './create';

export interface HTMLElementData {
    content: string;
    scripts: string[];
    stylesheets: string[];
}

export class Model extends Elem.Model<ElementModel<HTMLElementData>> {
    constructor(data?: ElementModel<HTMLElementData>) {
        super(data || {
            name: 'name',
            title: '(no title)',
            element: { content: '', stylesheets: [], scripts: [] },
            error: null,
            status: AnalysisStatus.ANALYSIS_COMPLETE,
            stale: false,
            options: { },
        });
    }
}

export class View extends Elem.View<Model> {
    $head: HTMLHeadElement;
    promises: Promise<string>[]

    constructor(model: Model, data: ElementData) {
        super(model, data);

        this._handleLinkClick = this._handleLinkClick.bind(this);

        this.classList.add('jmv-results-html');

        this.$head = document.head;

        this.promises = [ ];

        let doc = this.model.attributes.element;

        for (let ss of doc.stylesheets) {
            let url = 'module/' + ss;
            let promise = this._insertSS(url);
            this.promises.push(promise);
        }

        for (let script of doc.scripts)
            this.$head.append('<script src="module/' + script + '" class="module-asset"></script>');


        this.render();
    }

    type() {
        return 'Html';
    }

    label() {
        return _('Html');
    }

    render() {

        this.$head.querySelector('.module-asset')?.remove();

        let doc = this.model.attributes.element;
        if (doc.content === '')
            return;

        this.ready = Promise.all(this.promises).then(() => {
            let $content = this.querySelector('.content');
            if ($content) {
                this.querySelectorAll('a[href]').forEach(el => el.removeEventListener('click', this._handleLinkClick));
                $content.innerHTML = doc.content;
            }
            else {
                this.addContent(HTML.parse(`<div class="content">${ doc.content }</div>`));
                $content = this.querySelector('.content');
            }
            $content.querySelectorAll('a[href]').forEach(el => el.addEventListener('click', this._handleLinkClick));
            const scriptElems = $content.querySelectorAll<HTMLScriptElement>('script');
            for (const script of scriptElems) {
                const nu = document.createElement('script')
                nu.textContent = script.textContent;
                document.head.appendChild(nu);
                nu.parentNode.removeChild(nu);
                script.parentNode.removeChild(script);
            }
        });
    }

    _handleLinkClick(event: Event) {
        if (event.target instanceof HTMLElement) {
            let href = event.target.getAttribute('href');
            window.openUrl(href);
        }
    }

    _insertSS(url: string) {
        return new Promise<string>((resolve, reject) => {

            fetch(url)
            .then(response => response.text())
            .then(data => {
                const style = document.createElement("style");
                style.className = "module-asset";
                style.textContent = data;
                this.$head.appendChild(style);  // assuming this.head is a DOM element
                resolve(data);
            })
            .catch(err => reject(err));

            /*$.get(url, (data) => {
                this.$head.append('<style class="module-asset">' + data + '</style>');
                resolve(data);
            }, 'text');*/
        });
    }

}

customElements.define('jmv-results-html', View);

export default { Model, View };
