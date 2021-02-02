'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Annotations = require('./annotations');

const Elem = require('./element');
const b64 = require('../common/utils/b64');

const ArrayModel = Elem.Model.extend({
    defaults : {
        name:  'name',
        title: '(no title)',
        element : {
            elements : [ ],
            layout : 0, // flat
        },
        error: null,
        status: 'complete',
        options: { },
    },
    initialize: function() {
    }
});

const ArrayView = Elem.View.extend({
    initialize: function(data) {

        Elem.View.prototype.initialize.call(this, data);

        this.create = data.create;
        this.level = data.level;
        this.children = [ ];
        this.$$children = [ ];
        this.mode = data.mode;
        this.fmt = data.fmt;

        this.hoTag = '<h'  + (this.level+1) + ' class="jmv-results-array-heading">';
        this.hcTag = '</h' + (this.level+1) + '>';

        this.$el.addClass('jmv-results-array');

        if (this.model === null)
            this.model = new ArrayModel();

        this.updateSelect();

        this.$container = $('<div class="jmv-results-array-container"></div>');
        this.addContent(this.$container);

        this.render();
    },
    _selectEvent(event) {
        let select = this.$select[0];
        let item = select[select.selectedIndex];
        let name = atob(item.value);

        window.setParam(this.address(), { 'selected': name });

        for (let $child of this.$$children) {
            if ($child[0].dataset.name === item.value)
                $child[0].dataset.active = true;
            else
                delete $child[0].dataset.active;
        }
    },
    type: function() {
        return 'Group';
    },
    get: function(address) {
        if (address.length === 0)
            return this;

        let name = address[0];

        for (let child of this.children) {
            if (child.model.attributes.name === name) {
                if (address.length > 1)
                    return child.get(address.slice(1));
                else
                    return child;
            }
        }

        return null;
    },
    hasAnnotations: function() {
        return this.model.attributes.title !== '' && ( ! this.model.attributes.element.hideHeadingOnlyChild || this.model.attributes.element.elements.length > 1);
    },
    updateSelect: function() {
        if (this.mode !== 'text' && this.model.attributes.element.layout === 1) // list select
            this.$el.addClass('jmv-results-array-listselect');
        else
            this.$el.removeClass('jmv-results-array-listselect');

        if (this.mode !== 'text' &&
            this.model.attributes.element.hideHeadingOnlyChild &&
            this.model.attributes.element.elements.length < 2)
                this.$el.addClass('jmv-results-array-hideheading');
        else
            this.$el.removeClass('jmv-results-array-hideheading');

        let lastHasSelect = this.hasSelect;
        this.hasSelect = false;

        if (this.mode !== 'text') {
            if (this.$select)
                this.$select.detach();

            if ( ! this.$title)
                this.$title = $(this.hoTag + this.model.attributes.title + this.hcTag).prependTo(this.$el);
            else
                this.$title.text(this.model.attributes.title);
            if (this.model.attributes.element.layout === 1) {
                this.hasSelect = true;
                if ( ! this.$select) {
                    this.$select = $('<select></select>');
                    this.$select.on('change', (event) => {
                        this._selectEvent(event);
                    });
                }
            }
        }
        else {
            if ( ! this.$title)
                this.$title = $(this.hoTag + '# ' + this.model.attributes.title + this.hcTag).prependTo(this.$el);
            else
                this.$title.text('# ' + this.model.attributes.title);
        }

        if (this.hasSelect)
            this.$select.appendTo(this.$title);

    },

    render: function() {

        Elem.View.prototype.render.call(this);

        this.updateSelect();

        let promises = [ ];
        let elements = this.model.attributes.element.elements;
        let options = this.model.attributes.options;

        if (this.$title) {
            if ( ! this.model.attributes.title)
                this.$title.empty();
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

        let current = null;
        if (this.hasAnnotations() && this.model.attributes.element.layout !== 1)
            current = this._includeAnnotation(current, this.address().join('/'), this, true);

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
                    this.children.push(child);
                    this.$$children.push(current.$el);
                    promises.push(child.ready);
                }
            }
        }



        if (this.hasSelect)
            this.$select.empty();
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
            this.children.push(child);
            this.$$children.push(current.$el);
            promises.push(child.ready);

            let name = element.name;
            let title = element.title;

            let selectedAttr = '';
            if (selected === name) {
                selectedAttr = 'selected';
                current.$el[0].dataset.active = true;
            }
            else
                current.$el[0].removeAttribute('data-active');

            if (this.hasSelect)
                $('<option value="' + b64.enc(name) + '" ' + selectedAttr + '>' + title + '</option>').appendTo(this.$select);


            if ((! child.hasAnnotations || child.hasAnnotations()) && this.model.attributes.element.layout !== 1 && element.name)
                current = this._includeAnnotation(current, childAddress, child, false);
        }

        this.ready = Promise.all(promises);
    },
    _includeItem(current, childAddress, element, options, level) {
        return this.layout.include(childAddress + ':item:' + element.type, () => {
            let $el = $('<div></div>');
            let child = this.create(element, options, $el, level+1, this, this.mode, undefined, this.fmt, this.model.attributes.refTable);
            if (child !== null) {
                $el.addClass('hidden');
                if (current === null)
                    this.$container[0].prepend($el[0]);
                else
                    $el.insertAfter(current.$el);

                setTimeout(() => {
                    $el.removeClass('hidden');
                }, 200);
            }
            return child;
        });
    },
    _includeAnnotation(current, childAddress, item, isTop) {
        let suffix = isTop ? 'topText' : 'bottomText';
        let control = this.layout.include(childAddress + ':' + suffix, (annotation) => {
            if (annotation)
                Annotations.activate(annotation, this.level);
            else
                annotation = Annotations.create(item.address(), suffix, this.level);

            if (isTop)
                this.$container[0].prepend(annotation.$el[0]);
            else
                annotation.$el.insertAfter(current.$el);

            return annotation;
        });
        control.update();
        return control;
    },
    _sendEvent(event) {
        if (this.parent !== null && event.type === 'menu' && event.data.entries.length > 0) {
            if (event.data.entries[0].type === 'Group' && (this.children.length < 2 || this.model.attributes.element.layout !== 0))
                event.data.entries.shift(); // discard
        }

        Elem.View.prototype._sendEvent.call(this, event);
    },
});

module.exports = { Model: ArrayModel, View: ArrayView };
