'use strict';

import opsToolbar from './operatordropdown';
import tarp from '../utils/tarp';
import formulaToolbar from '../vareditor/formulatoolbar';
import dropdown from '../vareditor/dropdown';
import VariableList from '../vareditor/variablelist';
import MeasureList from '../vareditor/measurelist';
import ColourPalette from './colourpalette';
import Notify from '../notification';
import focusLoop from '../../common/focusloop';
import DataSetViewModel, { Column, MeasureType, Transform } from '../dataset';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

type IsExactlyString<T> = [T] extends [string]
    ? string extends T
        ? true  // plain string
        : false // string literal or enum
    : false;

type StringOnly<T> = {
    [K in keyof T as IsExactlyString<T[K]> extends true ? K : never]?: string;
};


type TransformDetails = { 
    $formulaBox: HTMLElement;
    $showEditor: HTMLElement;
    $formulaGrid: HTMLElement;
    _subFocusClicked: boolean;
    _opEditClicked: boolean;
    $focusedFormula: HTMLElement;
    $formulas: HTMLElement[];
    $formulaMessage: HTMLElement;
};

class TransformEditor extends HTMLElement {
    model: DataSetViewModel;
    _editNote = new Notify({ duration: 3000 });
    $icon: HTMLElement;
    _exampleFormulas: {s: string, a: string, b: string}[] = [
            { s: ">", a: "2000", b: "$source" },
            { s: "<=", a: "1000", b: "A" },
            { s: "==", a: "5", b: "B" },
            { s: "<", a: "17000", b: "'Male'" },
            { s: ">=", a: "1", b: "'Early'" },
            { s: "=", a: "'tom'", b: "'medium'" }
        ];
    _id: number;
    formulasetup: formulaToolbar;
    opsToolbar: opsToolbar;
    measureList: MeasureList;
    variableList: VariableList;
    formula: string[];
    _undoFormula: string[];
    _focusLeaving: boolean;
    _addingLevel: boolean;
    _swappingItems: boolean;
    prevStart: number;
    _backspacePressed: boolean;
    _editorClicked: boolean;
    _$wasEditingFormula: HTMLElement;
    _applyId: NodeJS.Timeout;
    connectedColumns: Column[];

    $title: HTMLInputElement;
    $description: HTMLElement;
    $shortname: HTMLElement;
    $contents: HTMLElement;
    $options: HTMLElement;
    $rightBox: HTMLElement;
    $measureList: HTMLSelectElement;
    $measureIcon: HTMLElement;
    $viewConnectionInfo: HTMLElement;
    _$wasEditingOpsFormula: HTMLElement;
    
    constructor(model: DataSetViewModel) {
        super();

        this.model = model;

        this.classList.add('jmv-transform-editor');

        this.title = _('Transform');
        this.$icon = HTML.parse('<div class="transform-colour"></div>');

        this._id = null;

        this._init();
    }

    setTransformId(id: number) {
        this._id = id;
        this._populate();
    }

    transformId() {
        return this._id;
    }

    _init() {
        this.model.on('dataSetLoaded', this._dataSetLoaded, this);

        dropdown.init();
        this.formulasetup = new formulaToolbar(this.model);
        this.opsToolbar = new opsToolbar();

        this.formula = [ '' ];

        let $top = HTML.parse('<div class="jmv-transform-editor-top"></div>');
        this.append($top);
        this.$title = HTML.parse('<input class="jmv-transform-editor-widget-title" type="text" spellcheck="true" maxlength="63">');
        $top.append(this.$title);
        let $descBox = HTML.parse('<div class="desc-box"></div>');
        $top.append($descBox);
        this.$description = HTML.parse(`<div class="jmv-transform-editor-widget-description" type="text" spellcheck="true" placeholder="${_('Description')}" contenteditable="true" tabindex="0">`);
        $descBox.append(this.$description);
        this.$shortname = HTML.parse(`<div class="jmv-transform-editor-widget-shortname" type="text" spellcheck="false" placeholder="${_('Variable suffix')}" contenteditable="true" tabindex="0">`);
        $descBox.append(this.$shortname);

        this.setInputEvents(this.$title, 'name');
        this.setInputEvents(this.$description, 'description');
        this.setInputEvents(this.$shortname, 'suffix');

        this.$contents = HTML.parse('<div class="contents" tabindex="0"></div>');
        this.append(this.$contents);

        let focusToken = focusLoop.addFocusLoop(this.$contents, {level: 2, exitSelector: this.$contents, keyToEnter: true });
        focusToken.on('focusleave', () => {
            this._focusLeaving = true;
        });

        this.$contents.addEventListener('focusin', (event) => {
            if (this._focusLeaving) {
                this._focusLeaving = false;
                tarp.hide('recode-formula');
            }
            else if (event.relatedTarget instanceof Node && this.$contents.contains(event.relatedTarget))
                this._focusFormulaControls();

        });

        this.$contents.addEventListener('focusout', (event) => {
            let ff= dropdown.focusedOn();
            if ( !this._addingLevel && event.relatedTarget instanceof Node && ! this.$contents.contains(event.relatedTarget) && (ff !== null && ! this.$contents.contains(ff)))
                tarp.hide('recode-formula');
        } );

        let $insertBox = HTML.parse('<button class="insert-box"></button>');
        this.$contents.append($insertBox);
        let $insert = HTML.parse('<div class="insert"></div>');
        $insertBox.append($insert)
        $insertBox.append(HTML.parse(`<div>${_('Add recode condition')}</div>`));

        $insertBox.addEventListener('click', (event) => {
            this._createRecodeConditionUI();
        });

        $insertBox.addEventListener('focus', () => {
            this._focusFormulaControls();
        } );


        let $list = HTML.parse('<div class="content-list"></div>');
        this.$contents.append($list);
        this.$options = HTML.parse('<div class="jmv-transform-editor-options"></div>');
        $list.append(this.$options);

        this.$rightBox = HTML.parse('<div class="right-box hidden"></div>');
        $list.append(this.$rightBox);
        let $moveup = HTML.parse('<div class="move-up button"><span class="mif-arrow-up"></span></div>');
        this.$rightBox.append($moveup);
        let $movedown = HTML.parse('<div class="move-down button"><span class="mif-arrow-down"></span></div>');
        this.$rightBox.append($movedown);

        $moveup.addEventListener('mousedown', (event) => {
            let $item = this.$options.querySelector<HTMLElement>('.selected');
            if ($item)
                this._swapFormulaItems($item, 'up');
        });

        $movedown.addEventListener('mousedown', (event) => {
            let $item = this.$options.querySelector<HTMLElement>('.selected');
            if ($item)
                this._swapFormulaItems($item, 'down');
        });

        let elements3 = this._addTransformUIItem('');

        window.addEventListener('keydown', event => {
            if ( ! this.$contents.classList.contains('super-focus'))
                return;

            let undo = event.key === 'Escape';
            if (event.key === 'Escape' || event.key === 'Enter') {
                if (undo) {
                    this.formula = this._undoFormula;
                    this._createFormulaUI(false);
                }
                tarp.hide('recode-formula');
                dropdown.hide();
            }
        });


        let $bottom = HTML.parse('<div class="jmv-transform-editor-bottom"></div>');
        this.append($bottom);

        let $measureBox = HTML.parse('<div class="measure-box"></div>');
        $bottom.append($measureBox);
        $measureBox.append(HTML.parse(`<div class="transform-label">${_('Measure type')}</div>`));
        
        this.$measureList = HTML.parse(`<select id="transform-measure-type">
                                    <option value="none">${_('Auto')}</option>
                                    <option value="nominal">${_('Nominal')}</option>
                                    <option value="ordinal">${_('Ordinal')}</option>
                                    <option value="continuous">${_('Continuous')}</option>
                                    <option value="id">${_('ID')}</option>
                                </select>`);
        $measureBox.append(this.$measureList);
        this.$measureList.value = 'none';
        this.$measureIcon = HTML.parse('<div class="transform-measure-icon"></div>');
        $measureBox.append(this.$measureIcon);

        this.measureList = new MeasureList();
        this.$measureList.addEventListener('mousedown', (event) => {
            if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$measureList)
                dropdown.hide();
            else
                dropdown.show(this.$measureList, this.measureList);
            event.preventDefault();
            event.stopPropagation();
            this.$measureList.focus();
        });

        this.measureList.addEventListener('selected-measure-type', (event: CustomEvent<MeasureType>) => {
            let id = this._id;
            let measureType = event.detail;
            let values = { measureType: measureType };
            this.model.setTransforms([{ id: id, values: values }]).catch((error) => {
                this._populate();
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            });
            dropdown.hide();
        });

        let $usageBox = HTML.parse('<div class="usage-box"></div>');
        $bottom.append($usageBox);
        let $connectionInfo = HTML.parse(`<div class="usage-label">${_('used by')}</div>`);
        $usageBox.append($connectionInfo);
        this.$viewConnectionInfo = HTML.parse('<div class="view-button"></div>');
        $usageBox.append(this.$viewConnectionInfo);

        this.variableList = new VariableList();
        this.$viewConnectionInfo.addEventListener('click', (event) => {
            let columns = [];
            for (let column of this.model.attributes.columns) {
                if (column.transform === this._id)
                    columns.push(column);
            }
            if (columns.length > 0) {
                this.variableList.populate(columns, true);
                if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$viewConnectionInfo)
                    dropdown.hide();
                else
                    dropdown.show(this.$viewConnectionInfo, this.variableList);
            }
            event.preventDefault();
            event.stopPropagation();
        });

        this.model.on('columnsChanged', (event) => {
            for (let change of event.changes) {
                if (change.transformChanged) {
                    this._populate();
                    break;
                }
            }
        });

        this.model.on('transformsChanged', (event) => {
            for (let change of event.changes) {
                if (change.id === this._id) {
                    this._updateFormulas();
                    break;
                }
            }
        });
    }

    _createRecodeConditionUI() {
        this._focusFormulaControls();
        if (this.formula.length === 1 && this.formula[0] === '$source') {
            this.formula[0] = '';
            this.querySelector('.formula-box.recode-else .formula').textContent = '';
        }
        this.formula.splice(this.formula.length - 1, 0, '', '');
        this._addTransformUIItem('', '', true);
        this._updateLastFormulaTag();

        setTimeout(() => {
            let $formulas = this.$options.querySelectorAll<HTMLElement>('.formula');
            if ($formulas.length > 0) {
                $formulas[$formulas.length-3].focus();
                this.$options.scrollTo({
                    top: this.$options.scrollHeight,
                    behavior: 'smooth'
                });
                if ($formulas.length > 3)
                    this.$rightBox.classList.remove('hidden');
            }
        },0);
    }

    setInputEvents($element: HTMLElement | HTMLInputElement, propertyName: keyof StringOnly<Transform>) {
        let _applyOnBlur = true;
        $element.addEventListener('focus', () => {
            if ($element instanceof HTMLInputElement)
                $element.select();
        } );

        $element.addEventListener('blur', () => {
            if (_applyOnBlur) {
                let id = this._id;
                let values: Partial<Transform> = { };
                if ($element instanceof HTMLInputElement)
                    values[propertyName] = $element.value.trim();
                else
                    values[propertyName] = $element.textContent.trim();
                    
                this.model.setTransforms([{ id: id, values: values }]).catch((error) => {
                    this._populate();
                    this._notifyEditProblem({
                        title: error.message,
                        message: error.cause,
                        type: 'error',
                    });
                });
                window.clearTextSelection();
            }
            _applyOnBlur = true;
        } );

        $element.addEventListener('keydown', (event: KeyboardEvent) => {
            var keypressed = event.keyCode || event.which;
            if (keypressed === 13) { // enter key
                $element.blur();
                event.preventDefault();
                event.stopPropagation();
            }
            else if (keypressed === 27) { // escape key
                _applyOnBlur = false;
                $element.blur();
                let id = this._id;
                let value = this.model.getTransformById(id)[propertyName];
                if ($element instanceof HTMLInputElement)
                    $element.value = value;
                else
                    $element.textContent = value;
                    
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }

    _updateErrorMessages() {
        let transform = this.model.getTransformById(this._id);

        let $messageBoxes = this.$options.querySelectorAll('.formula-message');
        for (let i = 0; i < transform.formulaMessage.length; i++) {
            let msg = transform.formulaMessage[i];
            $messageBoxes[i].textContent = msg;
        }
    }

    _updateFormulas() {
        let transform = this.model.getTransformById(this._id);

        let $formula = this.$options.querySelectorAll('.formula');

        if ($formula.length !== transform.formula.length)
            this._populate();
        else {
            this.$title.value = transform.name;
            this.$shortname.textContent = transform.suffix;
            this.$description.textContent = transform.description;
            this.$measureList.value = transform.measureType;
            this.$measureIcon.setAttribute('measure-type', transform.measureType);

            let $messageBoxes = this.$options.querySelectorAll('.formula-message');
            for (let i = 0; i < transform.formula.length; i++) {
                let formula = transform.formula[i];
                $formula[i].textContent = formula;
                let msg = transform.formulaMessage[i];
                $messageBoxes[i].textContent = msg;
            }
        }
    }

    _focusFormulaControls() {
        if (this.$contents.classList.contains('super-focus'))
            return;

        this._undoFormula = this.formula.slice();

        this.$contents.classList.add('super-focus');
        tarp.show('recode-formula', true, 0.1, 299).then(() => {
            this.$contents.classList.remove('super-focus');
            this._applyFormula();
            window.clearTextSelection();
            dropdown.hide();
        }, () => {
            this.$contents.classList.remove('super-focus');
            this._applyFormula();
            window.clearTextSelection();
            dropdown.hide();
        });
    }

    _addTransformUIItem(formula1: string, formula2?: string, hasTransition?: boolean) {
        let hasCondition = formula2 !== undefined;

        let tag = `${_('if')} $source`;
        if ( ! hasCondition) {
            if (this.formula.length === 1)
                tag = '=';
            else
                tag = _('else use');
        }

        let elements = this._createFormulaBox(this.$options, hasCondition, hasTransition);

        this._createSubFormula(elements, tag, hasCondition, formula1, 0);

        elements.$showEditor.addEventListener('click', (event) => {
            let $formula = null;
            this._addingLevel = true;
            /*for (let $next_formula of elements.$formulas) {
                if (this._$wasEditingFormula === $next_formula) {
                    $formula = $next_formula;
                    break;
                }
            }*/
            if ( ! $formula ) {
                $formula = elements.$focusedFormula === null ? elements.$formulas[0] : elements.$focusedFormula;
                //if (this._$wasEditingFormula !== $formula) {
                    this.formulasetup.show($formula, '', true);
                    dropdown.show(elements.$formulaGrid, this.formulasetup).then(() => {
                        this._editorClicked = false;
                    });
                    //$formula.focus();
                    elements.$showEditor.classList.add('is-active');
                //}
            }
            this._addingLevel = false;
        });

        elements.$showEditor.addEventListener('mousedown', (event) => {
            this._$wasEditingFormula = dropdown.focusedOn() !== null ? this.formulasetup.focusedOn() : null;
        });

        document.addEventListener("selectionchange", () => {
            const sel = window.getSelection();
            for (let i = 0; i < elements.$formulas.length; i++) {
                if (elements.$formulas[i] && (elements.$formulas[i].contains(sel.anchorNode) || sel.anchorNode === elements.$formulas[i])) {
                    let range = sel.getRangeAt(0);
                    elements.$formulas[i].setAttribute('sel-start', range.startOffset.toString());
                    elements.$formulas[i].setAttribute('sel-end', range.endOffset.toString());
                    break;
                }
            }
        });

        if (hasCondition) {
            this._createSubFormula(elements, _('use'), false, formula2, 1);
            this._createFormulaButtons(elements);
        }

        let $items =  elements.$formulaGrid.querySelectorAll('.formula-list-item');
        $items[$items.length-1].classList.add('item-last');

        let $msgItems =  elements.$formulaGrid.querySelectorAll('.formula-message-box');
        $msgItems[$msgItems.length-1].classList.add('item-last');


        if (hasTransition) {
            setTimeout(() => {
                let height = this.outerHeight(elements.$formulaGrid);
                this._expandSection(elements.$formulaBox, height + 'px');
                elements.$formulaBox.classList.remove('hidden');
            }, 0);
        }
        else {
            elements.$formulaBox.classList.remove('hidden');
        }
    }

    _updateLastFormulaTag() {
        let $equal = this.$options.querySelector('.recode-else .equal');
        if ($equal) {
            let $formula = this.$options.querySelector<HTMLElement>('.recode-else .formula');
            let tag = '=';
            if (this.formula.length > 1)
                tag = _('else use');

            setTimeout(() => {
                let indent = ($equal.clientWidth + 1) + 'px';
                $formula.style.textIndent = indent;
            }, 10);

            
            $equal.textContent = tag;
        }
    }

    _applyFormula() {
        if (this._applyId)
            clearTimeout(this._applyId);

        this._applyId = setTimeout(() => {
            let id = this._id;
            let values = { formula: this.formula };
            this._applyId = null;
            this.model.setTransforms([{ id: id, values: values }]).catch((error) => {
                this.formula = [];
                this._populate();
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            });
        }, 0);
    }

    _createFormulaUI(hasTransition) {
        this.$options.innerHTML = '';
        for (let i = 0; i < this.formula.length; i += 2)
            this._addTransformUIItem(this.formula[i], this.formula[i+1], hasTransition);
    }

    _populate() {
        let id = this._id;
        if (id !== null) {
            let transform = this.model.getTransformById(id);
            if (transform) {

                this.$icon.style.backgroundColor = ColourPalette.get(transform.colourIndex);

                this.$title.value = transform.name;
                this.$shortname.textContent = transform.suffix;
                this.$description.textContent = transform.description;
                this.$measureList.value = transform.measureType;
                this.$measureIcon.setAttribute('measure-type', transform.measureType);

                let updateFormula = false;
                if ( ! this.formula || this.formula.length !== transform.formula.length)
                     updateFormula = true;
                else {
                    for (let i = 0; i < this.formula.length; i++) {
                        if (this.formula[i] !== transform.formula[i]) {
                            updateFormula = true;
                            break;
                        }
                    }
                }
                this.formula = transform.formula.slice();
                if (updateFormula)
                    this._createFormulaUI(true);

                this.connectedColumns = [];
                let columns = this.model.attributes.columns;
                for (let column of columns) {
                    if (column.transform === id)
                        this.connectedColumns.push(column);
                }
                this.$viewConnectionInfo.textContent = this.connectedColumns.length.toString();
                this._updateErrorMessages();
                return;
            }
        }

        this.$title.innerHTML = '';
        this.$description.innerHTML = '';
        this.$shortname.innerHTML = '';
    }

    outerHeight(el: HTMLElement, includeMargin = false) {
        let height = el.offsetHeight;

        if (includeMargin) {
            const style = getComputedStyle(el);
            const marginTop = parseFloat(style.marginTop) || 0;
            const marginBottom = parseFloat(style.marginBottom) || 0;
            height += marginTop + marginBottom;
        }

        return height;
    }

    _swapFormulaItems($item: HTMLElement, direction: 'up' | 'down') {

        if (!this.formula || this.formula.length <= 1)
            return;

        let $formula = $item.querySelector<HTMLElement>(':focus');
        let index = [...$item.parentNode.children].indexOf($item);

        if ( ! this._swappingItems &&
             ! ((((index+1) * 2) >  this.formula.length) || (index === 0 && direction === 'up' ) || (((index+1) * 2) >= (this.formula.length-1) && direction === 'down'))) {
            this._swappingItems = true;

            let $items = this.$options.querySelectorAll<HTMLElement>('.formula-box');
            let oIndex = index-1;
            if (direction === 'down')
                oIndex = index+1;

            let $other = $items[oIndex];

            let iHeight = this.outerHeight($item, true);
            let oHeight = this.outerHeight($other, true);
            const itemStyle = getComputedStyle($item);
            const otherStyle = getComputedStyle($other);

            $item.style.top = ((parseFloat(itemStyle.top)) + (direction === 'up' ? (-oHeight) : oHeight)) + 'px';
            $other.style.top = ((parseFloat(otherStyle.top)) - (direction === 'up' ? (-iHeight) : iHeight)) + 'px';

            $item.addEventListener("transitionend", (event) => {
                $item.style.top = '0px';
                $other.style.top = '0px';
                $other.style.transition = 'none';
                $item.remove();
                if (direction === 'up')
                    $other.before($item);
                else
                    $other.after($item);

                setTimeout(() => {
                    $other.style.transition = '';
                    $formula.focus();
                    this._swappingItems = false;

                    let y1 = this.formula[(index * 2) + 0];
                    let y2 = this.formula[(index * 2) + 1];

                    this.formula[(index * 2) + 0] = this.formula[(oIndex * 2) + 0];
                    this.formula[(index * 2) + 1] = this.formula[(oIndex * 2) + 1];

                    this.formula[(oIndex * 2) + 0] = y1;
                    this.formula[(oIndex * 2) + 1] = y2;
                }, 0);
            }, { once: true });
        }

        setTimeout(() => {
            $formula.focus();
        }, 0);
    }

    _dataSetLoaded() {
        this._populate();
    }

    _removeCondition($formulaBox: HTMLElement) {
        this._focusFormulaControls();
        let condIndex = [...$formulaBox.parentNode.children].indexOf($formulaBox);
        let index = condIndex * 2;
        this.formula.splice(index, 2);
        $formulaBox.remove();
        dropdown.hide();
        this._updateLastFormulaTag();

        if (this.formula.length <= 3)
            this.$rightBox.classList.add('hidden');
    }

    _createFormulaButtons(elements: TransformDetails) {
        let $rm = HTML.parse('<div class="remove-cond" data-index="0"><span class="mif-cross"></span></div>');
        elements.$formulaGrid.append($rm);
        $rm.addEventListener('click', (event) => {
            elements.$formulaBox.addEventListener("transitionend", (event) => {
                this._removeCondition(elements.$formulaBox);
            }, { once: true });
            elements.$formulaBox.classList.add('remove');
            this._collapseSection(elements.$formulaBox);
        });
    }

    _collapseSection(element: HTMLElement) {
        let sectionHeight = element.scrollHeight;

        let elementTransition = element.style.transition;
        element.style.transition = '';

        requestAnimationFrame(() => {
            element.style.height = sectionHeight + 'px';
            element.style.transition = elementTransition;
            requestAnimationFrame(() => {
                element.style.height = 0 + 'px';
            });
        });
    }

    _expandSection(element: HTMLElement, value: string) {

        element.setAttribute('data-expanding', 'true');
        let sectionHeight = element.scrollHeight;

        element.style.height = value === undefined ? `${sectionHeight}px` : value;

        element.addEventListener('transitionend', (e) => {
            element.removeEventListener('transitionend', e.callee);
            element.style.height = null;
            element.setAttribute('data-expanding', 'false');
            dropdown.updatePosition();
        });
    }

    _createFormulaBox($parent: HTMLElement, isCondition: boolean, hasTransition: boolean): TransformDetails {
        let $elseBox = $parent.querySelector('.recode-else');
        let className = 'recode-if';
        if ( ! isCondition)
            className = 'recode-else';
        if (hasTransition)
            className = className + ' hidden';

        let $formulaBox = HTML.parse('<div class="formula-box ' + className + '"></div>');

        if ($elseBox) {
            if ( ! isCondition)
                throw 'The else statement ui already exists';

            $elseBox.before($formulaBox);
        }
        else
            $parent.append($formulaBox);

        let $showEditor = HTML.parse(`<button class="show-editor" aria-label="${_('Show formula editor')}"><div class="down-arrow"></div></button>`);
        $formulaBox.append($showEditor);

        let $formulaGrid = HTML.parse('<div class="formula-grid"></div>');
        $formulaBox.append($formulaGrid);

        return { $formulaBox,  $showEditor, $formulaGrid, _subFocusClicked: false, _opEditClicked: false, $focusedFormula: undefined, $formulas: undefined, $formulaMessage: undefined };
    }

    _startsWithValidOps($formula: HTMLElement, ignorePlaceholder?: boolean) {
        let validOps = ['==', '!=', '=', '<=', '>=', '<', '>'];

        let text = $formula.textContent.trim();
        if (!ignorePlaceholder && text === '') {
            text = $formula.getAttribute('placeholder');
        }

        for (let i = 0; i < validOps.length; i++) {
            if (text.startsWith(validOps[i])) {
                let count = validOps[i].length;
                if (count < text.length && text[count] !== ' ') {

                    let sel = window.getSelection();
                    let range = sel.getRangeAt(0);
                    let start = range.startOffset;
                    let end = range.endOffset;

                    let amount = 1;
                    if (start === count && start === end && this._backspacePressed)
                        amount = 0;

                    text = text.slice(0, count) + ' ' + text.slice(count);
                    $formula.textContent = text;
                    sel.setBaseAndExtent($formula.firstChild, start+amount, $formula.firstChild, end+amount);
                    this.prevStart = start+amount;
                }
                return validOps[i].length;

            }
        }

        return 0;
    }

    _createSubFormula(elements: TransformDetails, prefix: string, hasOp: boolean, formula: string, index: number) {

        let $formulaBox = elements.$formulaBox;

        if (hasOp === undefined)
            hasOp = false;

        let $formulaGrid = $formulaBox.querySelector('.formula-grid');

        let _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].b;
        let _sign = '';
        if (hasOp) {
            _example = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].a;
            _sign = this._exampleFormulas[Math.floor(Math.random() * Math.floor(this._exampleFormulas.length - 1))].s + ' ';
        }

        let $fp = HTML.parse('<div class="formula-list-item item-' + index + '" style="grid-column-start: ' + (index + 1) + '; grid-row-start: 1;"></div>');
        $formulaGrid.append($fp);

        elements.$focusedFormula = null;
        if (elements.$formulas === undefined)
            elements.$formulas = [ ];

        let $formula = HTML.parse<HTMLDivElement>('<div class="formula" tabindex="0" type="text" spellcheck="false" placeholder="' + _sign + 'e.g. ' + _example + '" contenteditable="true" data-index="' + index + '">' + formula + '</div>');
        $fp.append($formula);

        let indexOfDollar = prefix.indexOf('$');
        if (indexOfDollar !== -1) {
            prefix = prefix.slice(0, indexOfDollar) + "<span>" + prefix.slice(indexOfDollar);
            indexOfDollar = prefix.indexOf('$');
            prefix = prefix.slice(0, indexOfDollar+1) + "</span>" + prefix.slice(indexOfDollar+1);
        }

        let $equal = HTML.parse('<div class="equal">' + prefix + '</div>');
        $fp.append($equal);
        setTimeout(() => {
            let indent = ($equal.clientWidth + 1) + 'px';
            $formula.style.textIndent = indent;
        }, 10);

        elements.$formulas.push($formula);

        let $opEdit: HTMLElement = null;

        $formula.addEventListener('blur', (event) => {
            this.$options.querySelector('.selected')?.classList.remove('selected');
            this.formula[([...$formulaBox.parentNode.children].indexOf($formulaBox) * 2) + index] = $formula.textContent.trim();
            if (hasOp && elements._opEditClicked === false)
                $opEdit.style.display = 'none';
            elements._opEditClicked = false;
        });

        $formula.addEventListener('focus', (event) => {
            elements.$formulaBox.classList.add('selected');
            elements.$focusedFormula = $formula;
            this._focusFormulaControls();
            if (this.formulasetup.focusedOn() !== $formula)
                this.formulasetup.show($formula, '', true);
            if (hasOp)
                $opEdit.style.display = '';
        });

        $formula.addEventListener('mousedown', (event) => {
            elements._subFocusClicked = true;
        });

        $formula.addEventListener('input', (event) => {
            dropdown.updatePosition();

            if (hasOp) {
                let count = this._startsWithValidOps($formula);
                if (count !== 0)
                    $opEdit.style.width = (count+1) + 'ch';

                if (dropdown.content() === this.opsToolbar)
                    dropdown.hide();
            }
        });

        if (hasOp) {
            $opEdit = HTML.parse('<div class="down-arrow">a</div>');
            $fp.append($opEdit)
            setTimeout(() => {
                let indent = ($equal.clientWidth + 1) + 'px';
                $opEdit.style.left = indent;
            }, 10);
            $opEdit.style.width = _sign.length + 'ch';
            $opEdit.style.display = 'none';

            $opEdit.addEventListener('click', (event) => {
                if (this._$wasEditingOpsFormula !== $formula || dropdown.content() !== this.opsToolbar) {
                    this.opsToolbar.show($formula);
                    dropdown.show($formula, this.opsToolbar);

                    let sel = window.getSelection();

                    let count = this._startsWithValidOps($formula, true);

                    if ($formula.firstChild)
                        sel.setBaseAndExtent($formula.firstChild, 0, $formula.firstChild, count);
                    $formula.focus();

                    $opEdit.classList.add('is-active');
                }
                event.stopPropagation();
                event.preventDefault();
            });

            $opEdit.addEventListener('mousedown', (event) => {
                this._$wasEditingOpsFormula = dropdown.focusedOn() !== null ? this.opsToolbar.focusedOn() : null;
                elements._opEditClicked = true;
            });

            $formula.addEventListener('editor:closing', () => {
                $opEdit.classList.remove('is-active');
                elements.$showEditor.classList.remove('is-active');
            });
        }

        $formula.addEventListener('focusout', (event: FocusEvent) => {
            if (event.relatedTarget instanceof Node && this.formulasetup.contains(event.relatedTarget))
                return;

            if (this._isRealBlur(elements)) {
                dropdown.hide();
                window.clearTextSelection();
            }
            elements._subFocusClicked = false;
        });
        $formula.addEventListener('keydown', (event) => {
            if (event.keyCode === 8)  //backspace
                this._backspacePressed = true;
            else
                this._backspacePressed = false;

            if (event.keyCode === 13 && event.shiftKey === false) {    //enter
                $formula.blur();
                dropdown.hide();
                setTimeout(() => {
                    tarp.hide('recode-formula');
                }, 0);
                event.preventDefault();
                event.stopPropagation();
            }
        });

        let $formulaMessageBox = HTML.parse('<div class="formula-message-box  item-' + index + '" style="grid-column-start: ' + (index + 1) + '; grid-row-start: 2;"></div>');
        $formulaGrid.append($formulaMessageBox);
        elements.$formulaMessage = HTML.parse('<div class="formula-message"></div>');
        $formulaMessageBox.append(elements.$formulaMessage);

        return elements;
    }

    _isRealBlur(elements) {
        return dropdown.clicked() === false && elements._subFocusClicked === false && !this.formulasetup.contains(document.activeElement);
    }

    _notifyEditProblem(details) {
        this._editNote.set(details);
        this.dispatchEvent(new CustomEvent('notification', { detail: this._editNote, bubbles: true }));
    }
}

customElements.define('jmv-transform-editor', TransformEditor);

export default TransformEditor;
