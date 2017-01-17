'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var Element = require('./element');

var GroupModel = Backbone.Model.extend({
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

var GroupView = Element.View.extend({
    initialize: function(data) {

        Element.View.prototype.initialize.call(this, data);

        this.create = data.create;
        this.children = [ ];
        this.mode = data.mode;

        this.hoTag = '<h'  + (this.level+1) + '>';
        this.hcTag = '</h' + (this.level+1) + '>';

        this.$el.addClass('silky-results-group');

        if (this.model === null)
            this.model = new GroupModel();

        if (this.mode === 'text')
            this.$title = $(this.hoTag + '# ' + this.model.attributes.title + this.hcTag).appendTo(this.$el);
        else
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

        var error = this.model.get('error');
        if (error !== null) {
            var $errorPlacement = $('<div class="silky-results-error-placement"></div>');
            var $error = $('<div class="silky-results-error-message"></div>');
            $error.append(error.message);
            $errorPlacement.append($error);
            this.$el.append($errorPlacement);
            this.$el.addClass('silky-results-error');
        }

        let promises = [ ];

        this.model.attributes.element.elements.forEach(element => {
            if (this.mode === 'rich' && element.syntax)
                return;

            var $el = $('<div></div>');
            var child = this.create(element, $el, this.level+1, this, this.mode);
            if (child !== null) {
                this.children.push(child);
                $el.appendTo(this.$el);
                $('<br>').appendTo(this.$el);
                promises.push(child);
            }
        });

        this.ready = Promise.all(promises);
    }
});

module.exports = { Model: GroupModel, View: GroupView };
