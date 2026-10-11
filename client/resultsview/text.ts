'use strict';


import { AnalysisStatus } from './create';
import Elem, { ElementData, ElementModel } from './element';
import { h, richMarkdown, setRich }  from '../common/htmlelementcreator';

export class Model extends Elem.Model<ElementModel<string>> {
    constructor(data?: ElementModel<string>) {

        super(data || {
                name:    'name',
                title:   '(no title)',
                element: '',
                error: null,
                status: AnalysisStatus.ANALYSIS_COMPLETE,
                stale: false,
                options: { },
            }
        );
    }
}

export class View extends Elem.View<Model> {
    $title: HTMLHeadingElement;
    $content: HTMLDivElement;

    constructor(model: Model, data: ElementData) {
        super(model, data);

        this.classList.add('jmv-results-text');

        this.$title = h(`h${this.level+1}` as keyof HTMLElementTagNameMap, { class: 'jmv-results-text-title' }) as HTMLHeadingElement;
        this.addContent(this.$title);

        this.$content = h('div', { class: 'content' });
        this.$content.addEventListener('click', (event) => {
            if ( ! (event.target instanceof Element))
                return;
            const $link = event.target.closest<HTMLAnchorElement>('a[href]');
            if ($link === null)
                return;
            // links must open externally; following them would navigate
            // the results frame away
            event.preventDefault();
            window.openUrl($link.href);
        });
        this.addContent(this.$content);

        this.render();
    }
    type() {
        return 'Text';
    }
    label() {
        return _('Text');
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

        let content = this.model.attributes.element;
        this.$content.replaceChildren(...richMarkdown(content));

        if (this.model.attributes.stale)
            this.$content.classList.add('stale');
        else
            this.$content.classList.remove('stale');

        return true;
    }
}

customElements.define('jmv-results-text', View);
