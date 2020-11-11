
'use strict';

const $ = require('jquery');
const keyboardJS = require('keyboardjs');

const DataVarLevelWidget = function(level, model, i, readOnly) {

    this.readOnly = readOnly ? true : false;
    this.model = model;

    let diff = level.importValue !== level.label;
    this.index = i;
    this.$el = $('<div data-index="' + i + '" data-changed="' + diff + '" class="jmv-variable-editor-level"></div>');

    this.$value = $('<div class="jmv-variable-editor-level-value">' + level.importValue + '</div>').appendTo(this.$el);

    if (this.readOnly === false)
        this.$label = $('<input class="jmv-variable-editor-level-label" data-index="' + i + '" type="text" value="' + level.label + '" />').appendTo(this.$el);
    else
        this.$label = $('<div class="jmv-variable-editor-level-label">' + level.label + '</div>').appendTo(this.$el);

    if (this.readOnly)
        this.$label.addClass('read-only');

    this._keydown = event => {
        let keypressed = event.keyCode || event.which;
        if (keypressed === 13) { // enter key
            this.$label.blur();
            event.preventDefault();
            event.stopPropagation();
        }
        else if (keypressed === 27) { // escape key
            this.$label.blur();
            if (this.model.get('changes'))
                this.model.revert();
            event.preventDefault();
            event.stopPropagation();
        }
    };

    this._focus = event => {
        keyboardJS.pause('level');
        this.$label.select();
    };

    this._blur = event => {
        let label = this.$label.val();
        let level = this.model.editLevelLabel(this.index, label);
        let diff = level.importValue !== level.label;
        if (label !== level.label)
            this.$label.val(level.label);
        keyboardJS.resume('level');
        this.$el.removeClass('selected');
    };

    if ( ! this.readOnly) {
        this.$label.focus(this._focus);
        this.$label.blur(this._blur);
        this.$label.keydown(this._keydown);
    }

    this.updateLevel = function(level) {
        if (level.label === null)
            this.$label.attr('placeholder', 'change label...');
        else
            this.$label.attr('placeholder', '');

        this.$label.val(level.label);

        let diff = level.importValue !== level.label;
        this.$el.attr('data-changed', diff);

        this.$value.text(level.importValue);
    };
};

module.exports = DataVarLevelWidget;
