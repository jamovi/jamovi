
'use strict';


import formulaToolbar from './formulatoolbar';
import dropdown from './dropdown';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import VariableModel from './variablemodel';

class ComputedVarWidget extends HTMLElement{

    attached: boolean = false;
    model: VariableModel;
    _exampleFormulas: string[] = [
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
    formulasetup: formulaToolbar;

    $formula: HTMLInputElement;
    $showEditor: HTMLElement;
    $formulaMessage: HTMLElement;
    _$wasEditingFormula: HTMLElement;

    _editorClicked: boolean;

    constructor(model) {
        super();

        this.model = model;
        this.classList.add('ComputedVarWidget', 'jmv-variable-computed-widget')

        dropdown.init();
        this.formulasetup = new formulaToolbar(this.model.dataset);

        let $methods = HTML.parse('<div class="jmv-variable-computed-methods"></div>');
        this.append($methods);

        let $top = HTML.parse('<div class="top"></div>');
        $methods.append($top);
        $top.append(HTML.parse(`<div class="item">${_('Formula')}</div>`));

        $methods.append(HTML.parse('<div class="separator"></div>'));

        let $bottom = HTML.parse('<div class="bottom"></div>');
        $methods.append($bottom);

        let $options = HTML.parse('<div class="jmv-variable-computed-options"></div>');
        this.append($options);
        this._createFormulaBox($options);

        this.model.on('columnChanging', () => {
            if (document.activeElement === this.$formula && this.model.attributes.formula !== this.$formula.textContent)
                this.$formula.blur();
        });

        this.$formula.addEventListener('blur', (event) => {
            if ( ! dropdown.clicked() && ! this._editorClicked) {
                this.model.set('formula', this.$formula.textContent);
                window.clearTextSelection();
            }
        });

       /* this.$formula.on('focusout', (event) => {
            if (dropdown.isVisible() && dropdown.hasFocus(event.relatedTarget) === false)
                dropdown.hide();
        });*/

        this.$formula.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.keyCode === 13 && event.shiftKey === false) {    //enter
                this._editorClicked = false;
                dropdown.hide();
                this.$formula.blur();
                event.preventDefault();
                event.stopPropagation();
            }

            if (event.keyCode === 9) {    //tab
                if (dropdown.isVisible()) {
                    dropdown.enter();
                    event.stopPropagation();
                }
                event.preventDefault();
            }
        });

        this.$formula.addEventListener('editor:closing', () => {
            this.$showEditor.classList.remove('is-active');
        });

        this.model.on('change:formula', (event) => this._setFormula(event.changed.formula));
        this.model.on('change:formulaMessage', (event) => this._setFormulaMessage(event.changed.formulaMessage));

    }

    _createFormulaBox($parent: HTMLElement) {
        let $formulaBox = HTML.parse('<div class="formula-box"></div>');
        $parent.append($formulaBox);

        $formulaBox.append(HTML.parse('<div class="equal">=</div>'))

        this.$showEditor = HTML.parse(`<button class="show-editor" aria-label="${_('Show formula editor')}" aria-controls="${this.formulasetup.id}"><div class="down-arrow"></div></button>`);
        $formulaBox.append(this.$showEditor);

        this.$showEditor.addEventListener('click', (event) => {
            if (this._$wasEditingFormula !== this.$formula) {
                this.formulasetup.show(this.$formula, this.model.get('name'));
                dropdown.show(this.$formula, this.formulasetup).then(() => {
                    this._editorClicked = false;
                });
                //this.$formula.focus();
                this.$showEditor.classList.add('is-active');
            }
        });

        this.$showEditor.addEventListener('mousedown', (event: MouseEvent) => {
            this._$wasEditingFormula = dropdown.focusedOn();
            this._editorClicked = true;
        });

        let $formulaPair = HTML.parse('<div class="formula-pair"></div>');
        $formulaBox.append($formulaPair);

        let _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))];
        this.$formula = HTML.parse('<div class="formula" type="text" placeholder="eg: ' + _example + '" contenteditable="true" spellcheck="false" aria-label="formula" tabindex="0"></div>');
        $formulaPair.append(this.$formula);

        document.addEventListener("selectionchange", () => {
            const sel = window.getSelection();
            if (this.$formula && (this.$formula.contains(sel.anchorNode) || sel.anchorNode === this.$formula)) {
                let range = sel.getRangeAt(0);
                this.$formula.setAttribute('sel-start', range.startOffset.toString());
                this.$formula.setAttribute('sel-end', range.endOffset.toString());
            }
        });

        this.$formula.addEventListener('input', (event) => {
            dropdown.updatePosition();
        });

        let $formulaMessageBox = HTML.parse('<div class="formulaMessageBox""></div>');
        $formulaPair.append($formulaMessageBox);
        this.$formulaMessage = HTML.parse('<div class="formulaMessage""></div>');
        $formulaMessageBox.append(this.$formulaMessage);
    }

    _setFormula(formula: string) {
        if ( ! this.attached)
            return;
        this.$formula.textContent = formula;
    }

    _setFormulaMessage(formulaMessage: string) {
        if ( ! this.attached)
            return;
        this.$formulaMessage.innerText = formulaMessage;
    }

    detach() {
        if ( ! this.attached)
            return;

        this.$formula.setAttribute('contenteditable', 'false');
        this.attached = false;
    }

    attach() {
        this.attached = true;

        this._setFormula(this.model.attributes.formula);
        this._setFormulaMessage(this.model.attributes.formulaMessage);
        this.$formula.setAttribute('contenteditable', 'true');
    }
}

customElements.define('jmv-computed-var-editor', ComputedVarWidget);

export default ComputedVarWidget;
