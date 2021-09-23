
'use strict';


const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const formulaToolbar = require('./formulatoolbar');
const dropdown = require('./dropdown');

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

        if (cursorOffset !== -1 && newText.search(/[ ~!@#$%^&*\+\-\=()\[\]{};,<>?\/\\]/) !== -1)
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

        this._exampleFormulas = [
            "gender == 'female'",
            "score == 10",
            "consent == 'yes'",
            "Q1 != 'don\'t know'",
            "ROW() <= 100",
            "ROW() % 2",
            "-1.5 < Z(score) < 1.5",
            "ROW() != 33 and ROW() != 37",
            "score > 0.5"
        ];

        dropdown.init();
        this.formulasetup = new formulaToolbar(this.model.dataset);

        this.$el.empty();
        this.$el.addClass('jmv-variable-computed-widget');

        this.$methods = $('<div class="jmv-variable-computed-methods"></div>').appendTo(this.$el);

        this.$top = $('<div class="top"></div>').appendTo(this.$methods);
        this.$top.append($(`<div class="item">${_('Formula')}</div>`));

        this.$methods.append($('<div class="separator"></div>'));

        this.$bottom = $('<div class="bottom"></div>').appendTo(this.$methods);

        this.$options = $('<div class="jmv-variable-computed-options"></div>').appendTo(this.$el);
        this._createFormulaBox(this.$options);

        this.model.on('columnChanging', () => {
            if (this.$formula.is(":focus") && this.model.attributes.formula !== this.$formula[0].textContent)
                this.$formula.blur();
        });

        this.$formula.focus(() => {
            keyboardJS.pause('computed');
        });
        this.$formula.blur((event) => {
            keyboardJS.resume('computed');
            if ( ! dropdown.clicked() && ! this._editorClicked) {
                this.model.set('formula', this.$formula[0].textContent);
                window.clearTextSelection();
            }

        });
        this.$formula.on('keydown', (event) => {
            if (event.keyCode === 13 && event.shiftKey === false) {    //enter
                this._editorClicked = false;
                this.$formula.blur();
                event.preventDefault();
            }

            if (event.keyCode === 9) {    //tab
                event.preventDefault();
            }
        });

        this.$formula.on('editor:closing', () => {
            this.$showEditor.removeClass('is-active');
        });

        this.model.on('change:formula', (event) => this._setFormula(event.changed.formula));
        this.model.on('change:formulaMessage', (event) => this._setFormulaMessage(event.changed.formulaMessage));

    },
    _createFormulaBox($parent, data) {
        let $formulaBox = $('<div class="formula-box"></div>').appendTo($parent);

        $('<div class="equal">=</div>').appendTo($formulaBox);

        this.$showEditor = $(`<div class="show-editor" title="${_('Show formula editor')}"><div class="down-arrow"></div></div>`).appendTo($formulaBox);

        this.$showEditor.on('click', (event) => {
            if (this._$wasEditingFormula !== this.$formula) {
                this.formulasetup.show(this.$formula, this.model.get('name'));
                dropdown.show(this.$formula, this.formulasetup).then(() => {
                    this._editorClicked = false;
                });
                this.$formula.focus();
                this.$showEditor.addClass('is-active');
            }
        });

        this.$showEditor.on('mousedown', (event) => {
            this._$wasEditingFormula = dropdown.focusedOn();
            this._editorClicked = true;
        });

        let $formulaPair = $('<div class="formula-pair"></div>').appendTo($formulaBox);

        let _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))];
        this.$formula = $('<div class="formula" type="text" placeholder="eg: ' + _example + '" contenteditable="true"></div>').appendTo($formulaPair);

        this.$formula.on('input', (event) => {
            dropdown.updatePosition();
        });

        let $formulaMessageBox = $('<div class="formulaMessageBox""></div>').appendTo($formulaPair);
        this.$formulaMessage = $('<div class="formulaMessage""></div>').appendTo($formulaMessageBox);
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
