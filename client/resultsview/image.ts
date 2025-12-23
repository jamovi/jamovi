'use strict';

import focusLoop from '../common/focusloop';

import Elem, { ElementData, ElementModel } from './element';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

import { flatten } from '../common/utils/addresses';
import { AnalysisStatus } from './create';

export interface IImageElementData {
    path: string,
    width: number,
    height: number,
    widthM: number,
    widthB: number,
    heightM: number,
    heightB: number
}

export class Model extends Elem.Model<ElementModel<IImageElementData>> {
    constructor(data?: ElementModel<IImageElementData>) {

    super(data || {
            name: 'name',
            title: '(no title)',
            element: {
                path: '',
                width: 400,
                height: 300,
                widthM: 1,
                widthB: 0,
                heightM: 1,
                heightB: 0
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
    $size: HTMLElement;
    resizeObserver: ResizeObserver;

    updating: boolean = false;

    widthOfImage = -1;
    heightOfImage = -1;
    initalised = false;


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

        this.$size = HTML.parse('<div class="size-display"></div>');
        this.append(this.$size);

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentBoxSize) {
                    const contentBoxSize = entry.contentBoxSize[0];
                    this.$image.style.backgroundSize = '';

                    const different = this.widthOfImage !== entry.contentRect.width || this.heightOfImage !== entry.contentRect.height;
                    this.widthOfImage = entry.contentRect.width;
                    this.heightOfImage = entry.contentRect.height;
                    
                    if (this.initalised && different)
                        this.updating = true;

                    this.initalised = true;

                    this.updateSizeDisplay();
                }
            }
        });

        this.applyScaleValues = this.applyScaleValues.bind(this);
        this.imagePointerDown = this.imagePointerDown.bind(this);
    }

    disconnectedCallback() {
        this.$image.removeEventListener('pointerdown',  this.imagePointerDown);
        document.removeEventListener('pointerup', this.applyScaleValues);
        this.resizeObserver.unobserve(this.$image);
    }

    connectedCallback() {
        this.$image.addEventListener('pointerdown',  this.imagePointerDown);
        document.addEventListener('pointerup', this.applyScaleValues);
        this.render();
    }

    imagePointerDown() {
        if (this.initalised === false)
            this.resizeObserver.observe(this.$image);

        this.$size.style.opacity = '1';
        this.updateSizeDisplay();
    }

    updateSizeDisplay() {
        this.$size.innerText = `${this.widthOfImage} x ${this.heightOfImage}`;
    }

    applyScaleValues() {
        this.$size.style.opacity = '0';
        if (this.updating) {
            this.updateScaleValues(this.widthOfImage, this.heightOfImage);
            this.updating = false;
        }
    }

    updateScaleValues(widthOfImage: number, heightOfImage: number) {
        let element = this.model.attributes.element

        let widthM = element.widthM === 0 ? widthOfImage : element.widthM;
        let heightM = element.heightM === 0 ? heightOfImage : element.heightM;

        const widthScale = (widthOfImage - element.widthB) / widthM;
        const heightScale = (heightOfImage - element.heightB) / heightM;

        window.setParam(this.address(), { widthScale, heightScale });

        //console.log(`${widthScale}, ${heightScale}`);
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
