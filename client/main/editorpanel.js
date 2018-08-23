
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;


const EditorPanel = Backbone.View.extend({
    className: 'EditorPanel',
    initialize() {
        this.$el.empty();
        this.$el.addClass('jmv-editor-panel');

        this.$main = $('<div class="jmv-editor-panel-main"></div>').appendTo(this.$el);

        this.$ok = $('<div class="jmv-editor-panel-ok"><span class="mif-checkmark"></span><span class="mif-arrow-down"></span></div>').appendTo(this.$main);

        this.$title = $('<div class="title">Stuff</div>').appendTo(this.$main);
        this.$contents = $('<div class="content"></div>').appendTo(this.$main);

        this.$ok.on('click', event => {
            let backCall = this.onBack;
            this.attach(null);
            if (backCall)
                backCall();
        });
    },

    attach(item, onBack) {

        this.onBack = onBack;
        if (item !== null && item === this.attachedItem) {
            if (this.$el.hasClass('hidden'))
                this.$el.removeClass('hidden');
            return;
        }

        let hide = true;

        if (this.attachedItem) {
            this.attachedItem.$el.detach();
            this.$title.html('');
            this.attachedItem = null;
        }

        if (item) {
             this.$contents.append(item.$el);
             this.$title.html(item.title);
             this.attachedItem = item;
             hide = false;
        }

        if (hide) {
            this.$el.addClass('hidden');
            this.$el.trigger('editor:hidden');
        }
        else {
            this.$el.removeClass('hidden');
            this.$el.trigger('editor:visible');
        }

    },

    isVisible() {
        return this.$el.hasClass('hidden');
    }

});

module.exports = EditorPanel;
