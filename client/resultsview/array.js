'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Elem = require('./element');
const b64 = require('../common/utils/b64');

const ArrayModel = Backbone.Model.extend({
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

        if (this.mode !== 'text' && this.model.attributes.element.layout === 1) // list select
            this.$el.addClass('jmv-results-array-listselect');

        if (this.mode !== 'text' &&
            this.model.attributes.element.hideHeadingOnlyChild &&
            this.model.attributes.element.elements.length < 2)
                this.$el.addClass('jmv-results-array-hideheading');

        this.$select = $();

        if (this.mode !== 'text') {
            this.$title = $(this.hoTag + this.model.attributes.title + this.hcTag).prependTo(this.$el);
            if (this.model.attributes.element.layout === 1) {
                this.$select = $('<select></select>').appendTo(this.$title);
                this.$select.on('change', (event) => {
                    this._selectEvent(event);
                });
            }
        }
        else {
            this.$title = $(this.hoTag + '# ' + this.model.attributes.title + this.hcTag).prependTo(this.$el);
        }

        this.$container = $('<div class="jmv-results-array-container"></div>').appendTo(this.$el);

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
    render: function() {

        Elem.View.prototype.render.call(this);

        let promises = [ ];
        let elements = this.model.attributes.element.elements;
        let options = this.model.attributes.options;

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

        for (let element of elements) {
            if (element.visible === 1 || element.visible === 3)
                continue;

            let $el = $('<div></div>');
            let child = this.create(element, options, $el, this.level+1, this, this.mode, undefined, this.fmt);
            if (child === null)
                continue;

            let name = element.name;
            let title = element.title;

            let selectedAttr = '';
            if (selected === name) {
                selectedAttr = 'selected';
                $el[0].dataset.active = true;
            }

            let selectItem = $('<option value="' + b64.enc(name) + '" ' + selectedAttr + '>' + title + '</option>').appendTo(this.$select);

            this.children.push(child);
            this.$$children.push($el);
            promises.push(child.ready);

            $el.appendTo(this.$container);
        }

        this.ready = Promise.all(promises);
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
