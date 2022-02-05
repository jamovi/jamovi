
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const keyboardJS = require('keyboardjs');
const dropdown = require('./dropdown');
const TransformList = require('./transformlist');
const VariableList = require('./variablelist');
const ColourPalette = require('../editors/colourpalette');
const Notify = require('../notification');

const RecodedVarWidget = Backbone.View.extend({
    className: 'RecodedVarWidget',
    initialize(args) {

        this.attached = false;

        this._editNote = new Notify({ duration: 3000 });

        dropdown.init();
        this.$el.empty();
        this.$el.addClass('jmv-variable-recoded-widget');

        this.$top = $('<div class="jmv-variable-recoded-top"></div>').appendTo(this.$el);
        $(`<div class="variable-list-label single-variable-support">${_('Source variable')}</div>`).appendTo(this.$top);
        this.$variableIcon = $('<div class="variable-type-icon single-variable-support"></div>').appendTo(this.$top);
        this.$variableList = $('<select class="recoded-from single-variable-support"></select>').appendTo(this.$top);
        $(`<div class="transform-label">${_('using transform')}</div>`).appendTo(this.$top);
        this.$transformIcon = $('<div class="transform-icon"></div>').appendTo(this.$top);
        this.$transformList = $(`<select id="transform-type"><option value="None">${_('None')}</option></select>`).appendTo(this.$top);
        this.$editTransform = $(`<div class="edit-button">${_('Edit...')}</div>`).appendTo(this.$top);
        this.$errorMessage = $(`<div class="error-msg">${_('This transform is in error and should be edited.')}</div>`).appendTo(this.$top);
        this.$editTransform.on('click', (event) => {
            let transformId = this.model.get('transform');
            if (transformId !== null && transformId !== 0)
                this.$el.trigger('edit:transform', transformId);
        });

        this._updateChannelList();

        this.variableList = new VariableList();
        this.$variableList.on('mousedown', (event) => {
            if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$variableList)
                dropdown.hide();
            else
            {
                this.variableList.setParent(this.$variableList);
                keyboardJS.pause('variable-list');
                dropdown.show(this.$variableList, this.variableList).then(() => {
                    keyboardJS.resume('variable-list');
                });
            }
            event.preventDefault();
            event.stopPropagation();
            this.$variableList.focus();
        });

        this.$variableList.focus(() => {
            keyboardJS.pause('');
        } );

        this.$variableList.blur(() => {
            keyboardJS.resume();
        } );

        this.$variableList.on('change', event => {
            this.model.set('parentId', parseInt(this.$variableList.val()));
        });

        this.$variableList.on('keydown', event => {
            if (event.key === 'Enter') {
                if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$variableList)
                    dropdown.hide();
                else
                {
                    this.variableList.setParent(this.$variableList);
                    keyboardJS.pause('variable-list');
                    dropdown.show(this.$variableList, this.variableList).then(() => {
                        keyboardJS.resume('variable-list');
                    });
                }
                event.stopPropagation();
                event.preventDefault();
                this.$variableList.focus();
            }
        });

        this.variableList.$el.on('selected-variable', (event, variable) => {
            this.model.set('parentId', variable.id);
            dropdown.hide();
        });

        this.transformList = new TransformList();
        this.$transformList.on('mousedown', (event) => {
            if (dropdown.isVisible() === true && dropdown.focusedOn() === this.$transformList)
                dropdown.hide();
            else
                dropdown.show(this.$transformList, this.transformList);
            event.preventDefault();
            event.stopPropagation();
            this.$transformList.focus();
        });

        this.transformList.$el.on('selected-transform', (event, transform) => {
            this.model.set('transform', transform.id);
            this._updateTransformColour();
            dropdown.hide();
        });

        this.transformList.$el.on('edit-transform', (event, transform) => {
            let dataset = this.model.dataset;
            this.$el.trigger('edit:transform', transform.id);
            dropdown.hide();
        });

        this.transformList.$el.on('duplicate-transform', (event, transform) => {
            let dataset = this.model.dataset;
            let copy = {
                name: transform.name,
                description: transform.description,
                suffix: transform.suffix,
                formula: transform.formula,
                measureType: transform.measureType
            };
            this._createTransform(copy);
        });

        this.transformList.$el.on('remove-transform', (event, transform) => {
            let dataset = this.model.dataset;
            dataset.removeTransforms([transform.id]).catch((error) => {
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            });
        });

        this.transformList.$el.on('create-transform', (event) => {
            this._createTransform();
        });

        this.model.on('change:transform', event => {
            if (this.attached === false)
                return;

            this.$errorMessage.removeClass('show');
            let transformId = this.model.get('transform');
            if (transformId === null) {
                this.$transformList.val('');
                this.$editTransform.addClass('disabled');
            }
            else if (transformId === 0) {
                this.$transformList.val('None');
                this.$editTransform.addClass('disabled');
            }
            else {
                let transform = this.model.dataset.getTransformById(transformId);
                if (transform ===undefined)
                {
                    this.$transformList.val('None');
                    this.$editTransform.addClass('disabled');
                }
                else {
                    this.$transformList.val(transform.name);
                    this.$editTransform.removeClass('disabled');
                    for (let msg of transform.formulaMessage) {
                        if (msg !== '') {
                            this.$errorMessage.addClass('show');
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
                this.$variableList.val(column.id);
                this.$variableIcon.attr('variable-type', column.measureType);
                this.$variableIcon.attr('data-type', column.dataType);
            }
            else {
                this.$variableList.val('None');
                this.$variableIcon.attr('variable-type', 'none');
                this.$variableIcon.attr('data-type', 'none');
            }
        });

        this.model.dataset.on('transformsChanged transformRemoved', this._updateTransformList, this);
        this.model.dataset.on('dataSetLoaded', this._onDatasetLoaded, this);
        this.model.dataset.on('columnsChanged', this._updateChannelList, this);

    },
    _updateTransformColour() {
        let transformId = this.model.get('transform');
        if (transformId === null || transformId === 0)
            this.$transformIcon.css('opacity', 0);
        else {
            let transform = this.model.dataset.getTransformById(transformId);
            this.$transformIcon.css({ 'background-color': ColourPalette.get(transform.colourIndex), 'opacity': 1 });
        }
    },
    _createTransform(values) {
        if (values === undefined)
            values = { description: '', formula: '$source' };
        let dataset = this.model.dataset;
        dataset.setTransforms([ { id: 0, values: values } ]).then(() => {
            this.$el.trigger('transform-selected');
            let transforms = dataset.get('transforms');
            let transformId = transforms[transforms.length - 1].id;
            this.model.set('transform', transformId);
            this.$el.trigger('edit:transform', transformId);
        }).then(() => {
            dropdown.hide();
        }).catch((error) => {
            this._notifyEditProblem({
                title: error.message,
                message: error.cause,
                type: 'error',
            });
        });
    },
    _notifyEditProblem(details) {
        this._editNote.set(details);
        this.trigger('notification', this._editNote);
    },
    _onDatasetLoaded() {
        this._updateChannelList();
        this._updateTransformList();
    },
    _updateChannelList() {
        if (this.attached === false)
            return;

        let currentColumnId = this.model.attributes.ids[0];
        let dataset = this.model.dataset;
        let columns = [];
        for (let column of dataset.attributes.columns) {
            if (column.id !== currentColumnId && column.columnType !== 'none' && column.columnType !== 'filter')
                columns.push(column);
        }
        this.variableList.populate(columns);

        this.$variableList.empty();
        this.$variableList.append($(`<option value="0">${_('None')}</option>`));
        for (let i = 0; i < columns.length; i++)
            this.$variableList.append($(`<option value=${ columns[i].id }>${ columns[i].name }</option>`));

        let parentId = this.model.get('parentId');
        let column = dataset.getColumnById(parentId);
        if (column) {
            this.$variableList.val(column.id);
            this.$variableIcon.attr('variable-type', column.measureType);
            this.$variableIcon.attr('data-type', column.dataType);
        }
        else {
            this.$variableList.val(0);
            this.$variableIcon.attr('variable-type', 'none');
            this.$variableIcon.attr('data-type', 'none');
        }

        this._updateErrorMessage();
    },
    _updateErrorMessage() {
        this.$errorMessage.removeClass('show');

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
            this.$errorMessage[0].textContent = errorMsg;
            this.$errorMessage.addClass('show');
        }
    },
    _updateTransformList() {
        if (this.attached === false)
            return;

        let transforms = this.model.dataset.get('transforms');
        this.transformList.populate(transforms);

        this.$transformList.empty();
        this.$transformList.append(`<option value="None">${_('None')}</option>`);
        for (let transform of transforms)
            this.$transformList.append('<option value="' + transform.name + '">' + transform.name + '</option>');

        let transformId = this.model.get('transform');

        if (transformId === null) {
            this.$transformList.val('');
            this.$editTransform.addClass('disabled');
        }
        else if (transformId === 0) {
            this.$transformList.val('None');
            this.$editTransform.addClass('disabled');
        }
        else {
            let transform = this.model.dataset.getTransformById(transformId);
            if (transform ===undefined) {
                this.$transformList.val('None');
                this.$editTransform.addClass('disabled');
            }
            else {
                this.$transformList.val(transform.name);
                this.$editTransform.removeClass('disabled');
            }
        }

        this._updateErrorMessage();
    },
    detach() {
        if ( ! this.attached)
            return;

        this.attached = false;
    },
    attach() {
        this.attached = true;
        this._updateChannelList();
        this._updateTransformList();
        this._updateTransformColour();
        this._updateErrorMessage();
    }

});

module.exports = RecodedVarWidget;
