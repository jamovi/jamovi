
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const focusLoop = require('../common/focusloop');


const EditorPanel = Backbone.View.extend({
    className: 'EditorPanel',
    initialize() {
        this.$el.empty();
        this.$el.addClass('jmv-editor-panel');
        focusLoop.addFocusLoop(this.$el[0], { level: 1, closeHandler: this.close.bind(this) });

        this.$main = $('<div class="jmv-editor-panel-main"></div>').appendTo(this.$el);

        this.$ok = $(`<button aria-label="${_('Ok')}" tabindex="0" class="jmv-editor-panel-ok"><span class="mif-checkmark"></span><span class="mif-arrow-down"></span></button>`).appendTo(this.$main);

        this.$titleBox = $('<div class="title-box"></div>').appendTo(this.$main);
        this.$title = $('<div class="title"></div>').appendTo(this.$titleBox);
        this.$contents = $('<div class="content"></div>').appendTo(this.$main);

        this.$ok.on('click', this.close.bind(this));
    },
    close(event) {
        let backCall = this.onBack;
        this.attach(null);
        if (backCall)
            backCall();
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
            if (this.$icon)
                this.$icon.detach();
            this.$icon = null;
            this.$title.html('');
            if (this.attachedItem.off)
                this.attachedItem.off('notification', this._notifyEditProblem, this);
            this.attachedItem = null;
        }

        if (item) {
             this.$contents.append(item.$el);
             this.$title.html(item.title);
             if (item.$icon) {
                 item.$icon.prependTo(this.$titleBox);
                 this.$icon = item.$icon;
             }
             this.attachedItem = item;
             if (this.attachedItem.on)
                this.attachedItem.on('notification', this._notifyEditProblem, this);
             hide = false;
        }

        if (hide) {
            if (this.visible) {
                this.$el.addClass('hidden');
                this.$el.trigger('editor:hidden');
                //focusLoop.leaveFocusLoop(this.$el[0]);
                this.visible = false;
            }
        }
        else {
            if ( ! this.visible) {
                this.$el.removeClass('hidden');
                this.$el.trigger('editor:visible');
                setTimeout(() => {
                    focusLoop.enterFocusLoop(this.$el[0], { withMouse: false });
                }, 200);
                this.visible = true;
            }
        }

    },
    _notifyEditProblem(note) {
        this.trigger('notification', note);
    },
    isVisible() {
        return this.$el.hasClass('hidden');
    }

});

module.exports = EditorPanel;
