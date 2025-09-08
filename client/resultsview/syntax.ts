'use strict';


import { AnalysisStatus } from './create';
import Elem, { ElementData, ElementModel } from './element';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export class Model extends Elem.Model<ElementModel<string>> {
    constructor(data?: ElementModel<string>) {

        super(data || {
                name:    'name',
                title:   '(no title)',
                element: '(no syntax)',
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
    $syntax: HTMLPreElement;

    constructor(model: Model, data: ElementData) {
        super(model, data);

        this.classList.add('jmv-results-syntax');

        this.$title = HTML.parse('<h' + (this.level+1) + ' class="jmv-results-image-title"></h' + (this.level+1) + '>');
        this.addContent(this.$title);

        this.$syntax = HTML.parse('<pre class="jmv-results-syntax-text"></pre>');
        this.addContent(this.$syntax);

        this.render();
    }
    type() {
        return 'Syntax';
    }
    label() {
        return _('Syntax');
    }
    render() {

        let syntax = this.model.attributes.element;
        this.$syntax.innerText = syntax;

        if (this.$title) {
            if (this.model.attributes.title)
                this.$title.innerText = this.model.attributes.title;
            else
                this.$title.innerHTML = '';
        }

        if (this.model.attributes.stale)
            this.$syntax.classList.add('stale');
        else
            this.$syntax.classList.remove('stale');

        return true;
    }
}

customElements.define('jmv-results-preformatted', View);
