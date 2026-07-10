
'use strict';

import DataVarLevelWidget from './datavarlevelwidget';
import tarp from '../utils/tarp';
import dropdown from './dropdown';
import MissingValueEditor from '../editors/missingvalueeditor';
import MeasureList from './measurelist';
import interactionManager, { type FocusLoop } from '../../common/interactionmanager';
import { DataType, MeasureType } from '../dataset';
import VariableModel from './variablemodel';
import { h }  from '../../common/htmlelementcreator';
import MsgDialog from '../../common/msgdialog';

class DataVarWidget extends HTMLElement {

    attached: boolean = false;
    model: VariableModel;
    _focusLeaving: boolean;
    _addingLevel: boolean;
    _restoringLevelFocus: boolean;

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
    private levelsLoop: FocusLoop;

    constructor(model: VariableModel) {
        super();

        this.model = model;

        this._clickLevel = this._clickLevel.bind(this);

        dropdown.init();

        this.classList.add('jmv-variable-editor-datavarwidget', 'DataVarWidget');

        let $body = h('div', { class: 'jmv-datavarwidget-body' });
        this.append($body);
        this.$left = h('div', { class: 'jmv-variable-editor-widget-left' });
        $body.append(this.$left);

        this._createMeasureTypeListBox();

        let $dataType = h('div', { class: 'jmv-vareditor-datatype' });
        this.$left.append($dataType);
        let $dataLabel = h('label', { for: 'data-type' }, _('Data type'));
        $dataType.append($dataLabel)
        this.$dataTypeList = h('select', { id: 'data-type' },
            h('option', { value: 'integer' }, _('Integer')),
            h('option', { value: 'decimal' }, _('Decimal')),
            h('option', { value: 'text' }, _('Text')));
        $dataLabel.append(this.$dataTypeList);
        this.$autoType = h('div', { class: 'jmv-variable-editor-autotype' }, _('(auto)'));
        $dataType.append(this.$autoType);


        this._createMissingValuesCtrl();

        this.$levelsCrtl = h('div', { class: 'jmv-variable-editor-levels-control', tabindex: '0' });
        $body.append(this.$levelsCrtl);
        this.levelsLoop = interactionManager.registerLoop(this.$levelsCrtl, {
            level: 1,
            exitSelector: this.$levelsCrtl,
            exitKeys: ['Escape'],
            keyToEnter: true,
            modal: true,
        });
        this.levelsLoop.on('deactivate', () => {
            if (!this._addingLevel) {
                this._focusLeaving = true;
                tarp.hide('levels');
            }
        });
        this.$addLevelButton = h('button', { class: 'add-level', 'aria-label': _('Add new level') },
            h('span', { class: 'mif-plus' }));
        this.$levelsCrtl.append(this.$addLevelButton);
        let $levelsContainer = h('div', { class: 'container' });
        this.$levelsCrtl.append($levelsContainer);
        $levelsContainer.append(h('div', { class: 'title' }, _('Levels')));
        this.$levels = h('div', { class: 'levels' });
        $levelsContainer.append(this.$levels);
        this.$levelItems =this.$levels.querySelectorAll('.jmv-variable-editor-level');

        let $move = h('div', { class: 'jmv-variable-editor-widget-move' });
        this.$levelsCrtl.append($move);
        this.$moveUp = h('button', { class: 'jmv-variable-editor-widget-move-up' },
            h('span', { class: 'mif-arrow-up' }));
        $move.append(this.$moveUp);
        this.$moveDown = h('button', { class: 'jmv-variable-editor-widget-move-down' },
            h('span', { class: 'mif-arrow-down' }));
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
            if ( !this._addingLevel && !this._restoringLevelFocus && event.relatedTarget instanceof Node && ! this.$levelsCrtl.contains(event.relatedTarget))
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

                let msg = _('Enter level value');
                interactionManager.announce(msg);

                let response = await MsgDialog.show(msg, {cancel: _('Cancel'), ok: _('OK')}, '').then(async (result) => {
                    if (result.action === 'ok') {
                        let value = result.value!.trim();

                        let max = 0;
                        for (let column of this.model.columns) {
                            if (column.levels.length >  max) {
                                max = column.levels.length;
                            }
                        }

                        let n = max;
                        if (recordValue)
                            n = parseInt(value);

                        if (isNaN(n))
                            throw _('{r} is not an integer', { r: value });
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
                                    throw _('The level value {r} is already in use.', { r: value });
                            }
                            else {
                                getValues(levels, 'importValue');
                                let newN = value; // modify label if already in use
                                let c = 2;
                                while (existing.has(newN))
                                    newN = value + ' (' + c++ + ')';
                                value = newN;
                            }

                            if (value === '')
                                throw _(`The level value cannot be blank.`);

                            return { value: n, label: value };
                        }
                    }
                });

                if (response !== undefined) {
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
            this._restoringLevelFocus = true;
            this._addingLevel = false;
            this.$levelItems = this.$levels.querySelectorAll('.jmv-variable-editor-level');
            setTimeout(() => {
                this.$addLevelButton.focus();
                setTimeout(() => {
                    this._restoringLevelFocus = false;
                }, 0);
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

        let labels = [];
        //let missings = this.model.get('missingValues');
        if (missings !== null) {
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
                    labels.push(part);
            }
        }
        this.$missingValueButton.querySelector('.list').replaceChildren(...labels.map(label => h('span', {}, label)));
    }

    _createMissingValuesCtrl() {
        this.missingValueEditor = new MissingValueEditor(this.model);
        this.$missingValueButton = h('div', { class: 'missing-values' },
            h('label', { class: 'label' },
                _('Missing values'),
                h('button', { class: 'list', tabindex: '0' })));
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
        let $measureBox = h('div', { class: 'measure-box' });
        this.$left.append($measureBox);
        let $measureLabel = h('label', { class: 'label' }, _('Measure type'));
        $measureBox.append($measureLabel);
        this.$measureIcon = h('div', { class: 'icon' });
        $measureBox.append(this.$measureIcon);
        this.$measureList = h('select', { id: 'type' },
            h('option', { value: 'nominal' }, _('Nominal')),
            h('option', { value: 'ordinal' }, _('Ordinal')),
            h('option', { value: 'continuous' }, _('Continuous')),
            h('option', { value: 'id' }, _('ID')));
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
            this._closeLevelControls();
        }, () => {
            this._closeLevelControls();
        });
    }

    _closeLevelControls() {
        this.$levelsCrtl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        this.$levelsCrtl.classList.remove('super-focus');
        this.levelsLoop.deactivate({ source: 'programmatic' });
        this.model.apply();
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
