
'use strict';

const $ = require('jquery');
const dropdown = require('./dropdown');
const opsToolbar = require('../editors/operatordropdown');

const MissingValueListItem = function(value) {
    this.value = value;
    this.opsToolbar = new opsToolbar();
    this._opEditClicked = false;
    dropdown.init();

    this.$el = $('<div class="jmv-missing-value-list-item"></div>');

    this._exampleFormulas = [
        { s: "==", a: "'NA'" },
        { s: "==", a: "'No response'" },
        { s: "==", a: "-1" },
        { s: "<", a: "0" },
        { s: "<=", a: "-1" },
        { s: "==", a: "99" }
    ];

    this.setValue = function(value) {
        this.$el.find('.formula').text(value);
        this.value = value;
    };

    this._createUI = function(elements) {

        let formula = this.value;
        let prefix = `${_('when')} $source`;
        let indent = (prefix.length + 1) + 'ch';

        let hasOp = true;

        let _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].a;
        let _sign = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].s + ' ';

        let $fp = $('<div class="formula-list-item"></div>').appendTo(this.$el);

        let $formula = $('<div class="formula" type="text" placeholder="' + _sign + 'e.g. ' + _example + '" contenteditable="true" style="text-indent:' + indent + '">' + formula + '</div>').appendTo($fp);

        let indexOfDollar = prefix.indexOf('$');
        if (indexOfDollar !== -1) {
            prefix = prefix.slice(0, indexOfDollar) + "<span>" + prefix.slice(indexOfDollar);
            indexOfDollar = prefix.indexOf('$');
            prefix = prefix.slice(0, indexOfDollar+1) + "</span>" + prefix.slice(indexOfDollar+1);
        }

        $('<div class="equal">' + prefix + '</div>').appendTo($fp);

        let $rm = $('<div class="remove-cond" data-index="0"><span class="mif-cross"></span></div>').appendTo($fp);
        $rm.on('click', (event) => {
            this.$el.trigger('removed');
        });

        let $opEdit = null;

        $formula.on('blur', (event) => {
            this._postCheckFormula($formula, false);
            let value = $formula[0].textContent.trim();
            if (value !== this.value) {
                this.value = value;
                this.$el.trigger('value-changed');
            }

            if (this._opEditClicked === false)
                $opEdit.hide();

            if (this._isRealBlur())
                dropdown.hide();

            this._opEditClicked = false;
        });

        $formula.on('focus', (event) => {
            $opEdit.show();
        });

        $formula.on('input', (event) => {
            dropdown.updatePosition();

            if (this._backspacePressed === false)
                this._postCheckFormula($formula, true);

            let count = this._startsWithValidOps($formula);
            if (count !== 0)
                $opEdit.css('width', (count+1) + 'ch');

            dropdown.hide();
        });

        $opEdit = $('<div class="down-arrow">a</div>').appendTo($fp);
        $opEdit.css('width', _sign.length + 'ch');
        $opEdit.hide();

        $opEdit.on('click', (event) => {
            if (this._$wasEditingOpsFormula !== $formula || dropdown.content !== this.opsToolbar) {
                this.opsToolbar.show($formula);
                dropdown.show($formula, this.opsToolbar);

                let sel = window.getSelection();

                let count = this._startsWithValidOps($formula);

                sel.setBaseAndExtent($formula[0].firstChild, 0, $formula[0].firstChild, count);
                $formula[0].focus();

                $opEdit.addClass('is-active');
            }
            event.stopPropagation();
            event.preventDefault();
        });

        $opEdit.on('mousedown', (event) => {
            this._$wasEditingOpsFormula = dropdown.focusedOn() !== null ? this.opsToolbar.focusedOn() : null;
            this._opEditClicked = true;
        });

        $formula.on('editor:closing', () => {
            $opEdit.removeClass('is-active');
        });

        $formula.on('keydown', (event) => {
            if (event.keyCode === 8)  //backspace
                this._backspacePressed = true;
            else
                this._backspacePressed = false;

            if ((event.key === 'Escape' || event.keyCode === 13) && event.shiftKey === false) {    //enter && escape
                $formula.blur();
                dropdown.hide();
                event.preventDefault();
                //event.stopPropagation();
            }
        });
    };

    this._isRealBlur = function(elements) {
        return dropdown.clicked() === false;
    };

    this._checkFormula = function($formula) {
        if (this._backspacePressed)
            return true;

        let validOps = ['==', '!=', '<=', '>=', '<', '>', '='];

        let text = $formula.text().trimLeft();
        if (text === '')
            return true;

        if (text.length === 1) {
            for (let i = 0; i < validOps.length; i++) {
                let op = validOps[i];
                if (text[0] === op[0])
                    return true;
            }
        }

        let sel = window.getSelection();
        let range = sel.getRangeAt(0);
        let start = range.startOffset;
        let end = range.endOffset;
        let offsets = {
            start: 0,
            end: 0
        };

        let found = false;
        for (let i = 0; i < validOps.length; i++) {
            let op = validOps[i];
            if (text.startsWith(op)) {
                let value = text.substring(op.length);
                let ff = text[op.length];
                if (text.length > op.length && ff !== ' ' && ff !== '\xa0') { // \xa0 represents a non breaking space
                    text = op + ' ' + value;
                    if (start >= op.length)
                        offsets.start += 1;
                    if (end >= op.length)
                        offsets.end += 1;
                }
                found = true;
                break;
            }
        }

        if (found === false) {
            text = '== ' + text;
            offsets.start += 3;
            offsets.end += 3;
        }

        if (text != $formula.text()) {
            $formula[0].textContent = text;
            sel.setBaseAndExtent($formula[0].firstChild, start+offsets.start, $formula[0].firstChild, end+offsets.end);
        }
    };

    this._postCheckFormula = function($formula, isRealTime) {   // Non realtime check is more strict
        let validOps = ['==', '!=', '<=', '>=', '<', '>', '='];

        let text = $formula.text().trimLeft();
        text = text.replace(/\u00A0/gi, ' '); //\u00A0 represents a non breaking space
        if (text === '')
            return true;

        let sel = window.getSelection();
        let range = sel.getRangeAt(0);
        let start = range.startOffset;
        let end = range.endOffset;
        let offsets = {
            start: 0,
            end: 0
        };

        if (text.length === 1 || (isRealTime && start <= 1)) {
            for (let i = 0; i < validOps.length; i++) {
                let op = validOps[i];
                if (text[0] === op[0])
                    return true;
            }
        }

        if (text !== '') {
            let op = '==';
            let value = text;

            let found = false;

            for (let i = 0; i < validOps.length; i++) {
                if (text.startsWith(validOps[i])) {
                    op = validOps[i];
                    value = text.substring(op.length);
                    let ff = text[op.length];
                    if (text.length > op.length && ff !== ' ') {
                        if (start >= op.length)
                            offsets.start += 1;
                        if (end >= op.length)
                            offsets.end += 1;
                    }
                    found = true;
                    break;
                }
            }

            if (found === false) {
                offsets.start += 3;
                offsets.end += 3;
            }

            if (op === '=') {
                op = '==';
                offsets.start += 1;
                offsets.end += 1;
            }

            if (isRealTime === false) {
                value = value.trim();
                if (isNaN(value) && value !== '.' && value !== '-') {
                    let index = text.indexOf(value);
                    let quoted = false;
                    if (value.startsWith("'") && value.endsWith("'") === false)
                        value = value + "'";
                    else if (value.startsWith("'") === false && value.endsWith("'")) {
                        value = "'" + value;
                        quoted = true;
                    }
                    else if (value.startsWith('"') && value.endsWith('"') === false)
                        value = value + '"';
                    else if (value.startsWith('"') === false && value.endsWith('"')) {
                        value = '"' + value;
                        quoted = true;
                    }
                    else if (((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) === false) {
                        if (value.indexOf("'") === -1) {
                            value = "'" + value + "'";
                            quoted = true;
                        }
                        else if (value.indexOf('"') === -1) {
                            value = '"' + value + '"';
                            quoted = true;
                        }
                    }
                    if (quoted) {
                        if (start >= index)
                            offsets.start += 1;
                        if (end >= index)
                            offsets.end += 1;
                    }
                }
            }
            if (isRealTime === false && value === '')
                text =  `${ op } ''`;
            else if (value.startsWith(' '))
                text = op + value;
            else
                text = `${ op } ${ value }`;
        }

        if (text !== $formula.text().replace(/\u00A0/gi, ' ')) { //\u00A0 represents a non breaking space
            $formula[0].textContent = text;
            sel.setBaseAndExtent($formula[0].firstChild, start+offsets.start, $formula[0].firstChild, end+offsets.end);
        }
    };

    this._startsWithValidOps = function($formula) {
        let validOps = ['==', '!=', '<=', '>=', '<', '>', '='];

        let text = $formula.text().trim();
        if (text === '')
            text = $formula.attr('placeholder');

        for (let i = 0; i < validOps.length; i++) {
            if (text.startsWith(validOps[i]))
                return validOps[i].length;
        }

        return 0;
    };

    this._createUI();
};



module.exports = MissingValueListItem;
