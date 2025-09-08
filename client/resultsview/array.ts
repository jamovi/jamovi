'use strict';


import Annotations, { IAnnotation } from './annotations';

import Elem, { ElementModel, View as Element, ElementData, CollectionView } from './element';
import b64 from '../common/utils/b64';
import _focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { AnalysisStatus, IElement } from './create';
import { Item } from './itemtracker';
import Annotation from './annotation';


export interface IArrayElementData {
    elements : IElement[ ],
    layout : 0 | 1, // flat
    hideHeadingOnlyChild?: boolean,
    header?: IElement;
    hasHeader?: boolean
}

export class Model extends Elem.Model<ElementModel<IArrayElementData>> {
    constructor(data?: ElementModel<IArrayElementData>) {

    super(data || {
            name:  'name',
            title: '(no title)',
            element : {
                elements : [ ],
                layout : 0, // flat
            },
            error: null,
            status: AnalysisStatus.ANALYSIS_COMPLETE,
            options: { },
            stale: false
        });
    }
}

export class View extends CollectionView<Model> {

    $container: HTMLElement;
    $select: HTMLSelectElement;
    hasSelect: boolean;
    _children: Element[];
    $title: HTMLHeadingElement;
    
    create: (element: IElement, options, level: number, parent: View, mode: string, devMode, fmt, refTable ) => Element;

    hoTag: string;
    hcTag: string;

    constructor(model: Model, data: ElementData) {
        super(model, data);

        this.create = data.create;
        this.level = data.level;
        this._children = [ ];
        

        this.hoTag = '<h'  + (this.level+1) + ' class="jmv-results-array-heading">';
        this.hcTag = '</h' + (this.level+1) + '>';

        this.classList.add('jmv-results-array');
        this.setAttribute('role', 'group');

        if (this.model === null)
            this.model = new Model();

        this.updateSelect();

        this.$container = HTML.parse('<div class="jmv-results-array-container"></div>');
        this.addContent(this.$container);

        this.render();
    }

    _selectEvent(event) {
        let select = this.$select;
        let item = select[select.selectedIndex] as HTMLOptionElement;
        let name = atob(item.value);

        window.setParam(this.address(), { 'selected': name });

        for (let $child of this._children) {
            if ($child.dataset.name === item.value)
                $child.dataset.active = 'true';
            else
                delete $child.dataset.active;
        }
    }

    type() {
        return 'Group';
    }

    label() {
        return _('Group');
    }

    get(address: string[]) {
        if (address.length === 0)
            return this;

        let name = address[0];

        for (let child of this._children) {
            if (child.model.attributes.name === name) {
                if (address.length > 1 && child instanceof CollectionView)
                    return child.get(address.slice(1));
                else
                    return child;
            }
        }

        return null;
    }

    hasAnnotations() {
        return this.model.attributes.title !== '' && ( ! this.model.attributes.element.hideHeadingOnlyChild || this.model.attributes.element.elements.length > 1);
    }

    updateSelect() {
        if (this.model.attributes.element.layout === 1) // list select
            this.classList.add('jmv-results-array-listselect');
        else
            this.classList.remove('jmv-results-array-listselect');

        if (this.model.attributes.element.hideHeadingOnlyChild &&
            this.model.attributes.element.elements.length < 2)
                this.classList.add('jmv-results-array-hideheading');
        else
            this.classList.remove('jmv-results-array-hideheading');

        let lastHasSelect = this.hasSelect;
        this.hasSelect = false;

        if (this.$select)
            this.$select.remove();

        if ( ! this.$title) {
            this.$title = HTML.parse(this.hoTag + this.model.attributes.title + this.hcTag);
            this.prepend(this.$title);
            const labelId = _focusLoop.getNextAriaElementId('label');
            this.$title.setAttribute('id', labelId);
            this.setAttribute('aria-labelledby', labelId);
        }
        else
            this.$title.textContent = this.model.attributes.title;
        if (this.model.attributes.element.layout === 1) {
            this.hasSelect = true;
            if ( ! this.$select) {
                this.$select = document.createElement("select");
                this.$select.addEventListener('change', (event) => {
                    this._selectEvent(event);
                });
            }
        }

        if (this.hasSelect)
            this.$title.append(this.$select);

    }

    render() {

        this._children = [ ];

        super.render();

        this.updateSelect();

        let promises = [ ];
        let elements = this.model.attributes.element.elements;
        let options = this.model.attributes.options;

        if (this.$title) {
            if ( ! this.model.attributes.title)
                this.$title.innerHTML = '';
        }

        let selected;
        let valid = false;
        let selectedOptionName = 'results/' + this.address().join('/') + '/selected';
        if (selectedOptionName in this.model.attributes.options) {
            selected = this.model.attributes.options[selectedOptionName];
            for (let element of elements) {
                if (element.visible === 1 || element.visible === 3)
                    continue;
                if (element.name === selected) {
                    valid = true;
                    break;
                }
            }
        }

        if ( ! valid && elements.length > 0)
            selected = elements[elements.length - 1].name;

        let level = this.level;
        if (this.model.attributes.element.layout === 1) {
            level = this.level-1;
            if (this.model.attributes.element.hideHeadingOnlyChild && this.model.attributes.element.elements.length === 1)
                level = this.level-2;
        }

        let current: Item = null;
        if (this.hasAnnotations() && this.model.attributes.element.layout !== 1)
            current = this._includeAnnotation(current, this.address().join('/'), this, true, _('{title} Initial Annotation', {title:this.model.attributes.title}));

        let element = this.model.attributes.element.header;
        if (this.model.attributes.element.hasHeader && element.visible !== 1 && element.visible !== 3) {
            let childAddress = this.address();
            childAddress.push(element.name);
            childAddress = childAddress.join('/');

            let item = this._includeItem(current, childAddress, element, options, level);

            if (item !== null) {

                current = item;

                let updateData = {
                    element: element,
                    options: options,
                    level: this.level + 1,
                    mode: this.mode,
                    fmt: this.fmt,
                    refTable: this.model.attributes.refTable
                };

                if (current.updated() || current.update(updateData)) {
                    let child = current.item;
                    this._children.push(child);
                    promises.push(child.ready);
                }
            }
        }



        if (this.hasSelect)
            this.$select.innerHTML = '';
        for (let element of elements) {
            if (element.visible === 1 || element.visible === 3)
                continue;

            let childAddress = this.address();
            childAddress.push(element.name);
            childAddress = childAddress.join('/');

            let item = this._includeItem(current, childAddress, element, options, level);

            if (item === null)
                continue;

            current = item;

            let updateData = {
                element: element,
                options: options,
                level: this.level + 1,
                mode: this.mode,
                fmt: this.fmt,
                refTable: this.model.attributes.refTable
            };

            if (current.updated() === false && current.update(updateData) === false)
                continue;

            let child = current.item;
            this._children.push(child);
            promises.push(child.ready);

            let name = element.name;
            let title = element.title;

            let selectedAttr = '';
            if (selected === name) {
                selectedAttr = 'selected';
                current.item.dataset.active = 'true';
            }
            else
                current.item.removeAttribute('data-active');

            if (this.hasSelect)
                this.$select.append(HTML.parse('<option value="' + b64.enc(name) + '" ' + selectedAttr + '>' + title + '</option>'));


            if ((! child.hasAnnotations || child.hasAnnotations()) && this.model.attributes.element.layout !== 1 && element.name)
                current = this._includeAnnotation(current, childAddress, child, false, this.createElementTitle(element));
        }

        this.ready = Promise.all(promises);
    }

    createElementTitle(element) {
        switch (element.type) {
            case 'table':
                return _('Annotation for table {name}', {name: element.title });
            case 'group':
                return _('Annotation for group {name}', {name: element.title });
            case 'array':
                return _('Annotation for list {name}', {name: element.title });
            case 'image':
                return _('Annotation for image {name}', {name: element.title });
            default:
                return _('Annotation for item {name}', {name: element.title }); 
        }
    }

    _includeItem(current, childAddress, element: IElement, options, level) {
        return this.layout.include(childAddress + ':item:' + element.type, () => {
            let child = this.create(element, options, level+1, this, this.mode, undefined, this.fmt, this.model.attributes.refTable);
            if (child !== null) {
                child.classList.add('hidden');
                if (current === null)
                    this.$container.prepend(child);
                else
                    current.item.after(child);

                setTimeout(() => {
                    child.classList.remove('hidden');
                }, 200);
            }
            return child;
        });
    }

    _includeAnnotation(current: Item, childAddress: string, item: View, isTop: boolean, title: string) {
        let suffix = isTop ? 'topText' : 'bottomText';
        let control = this.layout.include(childAddress + ':' + suffix, (annotation) => {
            if (annotation) {
                if (annotation instanceof Annotation)
                    Annotations.activate(annotation, this.level);
                else
                    throw new Error('Address being used for a non annotation.');
            }
            else
                annotation = Annotations.create(item.address(), suffix, this.level, title);

            if (isTop)
                this.$container.prepend(annotation);
            else
                current.item.after(annotation);

            return annotation;
        });
        control.update();
        return control;
    }

    _sendEvent(event) {
        if (this.parent !== null && event.type === 'menu' && event.data.entries.length > 0) {
            if (event.data.entries[0].type === 'Group' && (this._children.length < 2 || this.model.attributes.element.layout !== 0))
                event.data.entries.shift(); // discard
        }

        Elem.View.prototype._sendEvent.call(this, event);
    }
}

customElements.define('jmv-results-array', View);

export default { Model, View };
