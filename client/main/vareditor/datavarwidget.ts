
'use strict';

import DataVarLevelWidget from './datavarlevelwidget';
import tarp from '../utils/tarp';
import dropdown from './dropdown';
import MissingValueEditor from '../editors/missingvalueeditor';
import MeasureList from './measurelist';
import _dialogs from 'dialogs';
const dialogs = _dialogs({cancel:false});
import focusLoop from '../../common/focusloop';
import { s6e } from '../../common/utils';
import { DataType, MeasureType } from '../dataset';
import VariableModel from './variablemodel';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

class DataVarWidget extends HTMLElement {

    attached: boolean = false;
    model: VariableModel;
    _focusLeaving: boolean;
    _addingLevel: boolean;

    $left: HTMLElement;
    $dataTypeList: HTMLSelectElement;
    $autoType: HTMLElement;
    $levelsCrtl: HTMLElement;
    $addLevelButton: HTMLButtonElement;
    $levels: HTMLElement;
    $moveUp: HTMLButtonElement;
    $moveDown: HTMLButtonElement;
    $missingValueButton: HTMLElement;
    $measureIcon: HTMLElement;
    $measureList: HTMLSelectElement;

    $levelItems: NodeListOf<Element>;
    levelCtrls: DataVarLevelWidget[] = [];
    selectedLevelIndex: number;

    missingValueEditor: MissingValueEditor;
    measureList: MeasureList;

    constructor(model: VariableModel) {
        super();

        this.model = model;

        this._clickLevel = this._clickLevel.bind(this);

        dropdown.init();

        this.classList.add('jmv-variable-editor-datavarwidget', 'DataVarWidget');

        let $body = HTML.parse('<div class="jmv-datavarwidget-body"></div>');
        this.append($body);
        this.$left = HTML.parse('<div class="jmv-variable-editor-widget-left"></div>');
        $body.append(this.$left);

        this._createMeasureTypeListBox();

        let $dataType = HTML.parse(`<div class="jmv-vareditor-datatype"></div>`);
        this.$left.append($dataType);
        let $dataLabel = HTML.parse(`<label for="data-type">${_('Data type')}</label>`);
        $dataType.append($dataLabel)
        this.$dataTypeList = HTML.parse(`<select id="data-type"><option value="integer">${_('Integer')}</option><option value="decimal">${_('Decimal')}</option><option value="text">${_('Text')}</option></select>`);
        $dataLabel.append(this.$dataTypeList);
        this.$autoType = HTML.parse(`<div class="jmv-variable-editor-autotype">${_('(auto)')}</div>`);
        $dataType.append(this.$autoType);


        this._createMissingValuesCtrl();

        this.$levelsCrtl = HTML.parse('<div class="jmv-variable-editor-levels-control" tabindex="0"></div>');
        $body.append(this.$levelsCrtl);
        let focusToken = focusLoop.addFocusLoop(this.$levelsCrtl, {level: 1, exitSelector: this.$levelsCrtl, keyToEnter: true });
        focusToken.on('focusleave', () => {
            this._focusLeaving = true;
        });
        this.$addLevelButton = HTML.parse(`<button class="add-level" aria-label="${_('Add new level')}"><span class="mif-plus"></span></button>`);
        this.$levelsCrtl.append(this.$addLevelButton);
        let $levelsContainer = HTML.parse('<div class="container"></div>');
        this.$levelsCrtl.append($levelsContainer);
        $levelsContainer.append(HTML.parse(`<div class="title">${_('Levels')}</div>`));
        this.$levels = HTML.parse('<div class="levels"></div>');
        $levelsContainer.append(this.$levels);
        this.$levelItems =this.$levels.querySelectorAll('.jmv-variable-editor-level');

        let $move = HTML.parse('<div class="jmv-variable-editor-widget-move"></div>');
        this.$levelsCrtl.append($move);
        this.$moveUp = HTML.parse('<button class="jmv-variable-editor-widget-move-up"><span class="mif-arrow-up"></span></button>');
        $move.append(this.$moveUp);
        this.$moveDown = HTML.parse('<button class="jmv-variable-editor-widget-move-down"><span class="mif-arrow-down"></span></button>');
        $move.append(this.$moveDown);

        this.$levelsCrtl.addEventListener('focusin', (event) => {
            if (this._focusLeaving) {
                this._focusLeaving = false;
                tarp.hide('levels');
            }
            else if (event.relatedTarget instanceof Node && this.$levelsCrtl.contains(event.relatedTarget))
                this._focusLevelControls();

        });

        this.$levelsCrtl.addEventListener('focusout', (event) => {
            if ( !this._addingLevel && event.relatedTarget instanceof Node && ! this.$levelsCrtl.contains(event.relatedTarget))
                tarp.hide('levels');
        } );

        this.$addLevelButton.addEventListener('click', async event => {
            if (this.model.attributes.measureType === 'continuous' || this.model.attributes.measureType === 'id')
                return;

            try {
                this.selectedLevelIndex = this.levelCtrls.length;

                this.$levelItems.forEach(el => el.classList.remove('selected'));
                this.$levelsCrtl.querySelector('.selected')?.classList.remove('selected');

                let recordValue = this.model.get('dataType') !== DataType.TEXT;

                let levels = this.model.get('levels');
                this._addingLevel = true;
                let response = await new Promise((resolve, reject) => {
                    let msg = _('Enter level value');
                    focusLoop.speakMessage(msg);
                    dialogs.prompt(msg, '', (result) => {
                        let widget = document.body.querySelector<HTMLElement>('.dialog-widget.prompt');
                        focusLoop.leaveFocusLoop(widget);
                        if (result === undefined)
                            reject('');
                        else {

                            result = result.trim();

                            let max = 0;
                            for (let column of this.model.columns) {
                                if (column.levels.length >  max) {
                                    max = column.levels.length;
                                }
                            }

                            let n = max;
                            if (recordValue)
                                n = parseInt(result);

                            if (isNaN(n))
                                reject(_('{r} is not an integer', { r: result }));
                            else {

                                let existing = new Set();
                                let getValues = (lvls, type?) => {
                                    if (lvls) {
                                        for (let alevel of lvls) {
                                            existing.add(alevel[type]);
                                            getValues(alevel.others);
                                        }
                                    }
                                };

                                if (recordValue) {
                                    getValues(levels, 'value');
                                    if (existing.has(n))
                                        reject(_('The level value {r} is already in use.', { r: result }));
                                }
                                else {
                                    getValues(levels, 'importValue');
                                    let newN = result; // modify label if already in use
                                    let c = 2;
                                    while (existing.has(newN))
                                        newN = result + ' (' + c++ + ')';
                                    result = newN;
                                }

                                if (result === '')
                                    reject(_(`The level value cannot be blank.`));

                                resolve({ value: n, label: result });
                            }
                        }
                    });
                    let widget = document.body.querySelector<HTMLElement>('.dialog-widget.prompt');
                    focusLoop.addFocusLoop(widget, { level: 2, modal: true });
                    focusLoop.enterFocusLoop(widget);
                });

                let level = { label:  response.label, importValue: response.label, value: response.value, pinned: true, others: [] };

                let clone  = [];
                if (levels)
                    clone = levels.slice(0);

                let insertAt = -1;
                let inOrder = true;
                let descending = clone.length <= 1 ? false : true;
                if (this.model._compareWithValue) {
                    for (let i = 0; i < clone.length; i++) {
                        if (i < clone.length - 1) {
                            if (i === 0 && clone[i].value < clone[i+1].value)
                                descending = false;

                            if ((descending === true && clone[i].value < clone[i+1].value) || (descending === false && clone[i].value > clone[i+1].value)) {
                                inOrder = false;
                                break;
                            }
                        }

                        let lvl = clone[i];
                        if (insertAt === -1 && ((descending === true && lvl.value < level.value) || (descending === false && lvl.value > level.value)))
                            insertAt = i;
                    }
                }
                if (inOrder === false || insertAt === -1) {
                    clone.push(level);
                    this.selectedLevelIndex = clone.length - 1;
                }
                else {
                    this.selectedLevelIndex = insertAt;
                    clone.splice(insertAt, 0, level);
                }

                let levelCtrl = new DataVarLevelWidget(level, this.model, this.levelCtrls.length);

                this.$levels.append(levelCtrl);
                this.levelCtrls.push(levelCtrl);

                levelCtrl.addEventListener('click', this._clickLevel);

                this.model.levelsReordered = true;
                this.model.set('levels', clone);
            }
            catch(msg) {
                if (msg) {
                    this.model._notifyEditProblem({
                        title: _('Level value'),
                        message: msg,
                        type: 'error',
                    });
                }
            }
            this._addingLevel = false;
            this.$levelItems = this.$levels.querySelectorAll('.jmv-variable-editor-level');
            setTimeout(() => {
                this.$addLevelButton.focus();
            }, 10);
        });

        this.$moveUp.addEventListener('click', event => this._moveUp());
        this.$moveDown.addEventListener('click', event => this._moveDown());
        this.selectedLevelIndex = -1;

        this.$dataTypeList.addEventListener('change', (event) => {
            let dt = this.$dataTypeList.value as DataType;
            this.model.set({ dataType: dt, autoMeasure: false });
        });

        this.model.on('change:dataType',    event => this._setOptions(event.changed.dataType, this.model.get('measureType'), this.model.get('levels')));
        this.model.on('change:measureType', event => this._setOptions(this.model.get('dataType'), event.changed.measureType, this.model.get('levels')));
        this.model.on('change:levels',      event => this._setOptions(this.model.get('dataType'), this.model.get('measureType'), event.changed.levels));
        this.model.on('change:autoMeasure', event => this._setAutoMeasure(event.changed.autoMeasure));
        this.model.on('change:missingValues', event => this._setMissingValues(this.model.get('missingValues')));

        this.model.on('change:autoApply', event => {
            if (this.model.get('autoApply'))
                tarp.hide('levels');
        });
    }

    _setMissingValues(missings) {
        if ( ! this.attached)
            return;

        let label = '';
        //let missings = this.model.get('missingValues');
        if (missings !== null) {
            let c = 0;
            for (let i = 0; i < missings.length; i++) {
                let part = missings[i].trim();
                if (part.startsWith('==')) {
                    part = part.substring(2).trim();
                    if (part.startsWith('"') && part.endsWith('"'))
                        part = part.substring(1, part.length - 1);
                    else if (part.startsWith("'") && part.endsWith("'"))
                        part = part.substring(1, part.length - 1);
                }

                if (part !== '')
                    label = `${ label }<span>${ s6e(part) }</span>`;
            }
        }
        this.$missingValueButton.querySelector('.list').innerHTML = label;
    }

    _createMissingValuesCtrl() {
        this.missingValueEditor = new MissingValueEditor(this.model);
        this.$missingValueButton = HTML.parse(`
            <div class="missing-values">
                <label class="label">${_('Missing values')}<button class="list" tabindex="0"></button></label>
            </div>`);
        this.$left.append(this.$missingValueButton);
        let $list = this.$missingValueButton.querySelector('.list');
        $list.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('edit:missing', { detail: this.missingValueEditor, bubbles: true }));
        });
        $list.addEventListener('keyup', (event: KeyboardEvent) => {
            if (event.keyCode === 13) {
                // Cancel the default action, if needed
                event.preventDefault();
                // Trigger the button element with a click
                this.dispatchEvent(new CustomEvent('edit:missing', { detail: this.missingValueEditor, bubbles: true }));
              }
        });

        $list.addEventListener('keypress', (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
                this.dispatchEvent(new CustomEvent('edit:missing', { detail: this.missingValueEditor, bubbles: true }));
                event.preventDefault();
                event.stopPropagation();
            }
        });
    }

    _createMeasureTypeListBox() {
        let $measureBox = HTML.parse('<div class="measure-box"></div>');
        this.$left.append($measureBox);
        let $measureLabel = HTML.parse(`<label class="label">${_('Measure type')}</label>`);
        $measureBox.append($measureLabel);
        this.$measureIcon = HTML.parse('<div class="icon"></div>');
        $measureBox.append(this.$measureIcon);
        this.$measureList = HTML.parse(`<select id="type">
                                    <option value="nominal">${_('Nominal')}</option>
                                    <option value="ordinal">${_('Ordinal')}</option>
                                    <option value="continuous">${_('Continuous')}</option>
                                    <option value="id">${_('ID')}</option>
                                </select>`);
        $measureLabel.append(this.$measureList);
        this.$measureList.value = 'nominal';


        this.measureList = new MeasureList(false);
        this.$measureList.setAttribute('aria-owns', this.measureList.id);
        this.$measureList.addEventListener('mousedown', (event) => {
            if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$measureList) {
                dropdown.hide();
                this.$measureList.setAttribute('aria-expanded', 'false');
            }
            else {
                this.measureList.setParent(this.$measureList);
                dropdown.show(this.$measureList, this.measureList);
                this.$measureList.setAttribute('aria-expanded', 'true');
            }
            event.preventDefault();
            event.stopPropagation();
            this.$measureList.focus();
        });

        this.measureList.addEventListener('selected-measure-type', (event: CustomEvent<MeasureType>) => {
            let measureType = event.detail;
            this.model.set({ measureType: measureType, autoMeasure: false });
            dropdown.hide();
            this.$measureList.setAttribute('aria-expanded', 'false');
        });
        this.$measureIcon.setAttribute('measure-type', this.model.get('measureType'));

        this.$measureList.addEventListener('change', event => {
            let mt = this.$measureList.value as MeasureType;
            this.model.set({ measureType: mt, autoMeasure: false });
        });

        this.$measureList.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$measureList) {
                    dropdown.hide();
                    this.$measureList.setAttribute('aria-expanded', 'false');
                }
                else
                {
                    this.measureList.setParent(this.$measureList);
                    dropdown.show(this.$measureList, this.measureList);
                    this.$measureList.setAttribute('aria-expanded', 'true');
                }
                event.preventDefault();
                event.stopPropagation();
                this.$measureList.focus();
            }
            else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                dropdown.hide();
                this.$measureList.focus();
            }
        });
    }

    _moveUp() {
        if (this.attached === false)
            return;
        if (this.model.attributes.measureType === 'continuous')
            return;
        let index = this.selectedLevelIndex;
        if (index < 1)
            return;

        this._focusLevelControls();

        let levels = this.model.get('levels');
        let clone  = levels.slice(0);
        let item   = clone.splice(index, 1)[0];
        clone.splice(index - 1, 0, item);
        this.selectedLevelIndex--;
        this.model.levelsReordered = true;
        this.model.set('levels', clone);
    }

    _moveDown() {
        if (this.attached === false)
            return;
        if (this.model.attributes.measureType === 'continuous')
            return;

        let index = this.selectedLevelIndex;
        let levels = this.model.get('levels');
        if (index === -1 || index >= levels.length - 1)
            return;

        this._focusLevelControls();

        let clone  = levels.slice(0);
        let item   = clone.splice(index, 1)[0];
        clone.splice(index + 1, 0, item);
        this.selectedLevelIndex++;
        this.model.levelsReordered = true;
        this.model.set('levels', clone);
    }

    _enableDisableMoveButtons() {
        if (this.model.attributes.measureType !== 'continuous' && this.model.attributes.ids !== null /*&& this.model.attributes.ids.length === 1*/) {
            let levels = this.model.get('levels');
            let index  = this.selectedLevelIndex;
            this.$moveUp.classList.toggle('disabled', levels === null || index < 1);
            this.$moveDown.classList.toggle('disabled', levels === null || index >= levels.length - 1 || index === -1);
        }
        else {
            this.$moveUp.classList.add('disabled');
            this.$moveDown.classList.add('disabled');
        }

        if (this.model.attributes.measureType !== 'continuous' && this.model.attributes.ids !== null && this.model.attributes.measureType !== 'id')
            this.$addLevelButton.classList.remove('disabled');
        else
            this.$addLevelButton.classList.add('disabled');
    }

    _focusLevelControls() {
        if (this.$levelsCrtl.classList.contains('super-focus'))
            return;

        this.model.suspendAutoApply();
        this.$levelsCrtl.classList.add('super-focus');
        tarp.show('levels', true, 0.1, 299).then(() => {
            let $ctrl = this.$levelsCrtl;
            $ctrl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            $ctrl.classList.remove('super-focus');
            this.model.apply();
        }, () => {
            let $ctrl = this.$levelsCrtl;
            $ctrl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
            $ctrl.classList.remove('super-focus');
            this.model.apply();
        });
    }

    _clickLevel(event: Event) {
        this._focusLevelControls();
        this.$levelItems.forEach(el => el.classList.remove('selected'));
        let $level = event.currentTarget as HTMLElement;
        $level.classList.add('selected');

        let index = [...this.$levelItems].indexOf($level);
        this.selectedLevelIndex = index;
        this._enableDisableMoveButtons();
    }

    _setOptions(dataType: DataType, measureType: MeasureType, levels) {
        if ( ! this.attached)
            return;

        this.$dataTypeList.value = dataType;
        this.$measureIcon.setAttribute('measure-type', measureType);
        this.$measureList.value = measureType;

        if (levels === null || levels.length === 0) {
            this.$levels.innerHTML = '';
            this.levelCtrls = [];
        }
        else if (this.levelCtrls.length > levels.length) {
            for (let i = levels.length; i < this.$levelItems.length; i++)
                this.$levelItems[i].remove();
            this.levelCtrls.splice(levels.length, this.levelCtrls.length - levels.length);
        }

        this.$moveUp.classList.add('disabled');
        this.$moveDown.classList.add('disabled');

        if (levels) {

            if (this.selectedLevelIndex >= levels.length)
                this.selectedLevelIndex = -1;

            if (this.selectedLevelIndex !== -1 && levels[this.selectedLevelIndex].label === null)
                this.selectedLevelIndex = -1;

            this.$levelItems.forEach(el => el.classList.remove('selected'));
            for (let i = 0; i < levels.length; i++) {
                let level = levels[i];
                let levelCtrl: DataVarLevelWidget = null;
                if (i >= this.levelCtrls.length) {
                    levelCtrl = new DataVarLevelWidget(level, this.model, i);

                    this.$levels.append(levelCtrl);
                    this.levelCtrls.push(levelCtrl);

                    levelCtrl.addEventListener('click', this._clickLevel);
                }
                else {
                    levelCtrl = this.levelCtrls[i];
                    levelCtrl.updateLevel(level);
                }

                if (i === this.selectedLevelIndex)
                    levelCtrl.classList.add('selected');
            }
        }

        this.$levelItems = this.$levels.querySelectorAll('.jmv-variable-editor-level');

        this._enableDisableMoveButtons();
    }

    _setAutoMeasure(auto) {
        if ( ! this.attached)
            return;
        if (auto)
            this.$autoType.style.display = '';
        else
            this.$autoType.style.display = 'none';
    }

    detach() {
        if ( ! this.attached)
            return;

        this.attached = false;
    }

    attach() {
        this.attached = true;

        this.selectedLevelIndex = -1;
        this._setAutoMeasure(this.model.get('autoMeasure'));
        this._setOptions(
            this.model.get('dataType'),
            this.model.get('measureType'),
            this.model.get('levels'));
        this._setMissingValues(this.model.get('missingValues'));
    }
}

customElements.define('jmv-data-variable-editor', DataVarWidget);

export default DataVarWidget;
