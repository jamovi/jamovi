'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var GroupModel = Backbone.Model.extend({
    defaults : {
        name: "name",
        title: "(no title)",
        element : {
            elements : [ ]
        }
    },
    initialize: function() {
    }
});

var GroupView = Backbone.View.extend({
    initialize: function(data) {

        this.create = data.create;
        this.level = data.level;
        this.hoTag = '<h'  + (this.level+1) + '>';
        this.hcTag = '</h' + (this.level+1) + '>';

        this.$el.addClass('silky-results-group silky-results-item');

        if (this.model === null)
            this.model = new GroupModel();

        this.$title = $(this.hoTag + this.model.attributes.title + this.hcTag).appendTo(this.$el);

        this.render();
    },
    render: function() {

        var self = this;

        this.model.attributes.element.elements.forEach(function(element) {
            self.create(element, self.level+1).appendTo(self.$el);
        });

    }
});

module.exports = { Model: GroupModel, View: GroupView };
