
'use strict';

import dropdown from './dropdown';
import opsToolbar from '../editors/operatordropdown';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

class MissingValueListItem extends HTMLElement {

    _exampleFormulas: { s: string, a: string }[];
    opsToolbar: opsToolbar;
    _opEditClicked: boolean;
    value: string;
    _backspacePressed: boolean;
    _$wasEditingOpsFormula: HTMLElement;

    constructor(value: string) {
        super();
        this.value = value;
        this.opsToolbar = new opsToolbar();
        this._opEditClicked = false;
        dropdown.init();

        this.classList.add('jmv-missing-value-list-item');

        this._exampleFormulas = [
            { s: "==", a: "'NA'" },
            { s: "==", a: "'No response'" },
            { s: "==", a: "-1" },
            { s: "<", a: "0" },
            { s: "<=", a: "-1" },
            { s: "==", a: "99" }
        ];

        this._createUI();
    }

    setValue(value: string) {
        this.querySelectorAll('.formula').forEach(el => el.textContent = value);
        this.value = value;
    }

    _createUI() {

        let formula = this.value;
        let prefix = `${_('when')} $source`;
        let indent = (prefix.length + 1) + 'ch';

        let hasOp = true;

        let _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].a;
        let _sign = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].s + ' ';

        let $fp = HTML.parse('<div class="formula-list-item"></div>');
        this.append($fp);

        let $formula = HTML.parse('<div class="formula" type="text" placeholder="' + _sign + 'e.g. ' + _example + '" contenteditable="true" spellcheck="false" style="text-indent:' + indent + '">' + formula + '</div>');
        $fp.append($formula);

        let indexOfDollar = prefix.indexOf('$');
        if (indexOfDollar !== -1) {
            prefix = prefix.slice(0, indexOfDollar) + "<span>" + prefix.slice(indexOfDollar);
            indexOfDollar = prefix.indexOf('$');
            prefix = prefix.slice(0, indexOfDollar+1) + "</span>" + prefix.slice(indexOfDollar+1);
        }

        $fp.append(HTML.parse('<div class="equal">' + prefix + '</div>'));

        let $rm = HTML.parse('<div class="remove-cond" data-index="0"><span class="mif-cross"></span></div>');
        $fp.append($rm);
        $rm.addEventListener('click', (event) => {
            this.dispatchEvent(new CustomEvent('removed'));
        });

        let $opEdit: HTMLElement = null;

        $formula.addEventListener('blur', (event) => {
            this._postCheckFormula($formula, false);
            let value = $formula.textContent.trim();
            if (value !== this.value) {
                this.value = value;
                this.dispatchEvent(new CustomEvent('value-changed'));
            }

            if (this._opEditClicked === false)
                $opEdit.style.display = 'none';

            if (this._isRealBlur())
                dropdown.hide();

            this._opEditClicked = false;
        });

        $formula.addEventListener('focus', (event) => {
            $opEdit.style.display = '';
        });

        $formula.addEventListener('input', (event) => {
            dropdown.updatePosition();

            if (this._backspacePressed === false)
                this._postCheckFormula($formula, true);

            let count = this._startsWithValidOps($formula);
            if (count !== 0)
                $opEdit.style.width = `${count+1}ch`;

            dropdown.hide();
        });

        $opEdit = HTML.parse('<div class="down-arrow">a</div>');
        $fp.append($opEdit);
        $opEdit.style.width = `${_sign.length}ch`;
        $opEdit.style.display = 'none';

        $opEdit.addEventListener('click', (event) => {
            if (this._$wasEditingOpsFormula !== $formula || dropdown.content() !== this.opsToolbar) {
                this.opsToolbar.show($formula);
                dropdown.show($formula, this.opsToolbar);

                let sel = window.getSelection();

                let count = this._startsWithValidOps($formula, true);

                let textNode = $formula.firstChild;
                if (textNode === null) {
                    textNode = document.createTextNode('');
                    $formula.appendChild(textNode);
                }
                sel.setBaseAndExtent(textNode, 0, textNode, count);
                $formula.focus();

                $opEdit.classList.add('is-active');
            }
            event.stopPropagation();
            event.preventDefault();
        });

        $opEdit.addEventListener('mousedown', (event) => {
            this._$wasEditingOpsFormula = dropdown.focusedOn() !== null ? this.opsToolbar.focusedOn() : null;
            this._opEditClicked = true;
        });

        $formula.addEventListener('editor:closing', () => {
            $opEdit.classList.remove('is-active');
        });

        $formula.addEventListener('keydown', (event) => {
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
    }

    _isRealBlur() {
        return dropdown.clicked() === false;
    }

    _checkFormula($formula: HTMLElement) {
        if (this._backspacePressed)
            return true;

        let validOps = ['==', '!=', '<=', '>=', '<', '>', '='];

        let text = $formula.textContent.trimStart();
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

        let start = 0;
        let end = 0;
        let offsets = {
            start: 0,
            end: 0
        };
        if (sel.baseNode !== null) {
            let range = sel.getRangeAt(0);
            start = range.startOffset;
            end = range.endOffset;
        }

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

        if (text != $formula.textContent) {
            $formula.textContent = text;
            sel.setBaseAndExtent($formula.firstChild, start+offsets.start, $formula.firstChild, end+offsets.end);
        }
    }

    _postCheckFormula($formula: HTMLElement, isRealTime: boolean) {   // Non realtime check is more strict
        let validOps = ['==', '!=', '<=', '>=', '<', '>', '='];

        let text = $formula.textContent.trimStart();
        text = text.replace(/\u00A0/gi, ' '); //\u00A0 represents a non breaking space
        if (text === '')
            return true;

        let sel = window.getSelection();

        let start = 0;
        let end = 0;
        let offsets = {
            start: 0,
            end: 0
        };
        if (sel.baseNode !== null) {
            let range = sel.getRangeAt(0);
            start = range.startOffset;
            end = range.endOffset;
        }

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

        if (text !== $formula.textContent.replace(/\u00A0/gi, ' ')) { //\u00A0 represents a non breaking space
            $formula.textContent = text;
            sel.setBaseAndExtent($formula.firstChild, start+offsets.start, $formula.firstChild, end+offsets.end);
        }
    }

    _startsWithValidOps($formula: HTMLElement, ignorePlaceholder?: boolean) {
        let validOps = ['==', '!=', '<=', '>=', '<', '>', '='];

        let text = $formula.textContent.trim();
        if (text === '' && !ignorePlaceholder)
            text = $formula.getAttribute('placeholder');

        for (let i = 0; i < validOps.length; i++) {
            if (text.startsWith(validOps[i]))
                return validOps[i].length;
        }

        return 0;
    }
}

customElements.define('jmv-missing-value-item', MissingValueListItem);

export default MissingValueListItem;
