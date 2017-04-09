'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Elem = require('./element');

const ArrayModel = Backbone.Model.extend({
    defaults : {
        name: "name",
        title: "(no title)",
        element : {
            elements : [ ]
        },
        error: null,
        status: 'complete'
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
        this.mode = data.mode;

        this.hoTag = '<h'  + (this.level+1) + '>';
        this.hcTag = '</h' + (this.level+1) + '>';

        this.$el.addClass('silky-results-array');

        if (this.model === null)
            this.model = new ArrayModel();

        if (this.mode === 'text')
            this.$title = $(this.hoTag + '# ' + this.model.attributes.title + this.hcTag).appendTo(this.$el);
        else
            this.$title = $(this.hoTag + this.model.attributes.title + this.hcTag).appendTo(this.$el);

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

        for (let element of elements) {
            if (element.visible === 1 || element.visible === 3)
                continue;

            let $el = $('<div></div>');
            let child = this.create(element, $el, this.level+1, this, this.mode);
            if (child === null)
                continue;

            this.children.push(child);
            promises.push(child.ready);

            $el.appendTo(this.$el);
        }

        this.ready = Promise.all(promises);
    }
});

module.exports = { Model: ArrayModel, View: ArrayView };
