'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const Annotations = require('./annotations');

const Elem = require('./element');

const GroupModel = Elem.Model.extend({
    defaults : {
        name: "name",
        title: "(no title)",
        element : {
            elements : [ ]
        },
        error: null,
        status: 'complete',
        options: { },
    },
    initialize: function() {
    }
});

const GroupView = Elem.View.extend({
    initialize: function(data) {

        Elem.View.prototype.initialize.call(this, data);

        if (this.model === null)
            this.model = new GroupModel();

        this.create = data.create;
        this.children = [ ];
        this.mode = data.mode;
        this.devMode = data.devMode;
        this.fmt = data.fmt;
        this.hasTitle = data.hasTitle;
        this.isEmptyAnalysis = data.isEmptyAnalysis;

        if (this.hasTitle) {
            this.hoTag = `<h${ this.level + 1 }>`;
            this.hcTag = `</h${ this.level + 1 }>`;

            this.$el.addClass('jmv-results-group');

            if (this.level === 0 && (this.parent === undefined || this.parent.parent === undefined)) {
                let annotation = Annotations.create(this.address(), 'heading', this.level, { text: this.model.attributes.title });
                annotation.$el.prependTo(this.$el);
            }
            else {
                if (this.mode === 'text')
                    this.$title = $(this.hoTag + '# ' + this.model.attributes.title + this.hcTag).prependTo(this.$el);
                else
                    this.$title = $(this.hoTag + this.model.attributes.title + this.hcTag).prependTo(this.$el);
                this.$title.prependTo(this.$el);
            }

            this.addIndex++;
        }



        this.$container = $('<div class="jmv-results-group-container"></div>');
        this.addContent(this.$container);

        this.render();
    },
    type: function() {
        return 'Group';
    },
    get: function(address) {
        if (address.length === 0)
            return this;

        let childName = address[0];
        let child = null;

        for (let i = 0; i < this.children.length; i++) {
            let nextChild = this.children[i];
            if (nextChild.model.get('name') === childName) {
                child = nextChild;
                break;
            }
        }

        if (child !== null && address.length > 1)
            return child.get(address.slice(1));
        else
            return child;
    },
    render: function() {

        Elem.View.prototype.render.call(this);

        let promises = [ ];
        let elements = this.model.attributes.element.elements;
        let options = this.model.attributes.options;

        if (this.$title) {
            if (this.model.attributes.title)
                this.$title.text(this.model.attributes.title);
            else
                this.$title.empty();
        }
        else {
            let heading = Annotations.getControl(this.address(), 'heading');
            if (heading)
                heading.update();
        }

        let childOfSelectList = false;
        if (this.parent && this.parent.hasAnnotations)
            childOfSelectList = this.parent.hasAnnotations() === false;

        let current = null;
        if (this.isEmptyAnalysis || (this.model.attributes.title !== '' && ! childOfSelectList))
            current = this._includeAnnotation(current, this.address().join('/'), this, true);


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
            this.children.push(child);
            promises.push(child);

            current = this._includeBreak(current, childAddress);

            if ((! child.hasAnnotations || child.hasAnnotations()) && element.name)
                current = this._includeAnnotation(current, childAddress, child, false);
        }

        this.ready = Promise.all(promises);
    },
    _includeItem(current, childAddress, element, options) {
        return this.layout.include(childAddress + ':item:' + element.type, () => {
            let $el = $('<div></div>');
            let child = this.create(element, options, $el, this.level + 1, this, this.mode, undefined, this.fmt, this.model.attributes.refTable);
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
    _includeBreak(current, childAddress) {
        return this.layout.include(childAddress + ':break', () => {
            return $('<br>').insertAfter(current.$el);
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
    _menuOptions(event) {
        if (this.isEmptyAnalysis)
            return [ { label: 'Copy' } ];
        else if (this.isRoot())
            return [ { label: 'Copy' }, { label: 'Duplicate' }, { label: 'Export' } ];
        else
            return Elem.View.prototype._menuOptions.call(this);
    }
});

module.exports = { Model: GroupModel, View: GroupView };
