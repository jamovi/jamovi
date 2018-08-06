
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const keyboardJS = require('keyboardjs');
const opsDropDown = require('../editors/operatordropdown');

const RecodedVarWidget = Backbone.View.extend({
    className: 'RecodedVarWidget',
    initialize(args) {

        this.attached = false;

        this._exampleFormulas = [
            { s: ">", a: "2000", b: "'good'" },
            { s: "<=", a: "1000", b: "A" },
            { s: "==", a: "5", b: "B" },
            { s: "<", a: "17000", b: "'Male'" },
            { s: ">=", a: "1", b: "'Early'" },
            { s: "=", a: "'tom'", b: "'medium'" }
        ];

        opsDropDown.init();

        this.$el.empty();
        this.$el.addClass('jmv-variable-recoded-widget');

        this.$top = $('<div class="jmv-variable-recoded-top"></div>').appendTo(this.$el);
        $('<div>recoded from variable</div>').appendTo(this.$top);
        let t = '<select class="recoded-from">';
        //for (let i = 0; i < options.length; i++)
            t += '<option>A</option>';
            t += '<option>B</option>';
            t += '<option>C</option>';
        t += '</select>';
        $(t).appendTo(this.$top);
        $('<div>where foreach cell</div>').appendTo(this.$top);

        this.$contents = $('<div class="contents"></div>').appendTo(this.$el);

        let $insertBox = $('<div class="insert-box"></div>').appendTo(this.$contents);
        let $insert = $('<div class="insert button"></div>').appendTo($insertBox);

        this.$options = $('<div class="jmv-variable-recoded-options"></div>').appendTo(this.$contents);

        let $rightBox = $('<div class="right-box"></div>').appendTo(this.$contents);
        let $moveup = $('<div class="move-up button"><span class="mif-arrow-up"></span></div>').appendTo($rightBox);
        let $movedown = $('<div class="move-down button"><span class="mif-arrow-down"></span></div>').appendTo($rightBox);

        let elements = this._createFormulaBox(this.$options, 'if value', '9ch', '', true);

        this.$formula = elements.$formula;
        this.$formulaMessage = elements.$formulaMessage;

        this.$formula.on('input', (event) => {
            this.model.set('formula', this.$formula[0].textContent);
            opsDropDown.hide();
        });
        /*this.$formula.on('editor:closing', () => {
            elements.$showEditor.removeClass('is-active');
        });*/
        this.model.on('change:formula', (event) => this._setFormula(event.changed.formula));
        this.model.on('change:formulaMessage', (event) => this._setFormulaMessage(event.changed.formulaMessage));

        this._createSubFormula(elements.$formulaBox, 'use', '4ch');
        this._createFormulaButtons(elements.$formulaBox);

        let elements2 = this._createFormulaBox(this.$options, 'if value', '9ch', '', true);
        this._createSubFormula(elements2.$formulaBox, 'use', '4ch');
        this._createFormulaButtons(elements2.$formulaBox);

        let elements3 = this._createFormulaBox(this.$options, 'else use', '9ch', 'recode-else', false);
    },
    _createFormulaButtons($formulaBox) {
        let $rm = $('<div class="remove-cond" data-index="0"><span class="mif-cross"></span></div>').appendTo($formulaBox);
        let $ro = $('<div class="reorder-cond" data-index="0"></div>').appendTo($formulaBox);
    },
    _createFormulaBox($parent, prefix, indent, className, hasOp) {
        if (className === undefined)
            className = '';

        let $formulaBox = $('<div class="formula-box ' + className + '"></div>').appendTo($parent);

        let $formulaList = $('<div class="formula-list"></div>').appendTo($formulaBox);

        return this._createSubFormula($formulaBox, prefix, indent, className, hasOp);
    },
    _startsWithValidOps($formula) {
        let validOps = ['==', '=', '<=', '>=', '<', '>'];

        let text = $formula.text().trim();

        if (text === '') {
            text = $formula.attr('placeholder');
        }

        for (let i = 0; i < validOps.length; i++) {
            if (text.startsWith(validOps[i])) {
                let count = validOps[i].length;
                if (count < text.length && text[count] !== ' ') {

                    let startPosition = $formula[0].selectionStart;
                    let endPosition = $formula[0].selectionEnd;

                    text = text.slice(0, count) + ' ' + text.slice(count);
                    $formula.text(text);
                }
                return validOps[i].length;

            }
        }

        return 0;
    },
    _createSubFormula($formulaBox, prefix, indent, className, hasOp) {

        if (hasOp === undefined)
            hasOp = false;

        if (className === undefined)
            className = '';

        let elements = { };
        elements.$formulaBox = $formulaBox;

        let $formulaList = $formulaBox.find('.formula-list');
        let $formulaPair = $('<div class="formula-pair"></div>').appendTo($formulaList);

        let _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].b;
        let _sign = '';
        if (hasOp) {
            _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].a;
            _sign = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].s + ' ';
        }

        let $fp = $('<div class="formula-list-item"></div>').appendTo($formulaPair);
        elements.$formula = $('<div class="formula" type="text" placeholder="' + _sign + 'e.g. ' + _example + '" contenteditable="true" style="text-indent:' + indent + '"></div>').appendTo($fp);
        $('<div class="equal">' + prefix + '</div>').appendTo($fp);
        if (hasOp) {
            let $opEdit = $('<div class="down-arrow">a</div>').appendTo($fp);
            $opEdit.css('width', _sign.length + 'ch');
            $opEdit.hide();
            elements.$formula.on('focus', (event) => {
                $opEdit.show();
            });

            elements.$formula.on('blur', (event) => {
                if (this._editorClicked === false)
                    $opEdit.hide();
            });

            elements.$formula.on('input', (event) => {
                let count = this._startsWithValidOps(elements.$formula);
                if (count !== 0)
                    $opEdit.css('width', (count+1) + 'ch');
            });

            $opEdit.on('click', (event) => {
                if (this._$wasEditingFormula !== elements.$formula) {
                    opsDropDown.show(elements.$formula, null, false);

                    let sel = window.getSelection();
                    /*let range = sel.getRangeAt(0);
                    let start = range.startOffset;
                    let end = range.endOffset;
                    let text = el.textContent;
                    let before = text.substring(0, start);
                    let after  = text.substring(end, text.length);*/

                    let count = this._startsWithValidOps(elements.$formula);

                    /*let textSelected = text.substring(start, end);
                    el.textContent = (before + newText + after);*/
                    sel.setBaseAndExtent(elements.$formula[0].firstChild, 0, elements.$formula[0].firstChild, count);
                    elements.$formula[0].focus();
                    //elements.$formula.focus();
                    $opEdit.addClass('is-active');
                }
                event.stopPropagation();
                event.preventDefault();
            });

            $opEdit.on('mousedown', (event) => {
                this._$wasEditingFormula = opsDropDown.focusedOn();
                this._editorClicked = true;
            });

            elements.$formula.on('editor:closing', () => {
                $opEdit.removeClass('is-active');
            });

            elements.$formula.on('input', (event) => {
                opsDropDown.updatePosition();
            });
        }

        elements.$formula.focus(() => {
            keyboardJS.pause();
        });
        elements.$formula.blur((event) => {
            if (this._isRealBlur()) {
                this._editorClicked = false;
                return;
            }

            keyboardJS.resume();
        });
        elements.$formula.on('keydown', (event) => {
            if (event.keyCode === 13 && event.shiftKey === false) {    //enter
                elements.$formula.blur();
                event.preventDefault();
            }

            if (event.keyCode === 9) {    //tab
                event.preventDefault();
            }
        });

        let $formulaMessageBox = $('<div class="formulaMessageBox""></div>').appendTo($formulaPair);
        elements.$formulaMessage = $('<div class="formulaMessage""></div>').appendTo($formulaMessageBox);

        return elements;
    },
    _isRealBlur() {
        return opsDropDown.clicked() || this._editorClicked;
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

module.exports = RecodedVarWidget;
