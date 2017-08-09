
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const DataVarWidget = Backbone.View.extend({
    className: 'DataVarWidget',
    initialize(args) {

        this.attached = true;

        this.$el.empty();
        this.$el.addClass('silky-variable-editor-datavarwidget');

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

        this.model.on('change:measureType', event => this._setType(event.changed.measureType));
        this.model.on('change:levels',      event => this._setLevels(event.changed.levels));
        this.model.on('change:autoMeasure', event => this._setAutoMeasure(event.changed.autoMeasure));
    },
    _moveUp() {
        if (this.attached === false)
            return;
        if (this.model.attributes.measureType === 'continuous')
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
        if (this.model.attributes.measureType === 'continuous')
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
        this._setType(this.model.get('measureType'));
        this._setAutoMeasure(this.model.get('autoMeasure'));
        this._setLevels(this.model.get('levels'));
    }
});

module.exports = DataVarWidget;
