//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

const VariableEditor = Backbone.View.extend({
    className: "VariableEditor",
    initialize() {
        this.$el.empty();
        this.$el.addClass('silky-variable-editor');

        this.$main = $('<div class="silky-variable-editor-main"></div>').appendTo(this.$el);

        this.$ok = $('<div class="silky-variable-editor-ok"><span class="mif-checkmark"></span><span class="mif-arrow-up"></span></div>').appendTo(this.$main);
        this.$revert = $('<div class="silky-variable-editor-revert"><span class="mif-undo"></span></div>').appendTo(this.$main);
        this.$left = $('<div class="silky-variable-editor-button-left"><span class="mif-chevron-left"></span></div>').appendTo(this.$main);
        this.$right = $('<div class="silky-variable-editor-button-right"><span class="mif-chevron-right"></span></div>').appendTo(this.$main);

        this.editorModel = new VariableModel(this.model);

        this.model.on('columnsChanged', event => {
            if (this.model.attributes.editingVar === null)
                return;
            let column = this.model.attributes.columns[this.model.attributes.editingVar];
            for (let changes of event.changes) {
                if (changes.name === column.name) {
                    if (changes.measureTypeChanged || changes.levelsChanged)
                        this._update();
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

        this.$left.on('click', event => {
            let colNo = this.model.attributes.editingVar;
            colNo--;
            if (colNo >= 0)
                this.model.set('editingVar', colNo);
        });

        this.$right.on('click', event => {
            let colNo = this.model.attributes.editingVar;
            colNo++;
            if (colNo <= this.model.attributes.columnCount - 1)
                this.model.set('editingVar', colNo);
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
        this.editorModel.setup({
            name : column.name,
            measureType : column.measureType,
            autoMeasure : column.autoMeasure,
            levels : column.levels,
        });
    },
    _editingVarChanged(event) {
        let prev = this.model.previous('editingVar');
        let now  = event.changed.editingVar;

        if (now !== null) {
            this.$el.removeClass('hidden');
            this.$left.toggleClass('hidden', now <= 0);
            this.$right.toggleClass('hidden', now >= this.model.attributes.columnCount - 1);
        }
        else {
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

const VariableModel = Backbone.Model.extend({

    initialize(dataset) {
        this.dataset = dataset;
        this.original = { };

        this.on('change', event => {
            let changes = false;
            for (let name in this.original) {
                if ( ! _.isEqual(this.attributes[name], this.original[name])) {
                    changes = true;
                    break;
                }
            }
            this.set('changes', changes);
        });
    },
    defaults : {
        name : null,
        measureType : null,
        autoMeasure : false,
        levels : null,
        dps : 0,
        changes : false,
    },
    setup(dict) {
        this.original = dict;
        this.set(dict);
    },
    apply() {

        if (this.attributes.changes === false)
            return;

        let values = {
            name: this.attributes.name,
            measureType: this.attributes.measureType,
            autoMeasure: this.attributes.autoMeasure,
            levels: this.attributes.levels,
            dps: this.attributes.dps,
        };

        this.dataset.changeColumn(this.attributes.name, values);

        this.original = values;
        this.set(this.original);
        this.set('changes', false);
    },
    revert() {
        this.setup(this.original);
    }
});

const EditorWidget = Backbone.View.extend({
    className: "EditorWidget",
    initialize(args) {

        this.attached = true;

        this.$el.empty();
        this.$el.addClass('silky-variable-editor-widget');

        this.$title = $('<div class="silky-variable-editor-widget-title"></div>').appendTo(this.$el);
        this.$body = $('<div class="silky-variable-editor-widget-body"></div>').appendTo(this.$el);
        this.$left = $('<div class="silky-variable-editor-widget-left"></div>').appendTo(this.$body);
        this.$types = $('<div class="silky-variable-editor-widget-types"></div>').appendTo(this.$left);
        this.$autoType = $('<div class="silky-variable-editor-autotype">(auto adjusting)</div>').appendTo(this.$left);
        this.$levels = $('<div class="silky-variable-editor-levels"></div>').appendTo(this.$body);
        this.$levelItems = $();

        this.$move = $('<div class="silky-variable-editor-widget-move"></div>').appendTo(this.$body);
        this.$moveUp = $('<div class="silky-variable-editor-widget-move-up"><span class="mif-arrow-up"></span></div>').appendTo(this.$move);
        this.$moveDown = $('<div class="silky-variable-editor-widget-move-down"><span class="mif-arrow-down"></span></div>').appendTo(this.$move);

        this.$moveUp.on('click', event => this._moveUp());
        this.$moveDown.on('click', event => this._moveDown());
        this.selectedLevelIndex = -1;

        let options = [
            { label: 'Continuous',   measureType: 'continuous' },
            { label: 'Ordinal',      measureType: 'ordinal' },
            { label: 'Nominal',      measureType: 'nominal' },
            { label: 'Nominal Text', measureType: 'nominaltext' },
        ];

        this.resources = { };

        let unique = Math.random();

        let optionClicked = (event) => {
            this.model.set({ measureType: event.data, autoMeasure: false });
        };

        for (let option of options) {
            let measureType = option.measureType;
            let $option = $('<div   data-type="' + measureType + '" class="silky-variable-editor-widget-option">').appendTo(this.$types);
            let $input  = $('<input data-type="' + measureType + '" name="' + unique + '" type="radio">').appendTo($option);
            let $icon   = $('<div   data-type="' + measureType + '" class="silky-variable-editor-variable-type"></div>').appendTo($option);
            let $label  = $('<span>' + option.label + '</span>').appendTo($option);

            $option.on('click', null, measureType, optionClicked);

            this.resources[option.measureType] = { $option : $option, $input : $input };
        }

        this.$typesHighlight = $('<div class="silky-variable-editor-widget-types-highlight"></div>').appendTo(this.$types);

        this.model.on('change:name', event => {
            if ( ! this.attached)
                return;
            this.$title.text(event.changed.name);
        });
        this.model.on('change:measureType', event => this._setType(event.changed.measureType));
        this.model.on('change:levels',      event => this._setLevels(event.changed.levels));
        this.model.on('change:autoMeasure', event => this._setAutoMeasure(event.changed.autoMeasure));
    },
    _moveUp() {
        if (this.attached === false)
            return;
        if (this.model.attributes.measureType !== 'nominaltext')
            return;
        let index = this.selectedLevelIndex;
        if (index < 1)
            return;
        let levels = this.model.get('levels');
        let clone  = levels.slice(0);
        let item   = clone.splice(index, 1)[0];
        clone.splice(index - 1, 0, item);
        this.selectedLevelIndex--;
        this.model.set('levels', clone);
    },
    _moveDown() {
        if (this.attached === false)
            return;
        if (this.model.attributes.measureType !== 'nominaltext')
            return;
        let index = this.selectedLevelIndex;
        let levels = this.model.get('levels');
        if (index === -1 || index >= levels.length - 1)
            return;
        let clone  = levels.slice(0);
        let item   = clone.splice(index, 1)[0];
        clone.splice(index + 1, 0, item);
        this.selectedLevelIndex++;
        this.model.set('levels', clone);
    },
    _enableDisableMoveButtons() {
        if (this.model.attributes.measureType === 'nominaltext') {
            let levels = this.model.get('levels');
            let index  = this.selectedLevelIndex;
            this.$moveUp.toggleClass('disabled', index < 1);
            this.$moveDown.toggleClass('disabled', index >= levels.length - 1 || index === -1);
        }
        else {
            this.$moveUp.addClass('disabled');
            this.$moveDown.addClass('disabled');
        }
    },
    _setType(measureType) {
        if (this.attached) {
            for (let t in this.resources) {
                let $option = this.resources[t].$option;

                if (t === measureType) {
                    let $input  = this.resources[measureType].$input;
                    $input.prop('checked', true);
                    $option.addClass('selected');

                    let css = $option.position();
                    css.width = $option.width();
                    css.height = $option.height();

                    this.$typesHighlight.css(css);
                }
                else {
                    $option.removeClass('selected');
                }
            }
            this._enableDisableMoveButtons();
        }
    },
    _setLevels(levels) {
        if ( ! this.attached)
            return;
        this.$levelItems.off('click');
        this.$levels.empty();

        this.$moveUp.addClass('disabled');
        this.$moveDown.addClass('disabled');

        if (levels) {
            for (let i = 0; i < levels.length; i++) {
                let level = levels[i];
                let $level = $('<div data-index="' + i + '", class="silky-variable-editor-level">' + level.label + '</div>').appendTo(this.$levels);
                if (i === this.selectedLevelIndex)
                    $level.addClass('selected');
            }
        }

        this._enableDisableMoveButtons();

        this.$levelItems = this.$levels.find('.silky-variable-editor-level');
        this.$levelItems.on('click', event => {
            this.$levelItems.removeClass('selected');
            let $level = $(event.target);
            $level.addClass('selected');

            let index = this.$levelItems.index($level);
            this.selectedLevelIndex = index;
            this._enableDisableMoveButtons();
        });
    },
    _setAutoMeasure(auto) {
        if ( ! this.attached)
            return;
        if (auto)
            this.$autoType.show();
        else
            this.$autoType.hide();
    },
    detach() {
        this.model.apply();
        this.attached = false;
    },
    attach() {
        this.attached = true;
        this.selectedLevelIndex = -1;
        this.$title.text(this.model.get('name'));
        this._setType(this.model.get('measureType'));
        this._setAutoMeasure(this.model.get('autoMeasure'));
        this._setLevels(this.model.get('levels'));
    }
});

module.exports = VariableEditor;
