//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const keyboardJS = require('keyboardjs');
const tippy = require('tippy.js');

const VariableModel = require('./vareditor/variablemodel');
const EditorWidget = require('./vareditor/editorwidget');

const VariableEditor = Backbone.View.extend({
    className: 'VariableEditor',
    initialize() {
        this.$el.empty();
        this.$el.addClass('jmv-variable-editor');

        this._showId = null;

        this.$main = $('<div class="jmv-variable-editor-main" data-type="none"></div>').appendTo(this.$el);

        this.$ok = $('<div class="jmv-variable-editor-ok jmv-tooltip" data-tippy-dynamictitle="true" title="Hide"><span class="mif-checkmark"></span><span class="mif-arrow-up"></span></div>').appendTo(this.$main);
        this.$revert = $('<div class="jmv-variable-editor-revert jmv-tooltip" title="Revert changes"><span class="mif-undo"></span></div>').appendTo(this.$main);
        this.$left = $('<div class="jmv-variable-editor-button-left  jmv-tooltip" title="Previous variable" data-tippy-placement="left"><span class="mif-chevron-left"></span></div>').appendTo(this.$main);
        this.$right = $('<div class="jmv-variable-editor-button-right  jmv-tooltip" title="Next variable"><span class="mif-chevron-right"></span></div>').appendTo(this.$main);

        tippy('.jmv-tooltip', {
          placement: 'right',
          animation: 'perspective',
          duration: 200,
          delay: 700,
          flip: true,
          theme: 'jmv'
        });
        this.$revert[0]._tippy.disable();

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

            this.$ok[0]._tippy.hide();
            this.$ok[0]._tippy.disable();
        });

        this.$ok.on('mouseout', event => {
            this.$ok[0]._tippy.enable();
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

            this.$left[0]._tippy.hide();
            this.$left[0]._tippy.disable();
        });

        this.$left.on('mouseout', event => {
            this.$left[0]._tippy.enable();
        });

        this._moveRight = function() {
            let colNo = this.model.attributes.editingVar;
            colNo++;
            if (colNo <= this.model.attributes.vColumnCount - 1)
                this.model.set('editingVar', colNo);
        };

        this.$right.on('click', event => {
            this._moveRight();

            this.$right[0]._tippy.hide();
            this.$right[0]._tippy.disable();
        });

        this.$right.on('mouseout', event => {
            this.$right[0]._tippy.enable();
        });

        this.editorModel.on('change:changes', event => {
            this.$ok.toggleClass('apply', event.changed.changed);
            this.$revert.toggleClass('apply', event.changed.changed);

            if (this.$ok.hasClass('apply'))
                this.$ok.attr('title', 'Apply changes');
            else
                this.$ok.attr('title', 'Hide');

            if (this.$revert.hasClass('apply'))
                this.$revert[0]._tippy.enable();
            else {
                this.$revert[0]._tippy.hide();
                this.$revert[0]._tippy.disable();
            }
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
        let columnIndex = this.model.attributes.editingVar;
        let column = this.model.attributes.columns[columnIndex];
        this.$main.attr('data-type', column.columnType);
        this.editorModel.setColumn(column.id);
    },
    _editingVarChanged(event) {

        let prev = this.model.previous('editingVar');
        let now  = this.model.get('editingVar');

        if ((prev === null || now === null) && prev !== now)
            this.trigger('visibility-changing', prev === null && now !== null);

        if (now === null) {
            this.$el.addClass('hidden');
            if (prev !== null)
                this.editors[0].detach();
            keyboardJS.setContext(this._previousKeyboardContext);
        }
        else {
            this.$el.removeClass('hidden');
            this.$left.toggleClass('hidden', now <= 0);
            if (this.$left.hasClass('hidden'))
            {
                this.$left[0]._tippy.hide();
                this.$left[0]._tippy.disable();
            }
            else
                this.$left[0]._tippy.enable();

            this.$right.toggleClass('hidden', now >= this.model.attributes.vColumnCount - 1);
            if (this.$right.hasClass('hidden'))
            {
                this.$right[0]._tippy.hide();
                this.$right[0]._tippy.disable();
            }
            else
                this.$right[0]._tippy.enable();

            this._previousKeyboardContext = keyboardJS.getContext();
            keyboardJS.setContext('spreadsheet');

            if (prev !== null && now !== null) {
                let nowColumn = this.model.getColumn(now);
                if (this.editorModel.get('columnType') === 'filter' && nowColumn.columnType === 'filter') {
                    this._update();
                    this.editors[0].update();
                    return;
                }
            }

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
                if (this._showId !== null)
                    clearTimeout(this._showId);

                this._showId = setTimeout(() => {
                    $editor.removeClass('inactive');
                    $editor.css('left', '0');
                    $editor.css('opacity', 1);
                    this._showId = null;
                }, 10);
            }
        }
    }
});

module.exports = VariableEditor;
