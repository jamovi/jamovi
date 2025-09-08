'use strict';

import focusLoop from '../common/focusloop';

import Elem, { ElementData, ElementModel } from './element';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

import { flatten } from '../common/utils/addresses';
import { AnalysisStatus } from './create';

export interface IImageElementData {
    path: string,
    width: number,
    height: number
}

export class Model extends Elem.Model<ElementModel<IImageElementData>> {
    constructor(data?: ElementModel<IImageElementData>) {

    super(data || {
            name: 'name',
            title: '(no title)',
            element: {
                path: '',
                width: 400,
                height: 300
            },
            error: null,
            status: AnalysisStatus.ANALYSIS_COMPLETE,
            options: { },
            stale: false
        });
    }
}

export class View extends Elem.View<Model> {

    $title: HTMLHeadingElement;
    $image: HTMLElement;

    constructor(model: Model, data: ElementData) {
        super(model, data);

        this.classList.add('jmv-results-image');

        let imageId = focusLoop.getNextAriaElementId('image');
        this.setAttribute('role', 'img');
        this.setAttribute('aria-labelledby', imageId);

        const $status = HTML.parse('<div class="jmv-results-image-status-indicator"></div>');
        this.prepend($status);
        
        this.$title = HTML.parse(`<h${this.level+1} id="${imageId}" class="jmv-results-image-title"></h${this.level+1}>`);
        this.prepend(this.$title);

        if (this.model === null)
            this.model = new Model();

        let address = flatten(this.address());
        this.$image = HTML.parse(`<div class="jmv-results-image-image" data-address="${ encodeURI(address) }">`);
        this.append(this.$image);

        this.render();
    }

    type() {
        return 'Image';
    }

    label() {
        return _('Image');
    }

    render() {

        if (this.$title) {
            if (this.model.attributes.title) {
                this.$title.textContent = this.model.attributes.title;
                this.$title.style.display = '';
            }
            else {
                this.$title.innerHTML = '';
                this.$title.style.display = 'none';
            }
        }

        if (this.model.attributes.status === 1)
            this.setAttribute('data-status', 'inited');
        else if (this.model.attributes.status === 2)
            this.setAttribute('data-status', 'running');
        else if (this.model.attributes.status === 5)
            this.setAttribute('data-status', 'running');
        else
            this.removeAttribute('data-status');

        let address = flatten(this.address());

        let element = this.model.attributes.element;

        let backgroundImage = 'none';
        if (element.path) {
            let url = 'res/' + element.path;
            url = url.replace(/\"/g, '&quot;');
            backgroundImage = "url('" + url + "')";
        }

        this.$image.style.backgroundImage = backgroundImage;
        this.$image.style.width = element.width + 'px';
        this.$image.style.height = element.height + 'px';
        this.$image.style.backgroundSize = element.width + 'px';

    }
}

customElements.define('jmv-results-image', View);

export default { Model, View };
