
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const formulaToolbar = require('./formulatoolbar');

const keyboardJS = require('keyboardjs');

function insertText(el, newText, cursorOffset = 0) {

    let sel = window.getSelection();
    let range = sel.getRangeAt(0);
    let start = range.startOffset;
    let end = range.endOffset;
    let text = el.textContent;
    let before = text.substring(0, start);
    let after  = text.substring(end, text.length);

    if (cursorOffset === -1 && start !== end) {
        let textSelected = text.substring(start, end);
        el.textContent = (before + newText.substring(0, newText.length - 2) + '(' + textSelected + ')' + after);
        sel.setBaseAndExtent(el.firstChild, start + newText.length + cursorOffset, el.firstChild, start + newText.length + textSelected.length + cursorOffset);
    } else {

        if (cursorOffset !== -1 && newText.search(/[ ~!@#$%^&*\+\-\=()\[\]{};,<>?/\\]/) !== -1)
            newText = '\`' + newText + '\`';

        el.textContent = (before + newText + after);
        sel.setBaseAndExtent(el.firstChild, start + newText.length + cursorOffset, el.firstChild, start + newText.length + cursorOffset);
    }
    el.focus();
}

function insertInto(open, close, input){
    let val = input.textContent, s = input.selectionStart, e = input.selectionEnd;
    if (e==s) {
        input.textContent = val.slice(0,e) + open + close + val.slice(e);
        input.selectionStart += close.length;
        input.selectionEnd = e + close.length;
    } else {
        input.textContent = val.slice(0,s) + open + val.slice(s,e) + close + val.slice(e);
        input.selectionStart += close.length + 1;
        input.selectionEnd = e + close.length;
    }
}

const ComputedVarWidget = Backbone.View.extend({
    className: 'ComputedVarWidget',
    initialize(args) {

        this.attached = false;

        formulaToolbar.init(this.model.dataset);

        this.$el.empty();
        this.$el.addClass('jmv-variable-computed-widget');

        this.$methods = $('<div class="jmv-variable-computed-methods"></div>').appendTo(this.$el);

        this.$top = $('<div class="top"></div>').appendTo(this.$methods);
        this.$top.append($('<div class="item">Formula</div>'));

        this.$methods.append($('<div class="separator"></div>'));

        this.$bottom = $('<div class="bottom"></div>').appendTo(this.$methods);

        this.$options = $('<div class="jmv-variable-computed-options"></div>').appendTo(this.$el);
        this.$formulaBox = $('<div class="formula-box"></div>').appendTo(this.$options);
        this.$equal = $('<div class="equal">=</div>').appendTo(this.$formulaBox);
        this.$formula = $('<div class="formula" type="text" placeholder="Type formula here\u2026"></div>').appendTo(this.$formulaBox);
        this.$formulaMessageBox = $('<div class="formulaMessageBox""></div>').appendTo(this.$formulaBox);
        this.$formulaMessage = $('<div class="formulaMessage""></div>').appendTo(this.$formulaMessageBox);


        this.$formula.focus(() => {
            keyboardJS.pause();
            formulaToolbar.show(this.$formula, this.model.get('name'));
        });

        this.$formula.blur((event) => {
            keyboardJS.resume();
        });
        this.$formula.on('keydown', (event) => {
            if (event.keyCode === 13 && event.shiftKey === false) {    //enter
                this.model.apply();
                this.$formula.blur();
                event.preventDefault();
            }

            if (event.keyCode === 9) {    //tab
                event.preventDefault();
            }
        });
        this.$formula.on('input', (event) => {
            this.model.set('formula', this.$formula[0].textContent);
        });

        this.model.on('change:formula', (event) => this._setFormula(event.changed.formula));
        this.model.on('change:formulaMessage', (event) => this._setFormulaMessage(event.changed.formulaMessage));
    },
    _setFormula(formula) {
        if ( ! this.attached)
            return;
        this.$formula[0].textContent = formula;
    },
    _setFormulaMessage(formulaMessage) {
        if ( ! this.attached)
            return;
        this.$formulaMessage.text(formulaMessage);
    },
    detach() {
        if ( ! this.attached)
            return;
        this.model.apply();
        this.$formula.attr('contenteditable', 'false');
        this.attached = false;
    },
    attach() {
        this.attached = true;

        this._setFormula(this.model.attributes.formula);
        this._setFormulaMessage(this.model.attributes.formulaMessage);
        this.$formula.attr('contenteditable', 'true');
    }
});

module.exports = ComputedVarWidget;
