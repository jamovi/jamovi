'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var ImageModel = Backbone.Model.extend({
    defaults : {
        name: "name",
        title: "(no title)",
        element: {
            path: "",
            width: 400,
            height: 300
        }
    },
    initialize: function() {
    }
});

var ImageView = Backbone.View.extend({
    initialize: function() {
        this.$el.addClass('silky-results-image');

        if (this.model === null)
            this.model = new ImageModel();

        this.render();
    },
    render: function() {

        var element = this.model.attributes.element;
        $('<div style=" \
            background-image: url(\'res/' + element.path + '\'); \
            width: ' + element.width + 'px ; \
            height: ' + element.height + 'px ; \
            background-size: ' + element.width + 'px ; \
            ">').appendTo(this.$el);

    }
});

module.exports = { Model: ImageModel, View: ImageView };
