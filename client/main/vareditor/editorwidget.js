
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');

const DataVarWidget = require('./datavarwidget');
const ComputedVarWidget = require('./computedvarwidget');
const NewVarWidget = require('./newvarwidget');

const EditorWidget = Backbone.View.extend({
    className: 'EditorWidget',
    initialize(args) {

        this.attached = true;

        this.$el.empty();
        this.$el.addClass('jmv-variable-editor-widget');

        this.$title = $('<input class="jmv-variable-editor-widget-title" type="text" maxlength="63">').appendTo(this.$el);
        this.$title.focus(() => {
            keyboardJS.pause('');
            this.$title.select();
        } );
        this.$title.on('change keyup paste', () => {
            let newName = this.$title.val().trim();
            this.model.set({ name: newName });
        } );
        this.$title.blur(() => {
            keyboardJS.resume();
        } );

        this.$title.keydown((event) => {
            var keypressed = event.keyCode || event.which;
            if (keypressed === 13) { // enter key
                this.$title.blur();
                if (this.model.get('changes'))
                    this.model.apply();
                event.preventDefault();
                event.stopPropagation();
            }
            else if (keypressed === 27) { // escape key
                this.$title.blur();
                if (this.model.get('changes'))
                    this.model.revert();
                event.preventDefault();
                event.stopPropagation();
            }
        });

        this.$body = $('<div class="jmv-variable-editor-widget-body"></div>').appendTo(this.$el);

        this.$dataVarWidget = $('<div></div>').appendTo(this.$body);
        this.dataVarWidget = new DataVarWidget({ el: this.$dataVarWidget, model: this.model });

        this.$computedVarWidget = $('<div></div>').appendTo(this.$body);
        this.computedVarWidget = new ComputedVarWidget({ el: this.$computedVarWidget, model: this.model });

        this.$newVarWidget = $('<div></div>').appendTo(this.$body);
        this.newVarWidget = new NewVarWidget({ el: this.$newVarWidget, model: this.model });
    },
    detach() {
        this.model.apply();
        this.attached = false;

        this.dataVarWidget.detach();
        this.computedVarWidget.detach();
        this.newVarWidget.detach();
    },
    attach() {
        this.attached = true;
        let name = this.model.get('name');
        if (name !== this.$title.val())
            this.$title.val(name);

        let type = this.model.get('columnType');
        if (type === 'data') {
            this.dataVarWidget.attach();
            this.$dataVarWidget.show();
            this.$title.show();
            this.$computedVarWidget.hide();
            this.$newVarWidget.hide();
        }
        else if (type === 'computed') {
            this.computedVarWidget.attach();
            this.$computedVarWidget.show();
            this.$title.show();
            this.$dataVarWidget.hide();
            this.$newVarWidget.hide();
        }
        else {
            this.newVarWidget.attach();
            this.$newVarWidget.show();
            this.$dataVarWidget.hide();
            this.$computedVarWidget.hide();
            this.$title.hide();
        }
    }
});

module.exports = EditorWidget;
