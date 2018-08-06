
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const DataVarLevelWidget = require('./datavarlevelwidget');
const tarp = require('../utils/tarp');
const dropdown = require('./dropdown');
const TransformList = require('./transformlist');

const DataVarWidget = Backbone.View.extend({
    className: 'DataVarWidget',
    initialize(args) {

        this.attached = false;

        dropdown.init();

        this.$el.empty();
        this.$el.addClass('jmv-variable-editor-datavarwidget');

        this.$body = $('<div class="jmv-variable-editor-widget-body"></div>').appendTo(this.$el);
        this.$left = $('<div class="jmv-variable-editor-widget-left"></div>').appendTo(this.$body);

        this.$types = $('<div class="jmv-variable-editor-widget-types"></div>').appendTo(this.$left);
        this.$dataType = $('<div class="jmv-vareditor-datatype"><label for="data-type">Data type</label></div>').appendTo(this.$left);
        this.$dataTypeList = $('<select id="data-type"><option value="integer">Integer</option><option value="decimal">Decimal</option><option value="text">Text</option></select>').appendTo(this.$dataType);
        this.$transform = $('<div class="jmv-vareditor-transform"><label for="data-type">Transform</label></div>').appendTo(this.$left);
        this.$transformList = $('<select id="transform-type"><option value="None">None</option></select>').appendTo(this.$transform);
        this.$autoType = $('<div class="jmv-variable-editor-autotype">(auto adjusting)</div>').appendTo(this.$left);

        this.$levelsCrtl = $('<div class="jmv-variable-editor-levels-control"></div>').appendTo(this.$body);
        this.$levelsContainer = $('<div class="jmv-variable-editor-levels-container"></div>').appendTo(this.$levelsCrtl);
        this.$levelsTitle = $('<div class="jmv-variable-editor-levels-title">Levels</div>').appendTo(this.$levelsContainer);
        this.$levels = $('<div class="jmv-variable-editor-levels"></div>').appendTo(this.$levelsContainer);
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

        this.transformList = new TransformList(this.model.dataset);
        this.$transformList.on('mousedown', (event) => {
            dropdown.show(this.$transformList, this.transformList);
            event.preventDefault();
            event.stopPropagation();
            this.$transformList.focus();
        });

        this.transformList.$el.on('selected-transform', (event, transform) => {
            let dataset = this.model.dataset;
            this.model.set('transform', transform.id);
            dropdown.hide();
        });

        this.transformList.$el.on('edit-transform', (event, transform) => {
            let dataset = this.model.dataset;
            dataset.set('editingTrans', transform.id);
            dropdown.hide();
        });

        this.transformList.$el.on('remove-transform', (event, transform) => {
            let dataset = this.model.dataset;
            dataset.removeTransforms([transform.id]);
            let transformId = this.model.get('transform');
            if (transformId === transform.id)
                this.model.set('transform', 0);
        });

        this.transformList.$el.on('create-transform', (event) => {
            let dataset = this.model.dataset;
            dataset.setTransforms([ { id: 0, values: { description: '', formula: '' } } ]).then(() => {
                this.$el.trigger('transform-selected');
                let transforms = dataset.get('transforms');
                let transformId = transforms[transforms.length - 1].id;
                this.model.set('transform', transformId);
                dataset.set('editingTrans', transformId);
            }).then(() => {
                dropdown.hide();
            });
        });


        this.$moveUp.on('click', event => this._moveUp());
        this.$moveDown.on('click', event => this._moveDown());
        this.selectedLevelIndex = -1;

        this.$dataTypeList.on('change', (event) => {
            let dt = this.$dataTypeList.val();
            this.model.set({ dataType: dt, autoMeasure: false });
        });

        let options = [
            { label: 'Continuous',   measureType: 'continuous' },
            { label: 'Ordinal',      measureType: 'ordinal' },
            { label: 'Nominal',      measureType: 'nominal' },
        ];

        this.resources = { };

        let unique = Math.random();

        let optionClicked = (event) => {
            this.model.set({ measureType: event.data, autoMeasure: false });
        };

        for (let option of options) {
            let measureType = option.measureType;
            let $option = $('<div   data-type="' + measureType + '" class="jmv-variable-editor-widget-option">').appendTo(this.$types);
            let $input  = $('<input data-type="' + measureType + '" name="' + unique + '" type="radio">').appendTo($option);
            let $icon   = $('<div   data-type="' + measureType + '" class="jmv-variable-editor-variable-type"></div>').appendTo($option);
            let $label  = $('<span>' + option.label + '</span>').appendTo($option);

            $option.on('click', null, measureType, optionClicked);

            this.resources[option.measureType] = { $option : $option, $input : $input };
        }

        this.$typesHighlight = $('<div class="jmv-variable-editor-widget-types-highlight"></div>').appendTo(this.$types);

        this.model.on('change:dataType',    event => this._setOptions(event.changed.dataType, this.model.get('measureType'), this.model.get('levels')));
        this.model.on('change:measureType', event => this._setOptions(this.model.get('dataType'), event.changed.measureType, this.model.get('levels')));
        this.model.on('change:levels',      event => this._setOptions(this.model.get('dataType'), this.model.get('measureType'), event.changed.levels));
        this.model.on('change:autoMeasure', event => this._setAutoMeasure(event.changed.autoMeasure));
        this.model.on('change:description', event => this._updateHighlightPosition());
        this.model.on('change:transform', event => {
            if (this.attached === false)
                return;

            let transformId = this.model.get('transform');
            if (transformId === null || transformId === 0)
                this.$transformList.val('None');
            else {
                let transform = this.model.dataset.getTransformById(transformId);
                if (transform ===undefined)
                    this.$transformList.val('None');
                else
                    this.$transformList.val(transform.name);
            }
        });

        this.model.dataset.on('transformsChanged', this._updateTransformList, this);
        this.model.dataset.on('dataSetLoaded', this._updateTransformList, this);

        this.model.on('change:autoApply', event => {
            if (this.model.get('autoApply'))
                tarp.hide('levels');
        });
    },
    _updateTransformList() {
        if (this.attached === false)
            return;

        let transforms = this.model.dataset.get('transforms');
        this.transformList.populate(transforms);

        this.$transformList.empty();
        this.$transformList.append('<option value="None">None</option>');
        for (let transform of transforms)
            this.$transformList.append('<option value="' + transform.name + '">' + transform.name + '</option>');

        let transformId = this.model.get('transform');
        if (transformId === null || transformId === 0)
            this.$transformList.val('None');
        else {
            let transform = this.model.dataset.getTransformById(transformId);
            if (transform ===undefined)
                this.$transformList.val('None');
            else
                this.$transformList.val(transform.name);
        }
    },
    _moveUp() {
        if (this.attached === false)
            return;
        if (this.model.attributes.measureType === 'continuous')
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
        if (this.model.attributes.measureType !== 'continuous') {
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
    _updateHighlightPosition() {
        let resource = this.resources[this.model.get('measureType')];
        if (resource) {
            let $option = resource.$option;
            if ($option) {
                let css = $option.position();
                css.width = $option.width();
                css.height = $option.height();
                this.$typesHighlight.css(css);
            }
        }
    },
    _focusLevelControls() {
        this.model.suspendAutoApply();
        this.$levelsCrtl.addClass('super-focus');
        tarp.show('levels', true, 0.1, 299).then(() => {
            this.$levelsCrtl.removeClass('super-focus');
            this.model.apply();
        }, () => {
            this.$levelsCrtl.removeClass('super-focus');
            this.model.apply();
        });
    },
    _setOptions(dataType, measureType, levels) {
        if ( ! this.attached)
            return;

        this.$dataTypeList.val(dataType);

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

        if (levels.length === 0) {
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
        this.model.apply();
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
        this._updateTransformList();
    }
});

module.exports = DataVarWidget;
