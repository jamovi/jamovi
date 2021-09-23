'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Elem = require('./element');

const flatten = require('../common/utils/addresses').flatten;

const ImageModel = Elem.Model.extend({
    defaults : {
        name: 'name',
        title: '(no title)',
        element: {
            path: '',
            width: 400,
            height: 300
        },
        error: null,
        status: 'complete',
        options: { },
    },
    initialize: function() {
    }
});

const ImageView = Elem.View.extend({
    initialize: function(data) {

        Elem.View.prototype.initialize.call(this, data);

        this.$el.addClass('jmv-results-image');

        this.$status = $('<div class="jmv-results-image-status-indicator"></div>');
        this.$status.prependTo(this.$el);
        this.$title = $('<h' + (this.level+1) + ' class="jmv-results-image-title"></h' + (this.level+1) + '>');
        this.$title.prependTo(this.$el);



        if (this.model === null)
            this.model = new ImageModel();

        let address = flatten(this.address());
        this.$image = $(`<div class="jmv-results-image-image" data-address="${ encodeURI(address) }">`).appendTo(this.$el);

        this.render();
    },
    type: function() {
        return 'Image';
    },
    render: function() {

        if (this.$title) {
            if (this.model.attributes.title) {
                this.$title.text(this.model.attributes.title);
                this.$title.show();
            }
            else {
                this.$title.empty();
                this.$title.hide();
            }
        }

        if (this.model.attributes.status === 1)
            this.$el.attr('data-status', 'inited');
        else if (this.model.attributes.status === 2)
            this.$el.attr('data-status', 'running');
        else if (this.model.attributes.status === 5)
            this.$el.attr('data-status', 'running');
        else
            this.$el.removeAttr('data-status');

        let address = flatten(this.address());

        let element = this.model.attributes.element;

        let backgroundImage = 'none';
        if (element.path) {
            let url = 'res/' + element.path;
            url = url.replace(/\"/g, '&quot;');
            backgroundImage = "url('" + url + "')";
        }

        this.$image.css({
            'background-image': backgroundImage,
            'width': element.width + 'px',
            'height' : element.height + 'px',
            'background-size': element.width + 'px'
        });

    }
});

module.exports = { Model: ImageModel, View: ImageView };
