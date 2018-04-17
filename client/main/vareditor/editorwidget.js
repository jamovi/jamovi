
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const keyboardJS = require('keyboardjs');

const NewVarWidget = require('./newvarwidget');
const DataVarWidget = require('./datavarwidget');
const ComputedVarWidget = require('./computedvarwidget');
const RecodedVarWidget = require('./recodedvarwidget');
const FilterWidget = require('./filterwidget');

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
            let newName = this.$title.val();
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

        this.model.on('change:name', event => {
            let name = this.model.get('name');
            if (name !== this.$title.val())
                this.$title.val(name);
        });

        this.$body = $('<div class="jmv-variable-editor-widget-body"></div>').appendTo(this.$el);

        this.$dataVarWidget = $('<div></div>').appendTo(this.$body);
        this.dataVarWidget = new DataVarWidget({ el: this.$dataVarWidget, model: this.model });

        this.$computedVarWidget = $('<div></div>').appendTo(this.$body);
        this.computedVarWidget = new ComputedVarWidget({ el: this.$computedVarWidget, model: this.model });

        this.$recodedVarWidget = $('<div></div>').appendTo(this.$body);
        this.recodedVarWidget = new RecodedVarWidget({ el: this.$recodedVarWidget, model: this.model });

        this.$filterWidget = $('<div></div>').appendTo(this.$body);
        this.filterWidget = new FilterWidget({ el: this.$filterWidget, model: this.model });

        this.$newVarWidget = $('<div></div>').appendTo(this.$body);
        this.newVarWidget = new NewVarWidget({ el: this.$newVarWidget, model: this.model });

        this.$$widgets = [
            this.$dataVarWidget,
            this.$computedVarWidget,
            this.$recodedVarWidget,
            this.$filterWidget,
            this.$newVarWidget,
        ];
    },
    _show($widget) {
        let $$widgets = this.$$widgets;
        for (let i = 0; i < $$widgets.length; i++) {
            if ( ! $widget[0].isSameNode($$widgets[i][0]))
                $$widgets[i].hide();
        }
        $widget.show();
    },
    detach() {
        this.attached = false;

        this.dataVarWidget.detach();
        this.computedVarWidget.detach();
        this.newVarWidget.detach();
        this.recodedVarWidget.detach();
        this.filterWidget.detach();
    },
    attach() {
        this.attached = true;
        let name = this.model.get('name');
        if (name !== this.$title.val())
            this.$title.val(name);

        let type = this.model.get('columnType');
        if (type === 'data') {
            this.$title.show();
            this._show(this.$dataVarWidget);
            this.dataVarWidget.attach();
        }
        else if (type === 'computed') {
            this.$title.show();
            this._show(this.$computedVarWidget);
            this.computedVarWidget.attach();
        }
        else if (type === 'recoded') {
            this.$title.show();
            this._show(this.$recodedVarWidget);
            this.recodedVarWidget.attach();
        }
        else if (type === 'filter') {
            this.$title.hide();
            this._show(this.$filterWidget);
            this.filterWidget.attach();
        }
        else {
            this.$title.hide();
            this._show(this.$newVarWidget);
            this.newVarWidget.attach();
        }
    },
    update() {
        let type = this.model.get('columnType');
        if (type === 'filter')
            this.filterWidget.update();
    }
});

module.exports = EditorWidget;
