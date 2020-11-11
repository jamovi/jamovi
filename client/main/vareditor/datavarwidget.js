
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const DataVarLevelWidget = require('./datavarlevelwidget');
const tarp = require('../utils/tarp');
const dropdown = require('./dropdown');
const MissingValueEditor = require('../editors/missingvalueeditor');
const keyboardJS = require('keyboardjs');
const MeasureList = require('./measurelist');

const DataVarWidget = Backbone.View.extend({
    className: 'DataVarWidget',
    initialize(args) {

        this.attached = false;

        dropdown.init();

        this.$el.empty();
        this.$el.addClass('jmv-variable-editor-datavarwidget');

        this.$body = $('<div class="jmv-datavarwidget-body"></div>').appendTo(this.$el);
        this.$left = $('<div class="jmv-variable-editor-widget-left"></div>').appendTo(this.$body);

        this._createMeasureTypeListBox();

        this.$dataType = $('<div class="jmv-vareditor-datatype"><label for="data-type">Data type</label></div>').appendTo(this.$left);
        this.$dataTypeList = $('<select id="data-type"><option value="integer">Integer</option><option value="decimal">Decimal</option><option value="text">Text</option></select>').appendTo(this.$dataType);
        this.$autoType = $('<div class="jmv-variable-editor-autotype">(auto)</div>').appendTo(this.$dataType);

        this.$dataTypeList.focus(() => {
            keyboardJS.pause('');
        } );

        this.$dataTypeList.blur(() => {
            keyboardJS.resume('');
        } );

        this._createMissingValuesCtrl();

        this.$levelsCrtl = $('<div class="jmv-variable-editor-levels-control"></div>').appendTo(this.$body);
        this.$levelsContainer = $('<div class="container"></div>').appendTo(this.$levelsCrtl);
        this.$levelsTitle = $('<div class="title">Levels</div>').appendTo(this.$levelsContainer);
        this.$levels = $('<div class="levels"></div>').appendTo(this.$levelsContainer);
        this.$levelItems = $();
        this.levelCtrls = [];

        this.$move = $('<div class="jmv-variable-editor-widget-move"></div>').appendTo(this.$levelsCrtl);
        this.$moveUp = $('<div class="jmv-variable-editor-widget-move-up"><span class="mif-arrow-up"></span></div>').appendTo(this.$move);
        this.$moveDown = $('<div class="jmv-variable-editor-widget-move-down"><span class="mif-arrow-down"></span></div>').appendTo(this.$move);

        $(window).on('keydown', event => {
            if (event.key === 'Escape' || event.key === 'Enter') {
                tarp.hide('levels');
            }
        });

        this.$moveUp.on('click', event => this._moveUp());
        this.$moveDown.on('click', event => this._moveDown());
        this.selectedLevelIndex = -1;

        this.$dataTypeList.on('change', (event) => {
            let dt = this.$dataTypeList.val();
            this.model.set({ dataType: dt, autoMeasure: false });
        });

        this.model.on('change:dataType',    event => this._setOptions(event.changed.dataType, this.model.get('measureType'), this.model.get('levels')));
        this.model.on('change:measureType', event => this._setOptions(this.model.get('dataType'), event.changed.measureType, this.model.get('levels')));
        this.model.on('change:levels',      event => this._setOptions(this.model.get('dataType'), this.model.get('measureType'), event.changed.levels));
        this.model.on('change:autoMeasure', event => this._setAutoMeasure(event.changed.autoMeasure));
        this.model.on('change:missingValues', event => this._setMissingValues(this.model.get('missingValues')));

        this.model.on('change:autoApply', event => {
            if (this.model.get('autoApply'))
                tarp.hide('levels');
        });
    },
    setParent(parent) {
        this.editorWidget = parent;
    },
    _setMissingValues(missings) {
        if ( ! this.attached)
            return;

        let label = '';
        //let missings = this.model.get('missingValues');
        if (missings !== null) {
            let c = 0;
            for (let i = 0; i < missings.length; i++) {
                let part = missings[i].trim();
                if (part.startsWith('==')) {
                    part = part.substring(2).trim();
                    if (part.startsWith('"') && part.endsWith('"'))
                        part = part.substring(1, part.length - 1);
                    else if (part.startsWith("'") && part.endsWith("'"))
                        part = part.substring(1, part.length - 1);
                }

                if (part !== '')
                    label = `${ label }<span>${ part }</span>`;
            }
        }
        this.$missingValueButton.find('.list').html(label);
    },
    _createMissingValuesCtrl() {
        this.missingValueEditor = new MissingValueEditor(this.model);
        this.$missingValueButton = $(`
            <div class="missing-values">
                <div class="label">Missing values</div>
                <div class="list" tabindex="0"></div>
            </div>`).appendTo(this.$left);
        let $list = this.$missingValueButton.find('.list');
        $list.on('click', () => {
            this.$el.trigger('edit:missing', this.missingValueEditor);
            keyboardJS.resume('');
        });

        $list.focus(() => {
            keyboardJS.pause('');
        } );

        $list.blur(() => {
            keyboardJS.resume('');
        } );

        $list.on('keypress', (event) => {
            if (event.key === 'Enter') {
                this.$el.trigger('edit:missing', this.missingValueEditor);
                event.preventDefault();
                event.stopPropagation();
            }
        });
    },
    _createMeasureTypeListBox() {
        this.$measureBox = $('<div class="measure-box"></div>').appendTo(this.$left);
        $('<div class="label">Measure type</div>').appendTo(this.$measureBox);
        this.$measureIcon = $('<div class="icon"></div>').appendTo(this.$measureBox);
        this.$measureList = $(`<select id="type">
                                    <option value="nominal">Nominal</option>
                                    <option value="ordinal">Ordinal</option>
                                    <option value="continuous">Continuous</option>
                                    <option value="id">ID</option>
                                </select>`).appendTo(this.$measureBox);
        this.$measureList.val('nominal');


        this.measureList = new MeasureList(false);
        this.$measureList.on('mousedown', (event) => {
            if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$measureList)
                dropdown.hide();
            else {
                this.measureList.setParent(this.$measureList);
                dropdown.show(this.$measureList, this.measureList);
            }
            event.preventDefault();
            event.stopPropagation();
            this.$measureList.focus();
        });

        this.measureList.$el.on('selected-measure-type', (event, measureType) => {
            this.model.set('measureType', measureType);
            dropdown.hide();
        });
        this.$measureIcon.attr('measure-type', this.model.get('measureType'));

        this.$measureList.focus(() => {
            keyboardJS.pause('');
        } );

        this.$measureList.blur(() => {
            keyboardJS.resume('');
        } );

        this.$measureList.on('change', event => {
            this.model.set('measureType', this.$measureList.val());
        });

        this.$measureList.on('keydown', event => {
            if (event.key === 'Enter') {
                if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$measureList)
                    dropdown.hide();
                else
                {
                    this.measureList.setParent(this.$measureList);
                    dropdown.show(this.$measureList, this.measureList);
                }
                event.preventDefault();
                event.stopPropagation();
                this.$measureList.focus();
            }
        });
    },
    _moveUp() {
        if (this.attached === false)
            return;
        if (this.model.attributes.measureType === 'continuous')
            return;
        if (this.model.attributes.ids !== null && this.model.attributes.ids.length > 1)
            return;
        let index = this.selectedLevelIndex;
        if (index < 1)
            return;

        this._focusLevelControls();

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
        if (this.model.attributes.measureType === 'continuous')
            return;
        if (this.model.attributes.ids !== null && this.model.attributes.ids.length > 1)
            return;
        let index = this.selectedLevelIndex;
        let levels = this.model.get('levels');
        if (index === -1 || index >= levels.length - 1)
            return;

        this._focusLevelControls();

        let clone  = levels.slice(0);
        let item   = clone.splice(index, 1)[0];
        clone.splice(index + 1, 0, item);
        this.selectedLevelIndex++;
        this.model.set('levels', clone);
    },
    _enableDisableMoveButtons() {
        if (this.model.attributes.measureType !== 'continuous' && this.model.attributes.ids !== null && this.model.attributes.ids.length === 1) {
            let levels = this.model.get('levels');
            let index  = this.selectedLevelIndex;
            this.$moveUp.toggleClass('disabled', levels === null || index < 1);
            this.$moveDown.toggleClass('disabled', levels === null || index >= levels.length - 1 || index === -1);
        }
        else {
            this.$moveUp.addClass('disabled');
            this.$moveDown.addClass('disabled');
        }
    },
    _focusLevelControls() {
        if (this.$levelsCrtl.hasClass('super-focus'))
            return;

        keyboardJS.pause();
        this.model.suspendAutoApply();
        this.$levelsCrtl.addClass('super-focus');
        tarp.show('levels', true, 0.1, 299).then(() => {
            keyboardJS.resume();
            this.$levelsCrtl.removeClass('super-focus');
            this.model.apply();
        }, () => {
            keyboardJS.resume();
            this.$levelsCrtl.removeClass('super-focus');
            this.model.apply();
        });
    },
    _setOptions(dataType, measureType, levels) {
        if ( ! this.attached)
            return;

        this.$dataTypeList.val(dataType);
        this.$measureIcon.attr('measure-type', measureType);
        this.$measureList.val(measureType);

        if (levels === null || levels.length === 0) {
            this.$levels.empty();
            this.levelCtrls = [];
        }
        else if (this.levelCtrls.length > levels.length) {
            for (let i = levels.length; i < this.$levelItems.length; i++)
                this.$levelItems[i].remove();
            this.levelCtrls.splice(levels.length, this.levelCtrls.length - levels.length);
        }

        this.$moveUp.addClass('disabled');
        this.$moveDown.addClass('disabled');

        if (levels) {

            let _clickCallback = event => {
                this._focusLevelControls();
                this.$levelItems.removeClass('selected');
                let $level = $(event.delegateTarget);
                $level.addClass('selected');

                let index = this.$levelItems.index($level);
                this.selectedLevelIndex = index;
                this._enableDisableMoveButtons();
            };

            if (this.selectedLevelIndex >= levels.length)
                this.selectedLevelIndex = -1;

            if (this.selectedLevelIndex !== -1 && levels[this.selectedLevelIndex].label === null)
                this.selectedLevelIndex = -1;

            this.$levelItems.removeClass('selected');
            for (let i = 0; i < levels.length; i++) {
                let level = levels[i];
                let levelCtrl = null;
                if (i >= this.levelCtrls.length) {
                    levelCtrl = new DataVarLevelWidget(level, this.model, i);

                    this.$levels.append(levelCtrl.$el);
                    this.levelCtrls.push(levelCtrl);

                    levelCtrl.$el.on('click', _clickCallback);
                }
                else {
                    levelCtrl = this.levelCtrls[i];
                    levelCtrl.updateLevel(level);
                }

                if (i === this.selectedLevelIndex)
                    levelCtrl.$el.addClass('selected');
            }
        }

        this.$levelItems = this.$levels.find('.jmv-variable-editor-level');

        this._enableDisableMoveButtons();
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
        if ( ! this.attached)
            return;

        this.attached = false;
    },
    attach() {
        this.attached = true;

        this.selectedLevelIndex = -1;
        this._setAutoMeasure(this.model.get('autoMeasure'));
        this._setOptions(
            this.model.get('dataType'),
            this.model.get('measureType'),
            this.model.get('levels'));
        this._setMissingValues(this.model.get('missingValues'));
    }
});

module.exports = DataVarWidget;
