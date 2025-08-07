
'use strict';

import dropdown from './dropdown';
import TransformList from './transformlist';
import VariableList from './variablelist';
import ColourPalette from '../editors/colourpalette';
import Notify from '../notification';
import VariableModel from './variablemodel';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import { Column, Transform } from '../dataset';

let instanceID = 0;

class RecodedVarWidget extends HTMLElement {

    model: VariableModel;
    attached: boolean = false;
    _editNote: Notify = new Notify({ duration: 3000 });

    $variableIcon: HTMLElement;
    $variableList: HTMLSelectElement;
    $transformIcon: HTMLElement;
    $transformList: HTMLSelectElement;
    $editTransform: HTMLButtonElement;
    $errorMessage: HTMLElement;

    variableList: VariableList;
    transformList: TransformList;

    constructor(model: VariableModel) {
        super();

        this.model = model;

        instanceID += 1;
        
        dropdown.init();

        this.classList.add('jmv-variable-recoded-widget', 'RecodedVarWidget');
        let id1 = `transform-var-list-${instanceID}`;
        let $top = HTML.parse('<div class="jmv-variable-recoded-top"></div>');
        this.append($top);
        $top.append(HTML.parse(`<label for="${id1}" class="variable-list-label single-variable-support">${_('Source variable')}</label>`));
        this.$variableIcon = HTML.parse('<div class="variable-type-icon single-variable-support"></div>');
        $top.append(this.$variableIcon);
        this.$variableList = HTML.parse(`<select id="${id1}" class="recoded-from single-variable-support"></select>`);
        $top.append(this.$variableList);

        let id2 = `transform-list-${instanceID}`;
        $top.append(HTML.parse(`<label for="${id2}" class="transform-label">${_('using transform')}</label>`));
        this.$transformIcon = HTML.parse('<div class="transform-icon"></div>');
        $top.append(this.$transformIcon);
        this.$transformList = HTML.parse(`<select id="${id2}" id="transform-type"><option value="None">${_('None')}</option></select>`);
        $top.append(this.$transformList);
        this.$editTransform = HTML.parse(`<button class="edit-button">${_('Edit...')}</button>`);
        $top.append(this.$editTransform);
        this.$errorMessage = HTML.parse(`<div class="error-msg">${_('This transform is in error and should be edited.')}</div>`);
        $top.append(this.$errorMessage);
        this.$editTransform.addEventListener('click', (event) => {
            let transformId = this.model.get('transform');
            if (transformId !== null && transformId !== 0)
                this.dispatchEvent(new CustomEvent('edit:transform', { detail: transformId, bubbles: true }));
        });

        this._updateChannelList();

        this.variableList = new VariableList();
        this.$variableList.setAttribute('aria-owns', this.variableList.id);
        this.$variableList.addEventListener('mousedown', (event) => {
            if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$variableList)
                dropdown.hide();
            else
            {
                this.variableList.setParent(this.$variableList);
                dropdown.show(this.$variableList, this.variableList);
            }
            event.preventDefault();
            event.stopPropagation();
            this.$variableList.focus();
        });

        this.$variableList.addEventListener('change', event => {
            this.model.set('parentId', parseInt(this.$variableList.value));
        });

        this.$variableList.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$variableList)
                    dropdown.hide();
                else
                {
                    this.variableList.setParent(this.$variableList);
                    dropdown.show(this.$variableList, this.variableList);
                }
                event.stopPropagation();
                event.preventDefault();
                this.$variableList.focus();
            }
            else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                dropdown.hide();
                this.$variableList.focus();
            }
        });

        this.variableList.addEventListener('selected-variable', (event: CustomEvent<Column>) => {
            let variable = event.detail;
            this.model.set('parentId', variable.id);
            dropdown.hide();
        });

        this.transformList = new TransformList();
        this.$transformList.setAttribute('aria-owns', this.transformList.id);
        this.$transformList.addEventListener('mousedown', (event) => {
            if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$transformList)
                dropdown.hide();
            else
                dropdown.show(this.$transformList, this.transformList);
            event.preventDefault();
            event.stopPropagation();
            this.$transformList.focus();
        });

        this.$transformList.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$transformList)
                    dropdown.hide();
                else
                    dropdown.show(this.$transformList, this.transformList);
                event.stopPropagation();
                event.preventDefault();
                this.$transformList.focus();
            }
        });


        this.transformList.addEventListener('selected-transform', (event: CustomEvent<Transform>) => {
            let transform = event.detail;
            this.model.set('transform', transform.id);
            this._updateTransformColour();
            dropdown.hide();
        });

        this.transformList.addEventListener('edit-transform', (event: CustomEvent<Transform>) => {
            let transform = event.detail;
            this.dispatchEvent(new CustomEvent('edit:transform', { detail: transform.id, bubbles: true }));
            dropdown.hide();
        });

        this.transformList.addEventListener('duplicate-transform', (event: CustomEvent<Transform>) => {
            let transform = event.detail;
            let copy = {
                name: transform.name,
                description: transform.description,
                suffix: transform.suffix,
                formula: transform.formula,
                measureType: transform.measureType
            };
            this._createTransform(copy);
        });

        this.transformList.addEventListener('remove-transform', (event: CustomEvent<Transform>) => {
            let transform = event.detail;
            let dataset = this.model.dataset;
            dataset.removeTransforms([transform.id]).catch((error) => {
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            });
        });

        this.transformList.addEventListener('create-transform', (event) => {
            this._createTransform();
        });

        this.model.on('change:transform', event => {
            if (this.attached === false)
                return;

            this.$errorMessage.classList.remove('show');
            let transformId = this.model.get('transform');
            if (transformId === null) {
                this.$transformList.value = '';
                this.$editTransform.classList.add('disabled');
            }
            else if (transformId === 0) {
                this.$transformList.value = 'None';
                this.$editTransform.classList.add('disabled');
            }
            else {
                let transform = this.model.dataset.getTransformById(transformId);
                if (transform ===undefined)
                {
                    this.$transformList.value = 'None';
                    this.$editTransform.classList.add('disabled');
                }
                else {
                    this.$transformList.value = transform.name;
                    this.$editTransform.classList.remove('disabled');
                    for (let msg of transform.formulaMessage) {
                        if (msg !== '') {
                            this.$errorMessage.classList.add('show');
                            break;
                        }
                    }
                }
            }
            this._updateTransformColour();
        });

        this.model.on('change:parentId', event => {
            if (this.attached === false)
                return;

            let dataset = this.model.dataset;
            let parentId = this.model.get('parentId');
            let column = dataset.getColumnById(parentId);
            if (column) {
                this.$variableList.value = column.id.toString();
                this.$variableIcon.setAttribute('variable-type', column.measureType);
                this.$variableIcon.setAttribute('data-type', column.dataType);
            }
            else {
                this.$variableList.value = 'None';
                this.$variableIcon.setAttribute('variable-type', 'none');
                this.$variableIcon.setAttribute('data-type', 'none');
            }
        });

        this.model.dataset.on('transformsChanged transformRemoved', this._updateTransformList, this);
        this.model.dataset.on('dataSetLoaded', this._onDatasetLoaded, this);
        this.model.dataset.on('columnsChanged', this._updateChannelList, this);

    }

    _updateTransformColour() {
        let transformId = this.model.get('transform');
        if (transformId === null || transformId === 0)
            this.$transformIcon.style.opacity = '0';
        else {
            let transform = this.model.dataset.getTransformById(transformId);
            this.$transformIcon.style.backgroundColor = ColourPalette.get(transform.colourIndex);
            this.$transformIcon.style.opacity = '1';
        }
    }

    _createTransform(values?: Partial<Transform>) {
        if (values === undefined)
            values = { description: '', formula: ['$source'] };
        let dataset = this.model.dataset;
        dataset.setTransforms([ { id: 0, values: values } ]).then(() => {
            this.dispatchEvent(new CustomEvent('transform-selected'));
            let transforms = dataset.get('transforms');
            let transformId = transforms[transforms.length - 1].id;
            this.model.set('transform', transformId);
            this.dispatchEvent(new CustomEvent('edit:transform', { detail: transformId, bubbles: true }));
        }).then(() => {
            dropdown.hide();
        }).catch((error) => {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        });
    }

    _notifyEditProblem(details) {
        this._editNote.set(details);
        this.dispatchEvent(new CustomEvent('notification', { detail: this._editNote, bubbles: true }));
    }

    _onDatasetLoaded() {
        this._updateChannelList();
        this._updateTransformList();
    }

    _updateChannelList(event?) {
        if (this.attached === false)
            return;

        let currentColumnId = this.model.attributes.ids[0];
        let dataset = this.model.dataset;
        let currentColumnName = dataset.getColumnById(currentColumnId).name;
        if (event && event.changed.length === 1 && event.changed[0] === currentColumnName)
            return;
        
        let columns = [];
        for (let column of dataset.attributes.columns) {
            if (column.id !== currentColumnId && column.columnType !== 'none' && column.columnType !== 'filter')
                columns.push(column);
        }
        this.variableList.populate(columns);

        this.$variableList.innerHTML = '';
        this.$variableList.append(HTML.parse(`<option value="0">${_('None')}</option>`));
        for (let i = 0; i < columns.length; i++)
            this.$variableList.append(HTML.parse(`<option value=${ columns[i].id }>${ columns[i].name }</option>`));

        let parentId = this.model.get('parentId');
        let column = dataset.getColumnById(parentId);
        if (column) {
            this.$variableList.value = column.id.toString();
            this.$variableIcon.setAttribute('variable-type', column.measureType);
            this.$variableIcon.setAttribute('data-type', column.dataType);
        }
        else {
            this.$variableList.value = '0';
            this.$variableIcon.setAttribute('variable-type', 'none');
            this.$variableIcon.setAttribute('data-type', 'none');
        }

        this._updateErrorMessage();
    }

    _updateErrorMessage() {
        this.$errorMessage.classList.remove('show');

        let errorMsg = this.model.get('formulaMessage');
        if (errorMsg === '') {
            let transformId = this.model.get('transform');
            if (transformId !== null && transformId !== 0) {
                let transform = this.model.dataset.getTransformById(transformId);
                for (let msg of transform.formulaMessage) {
                    if (msg !== '') {
                        errorMsg = _('The selected transform is in error and should be edited.');

                        break;
                    }
                }
            }
        }

        if (errorMsg !== '') {
            this.$errorMessage.textContent = errorMsg;
            this.$errorMessage.classList.add('show');
        }
    }

    _updateTransformList() {
        if (this.attached === false)
            return;

        let transforms = this.model.dataset.get('transforms');
        this.transformList.populate(transforms);

        this.$transformList.innerHTML = '';
        this.$transformList.append(HTML.parse(`<option value="None">${_('None')}</option>`));
        for (let transform of transforms)
            this.$transformList.append(HTML.parse('<option value="' + transform.name + '">' + transform.name + '</option>'));

        let transformId = this.model.get('transform');

        if (transformId === null) {
            this.$transformList.value = '';
            this.$editTransform.classList.add('disabled');
        }
        else if (transformId === 0) {
            this.$transformList.value = 'None';
            this.$editTransform.classList.add('disabled');
        }
        else {
            let transform = this.model.dataset.getTransformById(transformId);
            if (transform ===undefined) {
                this.$transformList.value = 'None';
                this.$editTransform.classList.add('disabled');
            }
            else {
                this.$transformList.value = transform.name;
                this.$editTransform.classList.remove('disabled');
            }
        }

        this._updateErrorMessage();
    }

    detach() {
        if ( ! this.attached)
            return;

        this.attached = false;
    }

    attach() {
        this.attached = true;
        this._updateChannelList();
        this._updateTransformList();
        this._updateTransformColour();
        this._updateErrorMessage();
    }

}

customElements.define('jmv-recode-variable-editor', RecodedVarWidget);

export default RecodedVarWidget;
