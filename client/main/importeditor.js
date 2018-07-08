
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;


const ImportEditor = Backbone.View.extend({
    className: 'ImportEditor',
    initialize() {
        this.$el.empty();
        this.$el.addClass('jmv-import-editor');

        this.$main = $('<div class="jmv-import-editor-main"></div>').appendTo(this.$el);

        this.$ok = $('<div class="jmv-import-editor-ok"><span class="mif-checkmark"></span><span class="mif-arrow-up"></span></div>').appendTo(this.$main);

        this.$ok.on('click', event => {
            this.visible(false);
        });

    },
    toggleVisibility() {
        if (this.$el.hasClass('hidden'))
            this.$el.removeClass('hidden');
        else
            this.$el.addClass('hidden');
    },
    visible(value) {
        if (value)
            this.$el.removeClass('hidden');
        else
            this.$el.addClass('hidden');
    }

});

module.exports = ImportEditor;
