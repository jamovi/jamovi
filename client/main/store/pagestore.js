//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const PageStore = Backbone.View.extend({
    className: 'PageStore',
    initialize() {

        this.$el.addClass('jmv-store-page-store');

        this.$head = $('<h2>jamovi store</h2>').appendTo(this.$el);
        this.$body = $('<div class="body"></div>').appendTo(this.$el);
        this.$content = $('<div class="content">Coming Soon!</div>').appendTo(this.$body);
    },
});

module.exports = PageStore;
