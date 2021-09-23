
'use strict';

const $ = require('jquery');
const keyboardJS = require('keyboardjs');

const DataVarLevelWidget = function(level, model, i, readOnly) {

    this.readOnly = readOnly ? true : false;
    this.model = model;

    let diff = level.importValue !== level.label;
    this.index = i;
    this.$el = $('<div data-index="' + i + '" data-changed="' + diff + '" class="jmv-variable-editor-level"></div>');

    if (level.pinned)
        this.$el.addClass('pinned');

    this.$pin = $('<div class="pin" title="Pin level"></div>').appendTo(this.$el);
    this.$pin.on('click', () => {
        setTimeout(() => { // delay so that the parent control click can suspend applying the settings
            let level = null;
            if (this.$el.hasClass('pinned'))
                level = this.model.editLevelPinned(this.index, false);
            else
                level = this.model.editLevelPinned(this.index, true);
            this.updateLevel(level);
        }, 0);

    });
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
        this.updateLevel(level);
        keyboardJS.resume('level');
        this.$el.removeClass('selected');
    };

    if ( ! this.readOnly) {
        this.$label.focus(this._focus);
        this.$label.blur(this._blur);
        this.$label.keydown(this._keydown);
    }

    this.updateLevel = function(level) {

        let levels = [level, ...level.others];
        let labels = [...new Set(levels.map(level => level.label))];
        let imports = [...new Set(levels.map(level => level.importValue))];
        let clash = levels.length > 1 && (labels.length > 1 || labels[0] === null);
        let isNew = level.importValue === null;
        let pinned = level.pinnedChanged ? level.pinned : ! levels.find(element => element.pinned === false);

        if (pinned)
            this.$el.addClass('pinned');
        else
            this.$el.removeClass('pinned');

        let label = labels.join(', ');
        if (isNew)
            this.$label.attr('placeholder', label ? label : _("Enter label..."));
        else if (clash)
            this.$label.attr('placeholder', label ? label : _("change label..."));
        else
            this.$label.attr('placeholder', '');

        if (clash && level.modified === false)
            this.$label.val('');
        else
            this.$label.val(labels[0]);

        let importValue = imports.join(', ');
        if (this.model._compareWithValue) {
            importValue = level.value.toString();
        }

        let diff = importValue !== label;
        this.$el.attr('data-changed', diff);

        let subtext = importValue;

        this.$value.text(subtext);

    };

    this.updateLevel(level);
};

module.exports = DataVarLevelWidget;
