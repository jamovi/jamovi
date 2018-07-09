
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

        this.$ok = $('<div class="jmv-editor-panel-ok"><span class="mif-checkmark"></span><span class="mif-arrow-up"></span></div>').appendTo(this.$main);

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
        if (item !== null && item === this.item) {
            if (this.$el.hasClass('hidden'))
                this.$el.removeClass('hidden');
            return;
        }

        let hide = true;

        if (this.item) {
            this.item.$el.detach();
            this.$title.html('');
            this.item = null;
        }

        if (item) {
             this.$contents.append(item.$el);
             this.$title.html(item.title);
             this.item = item;
             hide = false;
        }

        if (hide)
            this.$el.addClass('hidden');
        else
            this.$el.removeClass('hidden');

    }

});

module.exports = EditorPanel;
