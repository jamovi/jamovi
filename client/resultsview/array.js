'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var Element = require('./element');

var ArrayModel = Backbone.Model.extend({
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

var ArrayView = Element.View.extend({
    initialize: function(data) {

        Element.View.prototype.initialize.call(this, data);

        this.create = data.create;
        this.level = data.level;
        this.children = [ ];

        this.hoTag = '<h'  + (this.level+1) + '>';
        this.hcTag = '</h' + (this.level+1) + '>';

        this.$el.addClass('silky-results-array');

        if (this.model === null)
            this.model = new ArrayModel();

        this.$title = $(this.hoTag + this.model.attributes.title + this.hcTag).appendTo(this.$el);

        this.render();
    },
    type: function() {
        return "Group";
    },
    get: function(address) {
        if (address.length === 0)
            return this;

        var childName = address[0];
        var child = null;

        for (var i = 0; i < this.children.length; i++) {
            var nextChild = this.children[i];
            if (nextChild.model.get('name') === childName) {
                child = nextChild;
                break;
            }
        }

        if (child !== null && address.length > 1) {
            var nextAddress = _.clone(address);
            nextAddress.shift();
            return child.get(nextAddress);
        }
        else {
            return child;
        }
    },
    render: function() {

        var self = this;

        this.model.attributes.element.elements.forEach(function(element) {
            var $el = $('<div></div>');
            var child = self.create(element, $el, self.level+1, self);
            self.children.push(child);
            $el.appendTo(self.$el);
        });

    }
});

module.exports = { Model: ArrayModel, View: ArrayView };
