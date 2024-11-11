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
const focusLoop = require('../common/focusloop');


const VariableEditor = Backbone.View.extend({
    className: 'VariableEditor',
    initialize(options) {
        this.$el.empty();
        this.$el.addClass('jmv-variable-editor');
        focusLoop.applyShortcutOptions(this.$el[0], {
            key: 'Z',
            action: (event) => {
                setTimeout(() => {
                    focusLoop.enterFocusLoop(this.$el[0], { withMouse: false });
                }, 0);
            },
            position: { x: '25%', y: '25%' },
            label: _('Variable setup panel')
        });

        focusLoop.addFocusLoop(this.$el[0]);

        this.currentIds = null;

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

        this.$ok = $(`<button aria-label="${_('Ok')}" tabindex="0" class="jmv-variable-editor-ok jmv-tooltip" aria-label="${_('Hide variable setup')}"><span class="mif-checkmark"></span><span class="mif-arrow-up"></span></button>`).appendTo(this.$main);
        this.$right = $(`<button aria-label="${_('Next variable')}" tabindex="0" class="jmv-variable-editor-button-right  jmv-tooltip" aria-label="${_('Next variable')}"><span class="mif-chevron-right"></span></button>`).appendTo(this.$main);
        this.$left = $(`<button aria-label="${_('Previous variable')}" tabindex="0" class="jmv-variable-editor-button-left  jmv-tooltip" aria-label="${_('Previous variable')}"><span class="mif-chevron-left"></span></button>`).appendTo(this.$main);

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

        this.model.on('columnsChanged', event => {
            if (this.model.attributes.editingVar === null)
                return;
            let ids = this.model.attributes.editingVar;
            for (let changes of event.changes) {
                if (ids.includes(changes.id)) {
                    if (changes.deleted) {
                        this.model.set('editingVar', [-1], { silent: true });
                        this.currentIds = [-1];
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
                        this.currentIds = [-1];
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

        this._moveLeft = function(withMouse) {
            let colId = this.model.attributes.editingVar[0];
            let column = this.model.getColumnById(colId);

            let colNo = column.dIndex;
            if (this.selection.hiddenIncluded)
                colNo = column.index;

            colNo--;
            let newColumn = this.model.getColumn(colNo, ! this.selection.hiddenIncluded);
            if (newColumn)
                this.model.set('editingVar', [newColumn.id]);

            if ( ! withMouse) {
                setTimeout(() => {
                    this.$left[0].focus();
                }, 10);
            }
        };

        this.$left.on('click', event => {
            this._moveLeft(event.detail > 0);
        });

        this._moveRight = function(withMouse) {
            let colId = this.model.attributes.editingVar[0];
            let column = this.model.getColumnById(colId);
            let colNo = column.dIndex;
            if (this.selection.hiddenIncluded)
                colNo = column.index;

            colNo++;
            let newColumn = this.model.getColumn(colNo, ! this.selection.hiddenIncluded);
            if (newColumn)
                this.model.set('editingVar', [newColumn.id]);

            if ( ! withMouse) {
                setTimeout(() => {
                    this.$right[0].focus();
                }, 10);
            }
        };

        this.$right.on('click', event => {
            this._moveRight(event.detail > 0);
        });

        this.editorModel.on('change:changes', event => {
            if (this.$ok.hasClass('apply'))
                this.$ok.attr('title', _('Apply changes'));
            else
                this.$ok.attr('title', _('Hide'));
        });

        this.editorModel.on('notification', note => this.trigger('notification', note));

        this.$$editors = [
            $('<div style="left: 0;    opacity: 1; visibility: visible"></div>').prependTo(this.$main),
            $('<div style="left: 100%; opacity: 0; visibility: hidden"></div>').prependTo(this.$main)
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

        this.model.on('change:editingVar', event => {
            setTimeout(() => {
                this.prevIds = this.currentIds;
                this.currentIds = this.model.get('editingVar');
                this._hideEditor();
                this._editingVarChanged(event);
            }, 0);
        });

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
    setFocus() {
        if (this.editorPanel.isVisible())
            focusLoop.enterFocusLoop(this.editorPanel.$el[0], { withMouse: false });
        else
            focusLoop.enterFocusLoop(this.$el[0], { withMouse: false });
    },
    _editingVarChanged(event) {

        let prevIds = this.prevIds;
        let currentIds  = this.currentIds;

        if ((prevIds === null || currentIds === null) && prevIds !== currentIds)
            this.trigger('visibility-changing', prevIds === null && currentIds !== null);

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
        if (currentIds !== null) {
            this.commonColumn = this.model.getColumnById(currentIds[0]);
            if (this.commonColumn)
                now  = this.commonColumn.index;
            else
                now = null;
        }

        if (currentIds !== null && prevIds !== null) {
            let isSame = currentIds.length === prevIds.length && currentIds.every(a => { return prevIds.includes(a); });
            if (isSame)
                return;
        }

        if (currentIds === null) {
            this.$el.addClass('hidden');
            if (prevIds !== null)
                this.editors[0].detach();
            keyboardJS.setContext(this._previousKeyboardContext);
        }
        else {
            if (this.$el.hasClass('hidden')) {
                this.$el.removeClass('hidden');
                setTimeout(() => {
                    focusLoop.enterFocusLoop(this.$el[0], { withMouse: false });
                }, 100);
            }

            this.$left.toggleClass('hidden', now <= 0);

            this.$right.toggleClass('hidden', now >= this.model.attributes.vColumnCount - 1);

            this._previousKeyboardContext = keyboardJS.getContext();
            keyboardJS.setContext('controller');

            if (prevIds !== null && currentIds !== null && this.commonColumn) {
                if ((this.editorModel.get('columnType') === 'filter' && this.commonColumn.columnType === 'filter') ||
                    (this.editorModel.get('columnType') === this.commonColumn.columnType &&
                     (currentIds.length > 1 || (currentIds.length === 1 && prevIds.length > 1)) &&
                     ((currentIds.length > 1 && prevIds.length > 1) || (currentIds.length === 1 && prevIds.includes(currentIds[0])) || (prevIds.length === 1 && currentIds.includes(prevIds[0]))))) {
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
                let goLeft = now < prev || (now === prev && prevIds.length > currentIds.length);
                if (goLeft) {
                    $editor.addClass('inactive');
                    $editor.css('left', '-100%');
                    $old.css('left', '100%');
                    $old.css('opacity', 0);
                    $old.css('visibility', 'hidden');
                }
                else {
                    $editor.addClass('inactive');
                    $editor.css('left', '100%');
                    $old.css('left', '-100%');
                    $old.css('opacity', 0);
                    $old.css('visibility', 'hidden');
                }
                if (this._showId)
                    clearTimeout(this._showId);

                this._showId = setTimeout(() => {
                    $editor.removeClass('inactive');
                    $editor.css('left', '0');
                    $editor.css('opacity', 1);
                    $editor.css('visibility', 'visible');
                    this._showId = null;
                }, 10);
            }
        }
    }
});

module.exports = VariableEditor;
