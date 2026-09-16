'use strict';


import { AnalysisStatus } from './create';
import Elem, { ElementData, ElementModel } from './element';
import { h, richParagraphs }  from '../common/htmlelementcreator';

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
    $content: HTMLDivElement;

    constructor(model: Model, data: ElementData) {
        super(model, data);

        this.classList.add('jmv-results-text');

        this.$content = h('div', { class: 'content' });
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

        let content = this.model.attributes.element;
        this.$content.replaceChildren(...richParagraphs(content));

        if (this.model.attributes.stale)
            this.$content.classList.add('stale');
        else
            this.$content.classList.remove('stale');

        return true;
    }
}

customElements.define('jmv-results-text', View);
