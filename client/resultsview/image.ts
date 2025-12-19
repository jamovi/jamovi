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
    ctrlDown = false;
    atomicChange: NodeJS.Timeout;
    hideSize: NodeJS.Timeout;
    manualResize = false;


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

        this.addEventListener('keyup', (event: KeyboardEvent) => {
            if (event.ctrlKey) 
                this.manualResize = false;
        })

        this.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.ctrlKey) {
                if (this.initalised === false)
                    this.resizeObserver.observe(this.$image);

                if (event.key === 'ArrowUp') {
                    this.manualResize = true;
                    this.atomicSizeChange(parseInt(this.$image.style.width), parseInt(this.$image.style.height) - 10);
                    event.stopPropagation();
                    event.preventDefault();
                }
                else if (event.key === 'ArrowDown') {
                    this.manualResize = true;
                    this.atomicSizeChange(parseInt(this.$image.style.width), parseInt(this.$image.style.height) + 10);
                    event.stopPropagation();
                    event.preventDefault();
                }
                else if (event.key === 'ArrowLeft') {
                    this.manualResize = true;
                    this.atomicSizeChange(parseInt(this.$image.style.width) - 10, parseInt(this.$image.style.height));
                    event.stopPropagation();
                    event.preventDefault();
                }
                else if (event.key === 'ArrowRight') {
                    this.manualResize = true;
                    this.atomicSizeChange(parseInt(this.$image.style.width) + 10, parseInt(this.$image.style.height));
                    event.stopPropagation();
                    event.preventDefault();
                }
                
            }
        });

        this.$size = HTML.parse('<div class="size-display"></div>');
        this.append(this.$size);

        window.addEventListener('keydown', e => {
            if (e.key === 'Control') 
                this.ctrlDown = true;
        });

        window.addEventListener('keyup', e => {
            if (e.key === 'Control') 
                this.ctrlDown = false;
        });

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.$image.style.backgroundSize = '';

                const different = this.widthOfImage !== entry.contentRect.width || this.heightOfImage !== entry.contentRect.height;
                this.widthOfImage = entry.contentRect.width;
                this.heightOfImage = entry.contentRect.height;
                
                if (this.initalised) {
                    if (this.manualResize)
                        this.$size.style.opacity = '1';

                    if (this.hideSize)
                        clearTimeout(this.hideSize);
                    this.hideSize = setTimeout(() => {
                        this.$size.style.opacity = '0';
                    }, 1000);
                    

                    this.updateSizeDisplay();
                    if (different && this.manualResize) {
                        //focusLoop.speakMessage(_('Image size {width} by {height}', { width: this.widthOfImage, height: this.heightOfImage }));
                        this.updating = true;
                    }
                }

                this.initalised = true;
            }
        });

        this.applyScaleValues = this.applyScaleValues.bind(this);
        this.imagePointerDown = this.imagePointerDown.bind(this);
    }

    atomicSizeChange(width: number, height: number) {
        this.$image.style.height = `${height}px`;
        this.$image.style.width = `${width}px`;
        if (this.atomicChange)
            clearTimeout(this.atomicChange);
        this.atomicChange = setTimeout(() => {
            this.applyScaleValues();
        }, 500);
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
        this.manualResize = true;
        if (this.initalised === false)
            this.resizeObserver.observe(this.$image);
    }

    updateSizeDisplay() {
        const step = 10;
        const width  = Math.round(this.widthOfImage  / step) * step;
        const height = Math.round(this.heightOfImage / step) * step;
        this.$size.innerText = `${width} x ${height}`;
    }

    applyScaleValues() {
        this.manualResize = false;
        
        if (this.updating) {
            const step = 10;
            if (this.ctrlDown === false && (this.widthOfImage % step !== 0 || this.heightOfImage % step !== 0)) {
                
                this.widthOfImage  = Math.round(this.widthOfImage  / step) * step;
                this.heightOfImage = Math.round(this.heightOfImage / step) * step;

                this.$image.style.width  = this.widthOfImage  + 'px';
                this.$image.style.height = this.heightOfImage + 'px';
            }
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

        focusLoop.speakMessage(_('Image resized to {width} by {height}', { width: widthOfImage, height: heightOfImage }));
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
