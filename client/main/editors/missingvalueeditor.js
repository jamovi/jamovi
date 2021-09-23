'use strict';

const $ = require('jquery');
const keyboardJS = require('keyboardjs');
const tarp = require('../utils/tarp');
const MissingValueList = require('../vareditor/missingvaluelist');


const MissingValueEditor = function(model) {

    this.model = model;
    this.$el = $('<div class="jmv-missing-value-editor"></div>');

    this.title = _('Missing Values');
    this._id = -1;

    this.refresh = function() {
        this.missingValueList.populate(this.model.get('missingValues'));
        this.missingValueList.$el.find('add-missing-value').focus();
    };

    this.isAttached = function() {
        return document.contains(this.$el[0]);
    };

    this._focusFormulaControls = function() {
        let $contents = this.missingValueList.$el;

        if ($contents.hasClass('super-focus'))
            return;

        this._undoFormula = this.model.get('missingValues');

        keyboardJS.pause();
        this.model.suspendAutoApply();
        $contents.addClass('super-focus');
        tarp.show('missings', true, 0.1, 299).then(() => {
            $contents.removeClass('super-focus');
            this.model.apply();
            keyboardJS.resume();
        }, () => {
            $contents.removeClass('super-focus');
            this.model.apply();
            keyboardJS.resume();
        });
    };

    $(window).on('keydown', event => {
        if ( ! this.missingValueList.$el.hasClass('super-focus'))
            return;

        let undo = event.key === 'Escape';
        if (event.key === 'Escape' || event.key === 'Enter') {
            if (undo)
                this.model.set('missingValues', this._undoFormula);

            tarp.hide('missings');
        }
    });

    this._init = function() {
        this.$contents = $('<div class="contents"></div>').appendTo(this.$el);

        this.missingValueList = new MissingValueList();
        this.$contents.append(this.missingValueList.$el);

        this.missingValueList.$el.find('add-missing-value').focus();

        this.missingValueList.$el.on('missing-value-removed', (event, index) => {
            this._focusFormulaControls();
            let values = this.model.get('missingValues');
            let newValues = [];
            if (values !== null) {
                for (let i = 0; i < values.length; i++) {
                    if (i !== index)
                        newValues.push(values[i]);
                }
            }
            this._internalChange = true;
            this.model.set('missingValues', newValues);
        });

        this.missingValueList.$el.on('missing-values-changed', (event, index) => {
            this._focusFormulaControls();
            this._internalChange = true;
            this.model.set('missingValues', this.missingValueList.getValue());
        });

        this.missingValueList.$el.on('click', (event) => {
            this._focusFormulaControls();
        });

        this.missingValueList.populate(this.model.get('missingValues'));

        this.model.on('change:missingValues', event => {
            if (this._internalChange) {
                this._internalChange = false;
                return;
            }

            if (this.isAttached())
                this.missingValueList.populate(this.model.get('missingValues'));
        });

        this.model.on('change:id', event => {
            if (this.isAttached())
                this.missingValueList.populate(this.model.get('missingValues'));
        });

        this.model.on('change:autoApply', event => {
            if (this.isAttached() && this.model.get('autoApply'))
                tarp.hide('missings');
        });
    };

    this._init();
};

module.exports = MissingValueEditor;
