'use strict';

import Annotations from './annotations';

import Elem, { CollectionView, View as Element, ElementData, ElementModel } from './element';
import _focusLoop from '../common/focusloop';
import { AnalysisStatus, IElement } from './create';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { Item } from './itemtracker';
import Annotation from './annotation';
import Heading from './heading';

export interface GroupElementData extends ElementData {
    hasTitle: boolean;
    isEmptyAnalysis: boolean;
}

export interface IGroupElementData {
    elements : IElement[ ]
}

export class Model extends Elem.Model<ElementModel<IGroupElementData>> {
    constructor(data: ElementModel<IGroupElementData>) {
        super(data || {
            name: "name",
            title: "(no title)",
            element : {
                elements : [ ]
            },
            error: null,
            status: AnalysisStatus.ANALYSIS_COMPLETE,
            options: { },
            stale: false
        })
    }
}

export class View extends CollectionView<Model> {
    $title: HTMLHeadingElement;
    $container: HTMLElement;
    create: (element: IElement, options, level: number, parent: View, mode: string, devMode, fmt, refTable ) => Element;
    devMode: boolean;
    hasTitle: boolean;
    isEmptyAnalysis: boolean;
    _children: Element[];
    hoTag: string;
    hcTag: string;

    constructor(model: Model, data: GroupElementData) {
        super(model, data);

        this.create = data.create;
        this._children = [ ];
        this.mode = data.mode;
        this.devMode = data.devMode;
        this.fmt = data.fmt;
        this.hasTitle = data.hasTitle;
        this.isEmptyAnalysis = data.isEmptyAnalysis;

        if (this.hasTitle) {
            this.hoTag = `<h${ this.level + 1 }>`;
            this.hcTag = `</h${ this.level + 1 }>`;

            this.classList.add('jmv-results-group');
            

            let labelId = _focusLoop.getNextAriaElementId('label');

            this.setAttribute('aria-labelledby', labelId);

            if (this.level === 0 && (this.parent === undefined || this.parent.parent === undefined)) {
                this.setAttribute('role', 'region');
                let annotation = Annotations.create(this.address(), 'heading', this.level, this.model.attributes.title);
                annotation.setAttribute('id', labelId);
                this.prepend(annotation);
            }
            else {
                this.setAttribute('role', 'group');
                this.$title = HTML.parse(this.hoTag + this.model.attributes.title + this.hcTag);
                this.$title.setAttribute('id', labelId);
                this.prepend(this.$title);
            }

            this.addIndex++;
        }



        this.$container = HTML.parse('<div class="jmv-results-group-container"></div>');
        this.addContent(this.$container);

        this.render();
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

        let childName = address[0];
        let child = null;

        for (let i = 0; i < this._children.length; i++) {
            let nextChild = this._children[i];
            if (nextChild.model.get('name') === childName) {
                child = nextChild;
                break;
            }
        }

        if (child !== null && address.length > 1)
            return child.get(address.slice(1));
        else
            return child;
    }

    render() {
        this._children = [ ];

        super.render();

        let promises = [ ];
        let elements = this.model.attributes.element.elements;
        let options = this.model.attributes.options;

        if (this.$title) {
            if (this.model.attributes.title)
                this.$title.textContent = this.model.attributes.title;
            else
                this.$title.innerHTML = '';
        }
        else {
            let heading = Annotations.getControl(this.address(), 'heading');
            if (heading && heading instanceof Heading)
                heading.update();
        }

        let childOfSelectList = false;
        if (this.parent && this.parent.hasAnnotations)
            childOfSelectList = this.parent.hasAnnotations() === false;

        let current = null;
        if (this.isEmptyAnalysis || (this.hasTitle !== false && this.model.attributes.title !== '' && ! childOfSelectList))
            current = this._includeAnnotation(current, this.address().join('/'), this, true, _('{title} Initial Annotation', {title: this.model.attributes.title}));


        for (let i = 0; i < elements.length; i++) {
            let element = elements[i];
            if ((this.mode === 'rich' || this.isEmptyAnalysis) && element.name === 'syntax' && element.type === 'preformatted')
                continue;
            if ( ! this.devMode && element.name === 'debug' && element.type === 'preformatted')
                continue;
            if (element.visible === 1 || element.visible === 3)
                continue;

            let childAddress = this.address();
            childAddress.push(element.name);
            childAddress = childAddress.join('/');

            let item = this._includeItem(current, childAddress, element, options);

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
            promises.push(child);

            current = this._includeBreak(current, childAddress);

            if ((! child.hasAnnotations || child.hasAnnotations()) && element.name) 
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

    _includeItem(current, childAddress: string, element: IElement, options) {
        return this.layout.include(childAddress + ':item:' + element.type, () => {
            let child = this.create(element, options, this.level + 1, this, this.mode, undefined, this.fmt, this.model.attributes.refTable);
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

    _includeBreak(current: Item, childAddress: string) {
        return this.layout.include(childAddress + ':break', () => {
            const br = HTML.create('br');
            current.item.after(br);
            return br;
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

    override _menuOptions() {
        if (this.isEmptyAnalysis)
            return [ { name: 'copy', label: _('Copy') } ];
        else if (this.isRoot())
            return [ { name: 'copy', label: _('Copy'), splitType: 'options', split: [ { name: 'copyLatex', label: _('Copy Latex') }] }, { name: 'duplicate', label: _('Duplicate') }, { name: 'export', label: `${_('Export')}...` } ];
        else
            return super._menuOptions();
    }
}

customElements.define('jmv-results-group', View);

export default { Model, View };
