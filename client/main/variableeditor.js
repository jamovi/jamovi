//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const keyboardJS = require('keyboardjs');

const VariableModel = require('./vareditor/variablemodel');
const EditorWidget = require('./vareditor/editorwidget');
const EditorPanel = require('./editorpanel');
const TransformEditor = require('./editors/transformeditor');


const VariableEditor = Backbone.View.extend({
    className: 'VariableEditor',
    initialize(options) {
        this.$el.empty();
        this.$el.addClass('jmv-variable-editor');

        this._showId = null;

        this.controller = options.controller;
        this.selection = this.controller.selection;

        this.$main = $('<div class="jmv-variable-editor-main" data-type="none"></div>').appendTo(this.$el);

        this.$stageEditor = $('<div id="import-editor" class="hidden"></div>').appendTo(this.$el);
        this.$stageEditor.on('editor:hidden', (event) => {
            this.$stageEditor.outerHeight(0);
            this.$hoverHeader.outerHeight(0);
            this.transformEditor.setTransformId(null);
            this.$el.removeClass('sub-editor-open');
        });
        this.$stageEditor.on('editor:visible', (event) => {
            let h = this.currentEditor.$labelBox.outerHeight(true) + this.currentEditor.$labelBox.position().top + parseFloat(this.currentEditor.$title.css('margin-top'));
            this.$hoverHeader.outerHeight(h);
            this.$stageEditor.outerHeight(this.$el.innerHeight() - h);
            this.$el.addClass('sub-editor-open');
        });

        this.editorPanel = new EditorPanel({ el : this.$stageEditor[0], model : this.model });
        this.editorPanel.on('notification', note => this.trigger('notification', note));
        this.transformEditor = new TransformEditor(this.model);

        this.$ok = $(`<div class="jmv-variable-editor-ok jmv-tooltip" title="${_('Hide')}"><span class="mif-checkmark"></span><span class="mif-arrow-up"></span></div>`).appendTo(this.$main);
        this.$revert = $(`<div class="jmv-variable-editor-revert jmv-tooltip" title="${_('Revert changes')}"><span class="mif-undo"></span></div>`).appendTo(this.$main);
        this.$left = $(`<div class="jmv-variable-editor-button-left  jmv-tooltip" title="${_('Previous variable')}"><span class="mif-chevron-left"></span></div>`).appendTo(this.$main);
        this.$right = $(`<div class="jmv-variable-editor-button-right  jmv-tooltip" title="${_('Next variable')}"><span class="mif-chevron-right"></span></div>`).appendTo(this.$main);

        this.$hoverHeader = $('<div class="hover-header"></div>').appendTo(this.$el);
        this.$hoverHeader.on('mouseout', event => {
            this.$el.removeClass('hover');
        });
        this.$hoverHeader.on('mouseenter', event => {
            this.$el.addClass('hover');
        });
        this.$hoverHeader.on('click', event => {
            this._hideEditor();
        });

        this.editorModel = new VariableModel(this.model);

        this._keyboardListener = function(event) {
            if (event.metaKey || event.ctrlKey || event.altKey)
                return;

            switch(event.key) {
                case 'ArrowUp':
                case 'ArrowDown':
                case 'Enter':
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
        keyboardJS.setContext('controller');
        keyboardJS.bind('', event => this._keyboardListener(event));
        keyboardJS.setContext(this._previousKeyboardContext);


        this.model.on('change:editingVar', event => {
            this._hideEditor();
        });

        this.model.on('columnsChanged', event => {
            if (this.model.attributes.editingVar === null)
                return;
            let ids = this.model.attributes.editingVar;
            for (let changes of event.changes) {
                if (ids.includes(changes.id)) {
                    if (changes.deleted) {
                        this.model.set('editingVar', [-1], { silent: true });
                        let newColumn = this.model.getColumn(changes.dIndex, true);
                        let index = ids.indexOf(changes.id);
                        ids.splice(index, 1);
                        if (newColumn)
                            ids.splice(index, 0, newColumn.id);
                        this.model.set('editingVar', ids);
                        this._update();
                    }
                    else if (changes.columnTypeChanged) {
                        this.model.set('editingVar', [-1], { silent: true });
                        this.model.set('editingVar', ids);
                        this._update();
                    }
                    else if (changes.measureTypeChanged || changes.dataTypeChanged || changes.levelsChanged || changes.nameChanged) {
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
            let colId = this.model.attributes.editingVar[0];
            let column = this.model.getColumnById(colId);

            let colNo = column.dIndex;
            if (this.selection.hiddenIncluded)
                colNo = column.index;

            colNo--;
            let newColumn = this.model.getColumn(colNo, ! this.selection.hiddenIncluded);
            if (newColumn)
                this.model.set('editingVar', [newColumn.id]);
        };

        this.$left.on('click', event => {
            this._moveLeft();
        });

        this._moveRight = function() {
            let colId = this.model.attributes.editingVar[0];
            let column = this.model.getColumnById(colId);
            let colNo = column.dIndex;
            if (this.selection.hiddenIncluded)
                colNo = column.index;

            colNo++;
            let newColumn = this.model.getColumn(colNo, ! this.selection.hiddenIncluded);
            if (newColumn)
                this.model.set('editingVar', [newColumn.id]);
        };

        this.$right.on('click', event => {
            this._moveRight();
        });

        this.editorModel.on('change:changes', event => {
            if (this.$ok.hasClass('apply'))
                this.$ok.attr('title', _('Apply changes'));
            else
                this.$ok.attr('title', _('Hide'));
        });

        this.editorModel.on('notification', note => this.trigger('notification', note));

        this.$$editors = [
            $('<div style="left: 0;    opacity: 1;"></div>').prependTo(this.$main),
            $('<div style="left: 100%; opacity: 0;"></div>').prependTo(this.$main)
        ];

        this.editors = [
            new EditorWidget({ el : this.$$editors[0], model : this.editorModel }),
            new EditorWidget({ el : this.$$editors[1], model : this.editorModel })
        ];

        this.editors[0].on('notification', note => this.trigger('notification', note));
        this.editors[1].on('notification', note => this.trigger('notification', note));

        for (let widget of this.editors) {
            widget.$el.on('edit:transform', (event, transformId) => {
                this._showTransformEditor(transformId);
            });
            widget.$el.on('edit:missing', (event, variableId) => {
                this._showEditor(variableId);
            });
        }

        this.model.on('change:editingVar', event => this._editingVarChanged(event));
    },
    _showTransformEditor(transformId) {
        if (this.transformEditor.transformId() !== transformId) {
            this.transformEditor.setTransformId(transformId);
            let editingVar = this.model.get('editingVar');
            this.editorPanel.attach(this.transformEditor);
        }
    },
    _showEditor(editor) {
        this.editorPanel.attach(editor);
        if (editor.refresh)
            editor.refresh();
    },
    _hideEditor() {
        this.editorPanel.attach(null);
    },
    _update() {
        if (this.commonColumn) {
            this.$main.attr('data-type', this.commonColumn.columnType);
            this.editorModel.setColumn(this.model.attributes.editingVar, this.commonColumn.columnType);
        }
    },
    _editingVarChanged(event) {

        let prevIds = this.model.previous('editingVar');
        let nowIds  = this.model.get('editingVar');

        if ((prevIds === null || nowIds === null) && prevIds !== nowIds)
            this.trigger('visibility-changing', prevIds === null && nowIds !== null);

        let prev = null;
        let now  = null;

        if (prevIds !== null) {
            let prevColumn = this.model.getColumnById(prevIds[0]);
            if (prevColumn)
                prev = prevColumn.index;
            else
                prev = null;
        }

        this.commonColumn = null;
        if (nowIds !== null) {
            this.commonColumn = this.model.getColumnById(nowIds[0]);
            if (this.commonColumn)
                now  = this.commonColumn.index;
            else
                now = null;
        }

        if (nowIds !== null && prevIds !== null) {
            let isSame = nowIds.length === prevIds.length && nowIds.every(a => { return prevIds.includes(a); });
            if (isSame)
                return;
        }

        if (nowIds === null) {
            this.$el.addClass('hidden');
            if (prevIds !== null)
                this.editors[0].detach();
            keyboardJS.setContext(this._previousKeyboardContext);
        }
        else {
            this.$el.removeClass('hidden');
            this.$left.toggleClass('hidden', now <= 0);

            this.$right.toggleClass('hidden', now >= this.model.attributes.vColumnCount - 1);

            this._previousKeyboardContext = keyboardJS.getContext();
            keyboardJS.setContext('controller');

            if (prevIds !== null && nowIds !== null) {
                if ((this.editorModel.get('columnType') === 'filter' && this.commonColumn.columnType === 'filter') ||
                    (this.editorModel.get('columnType') === this.commonColumn.columnType &&
                     (nowIds.length > 1 || (nowIds.length === 1 && prevIds.length > 1)) &&
                     ((nowIds.length > 1 && prevIds.length > 1) || (nowIds.length === 1 && prevIds.includes(nowIds[0])) || (prevIds.length === 1 && nowIds.includes(prevIds[0]))))) {
                    this._update();
                    this.editors[0].update();
                    return;
                }
            }

            let editor;
            let $editor;
            let old;
            let $old;

            if (prevIds !== null) {
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
            this.currentEditor = editor;

            if (prevIds !== null) {
                let goLeft = now < prev || (now === prev && prevIds.length > nowIds.length);
                if (goLeft) {
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
