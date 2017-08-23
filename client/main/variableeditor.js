//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const keyboardJS = require('keyboardjs');

const VariableModel = require('./vareditor/variablemodel');
const EditorWidget = require('./vareditor/editorwidget');

const VariableEditor = Backbone.View.extend({
    className: 'VariableEditor',
    initialize() {
        this.$el.empty();
        this.$el.addClass('silky-variable-editor');

        this.$main = $('<div class="silky-variable-editor-main"></div>').appendTo(this.$el);

        this.$ok = $('<div class="silky-variable-editor-ok"><span class="mif-checkmark"></span><span class="mif-arrow-up"></span></div>').appendTo(this.$main);
        this.$revert = $('<div class="silky-variable-editor-revert"><span class="mif-undo"></span></div>').appendTo(this.$main);
        this.$left = $('<div class="silky-variable-editor-button-left"><span class="mif-chevron-left"></span></div>').appendTo(this.$main);
        this.$right = $('<div class="silky-variable-editor-button-right"><span class="mif-chevron-right"></span></div>').appendTo(this.$main);

        this.editorModel = new VariableModel(this.model);

        this._keyboardListener = function(event) {
            if (event.metaKey || event.ctrlKey || event.altKey)
                return;

            switch(event.key) {
                case 'ArrowUp':
                case 'ArrowDown':
                case 'Enter':
                    if (this.editorModel.get('changes'))
                        this.editorModel.apply();
                    event.preventDefault();
                    break;
                case 'Escape':
                    if (this.editorModel.get('changes'))
                        this.editorModel.revert();
                    event.preventDefault();
                break;
            }
        };

        this._previousKeyboardContext = keyboardJS.getContext();
        keyboardJS.setContext('spreadsheet');
        keyboardJS.bind('', event => this._keyboardListener(event));
        keyboardJS.setContext(this._previousKeyboardContext);


        this.model.on('columnsChanged', event => {
            if (this.model.attributes.editingVar === null)
                return;
            let column = this.model.attributes.columns[this.model.attributes.editingVar];
            for (let changes of event.changes) {
                if (changes.id === column.id) {
                    if (changes.columnTypeChanged) {
                        let index = column.index;
                        this.model.set('editingVar', index - 1, { silent: true });
                        this.model.set('editingVar', index);
                        this._update();
                    }
                    else if (changes.measureTypeChanged || changes.levelsChanged || changes.nameChanged) {
                        this._update();
                    }
                    break;
                }
            }
        });

        this.$ok.on('click', event => {
            if (this.editorModel.get('changes'))
                this.editorModel.apply();
            else
                this.model.set('editingVar', null);
        });

        this.$revert.on('click', event => {
            if (this.editorModel.get('changes'))
                this.editorModel.revert();
        });

        this._moveLeft = function() {
            let colNo = this.model.attributes.editingVar;
            colNo--;
            if (colNo >= 0)
                this.model.set('editingVar', colNo);
        };

        this.$left.on('click', event => {
            this._moveLeft();
        });

        this._moveRight = function() {
            let colNo = this.model.attributes.editingVar;
            colNo++;
            if (colNo <= this.model.attributes.columnCount - 1)
                this.model.set('editingVar', colNo);
        };

        this.$right.on('click', event => {
            this._moveRight();
        });

        this.editorModel.on('change:changes', event => {
            this.$ok.toggleClass('apply', event.changed.changed);
            this.$revert.toggleClass('apply', event.changed.changed);
        });

        this.$$editors = [
            $('<div style="left: 0;    opacity: 1;"></div>').appendTo(this.$main),
            $('<div style="left: 100%; opacity: 0;"></div>').appendTo(this.$main)
        ];

        this.editors = [
            new EditorWidget({ el : this.$$editors[0], model : this.editorModel }),
            new EditorWidget({ el : this.$$editors[1], model : this.editorModel })
        ];

        this.model.on('change:editingVar', event => this._editingVarChanged(event));
    },
    _update() {
        let columnName = this.model.attributes.editingVar;
        let column = this.model.attributes.columns[columnName];
        this.editorModel.setColumn(column.id);
    },
    _editingVarChanged(event) {
        let prev = this.model.previous('editingVar');
        let now  = event.changed.editingVar;

        if ((prev === null || now === null) && prev !== now)
            this.trigger("visibility-changing", prev === null && now !== null);

        if (now !== null) {
            this.$el.removeClass('hidden');
            this.$left.toggleClass('hidden', now <= 0);
            this.$right.toggleClass('hidden', now >= this.model.attributes.columnCount - 1);
            this._previousKeyboardContext = keyboardJS.getContext();
            keyboardJS.setContext('spreadsheet');
        }
        else {
            keyboardJS.setContext(this._previousKeyboardContext);
            this.$el.addClass('hidden');
        }

        if (now !== null) {

            let editor;
            let $editor;
            let old;
            let $old;

            if (prev !== null) {
                editor = this.editors[1];
                $editor = this.$$editors[1];
                old = this.editors[0];
                $old = this.$$editors[0];
                this.editors[1] = old;
                this.editors[0] = editor;
                this.$$editors[1] = $old;
                this.$$editors[0] = $editor;
            }
            else {
                editor = this.editors[0];
                $editor = this.$$editors[0];
                old = this.editors[1];
                $old = this.$$editors[1];
            }

            old.detach();

            this._update();

            editor.attach();

            if (prev !== null) {
                if (now < prev) {
                    $editor.addClass('inactive');
                    $editor.css('left', '-100%');
                    $old.css('left', '100%');
                    $old.css('opacity', 0);
                }
                else {
                    $editor.addClass('inactive');
                    $editor.css('left', '100%');
                    $old.css('left', '-100%');
                    $old.css('opacity', 0);
                }
                setTimeout(() => {
                    $editor.removeClass('inactive');
                    $editor.css('left', '0');
                    $editor.css('opacity', 1);
                }, 10);
            }
        }
    }
});

module.exports = VariableEditor;
