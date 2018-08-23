
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const keyboardJS = require('keyboardjs');
const dropdown = require('./dropdown');
const TransformList = require('./transformlist');
const VariableList = require('./variablelist');

const RecodedVarWidget = Backbone.View.extend({
    className: 'RecodedVarWidget',
    initialize(args) {

        this.attached = false;

        dropdown.init();
        this.$el.empty();
        this.$el.addClass('jmv-variable-recoded-widget');

        this.$top = $('<div class="jmv-variable-recoded-top"></div>').appendTo(this.$el);
        $('<div>recoded from variable</div>').appendTo(this.$top);
        this.$variableList = $('<select class="recoded-from"></select>').appendTo(this.$top);
        $('<div>using</div>').appendTo(this.$top);
        this.$transformList = $('<select id="transform-type"><option value="None">None</option></select>').appendTo(this.$top);

        $('<div>There are 10 recoded variables using this transform.</div>').appendTo(this.$el);

        this._updateChannelList();

        this.variableList = new VariableList();
        this.$variableList.on('mousedown', (event) => {
            dropdown.show(this.$variableList, this.variableList);
            event.preventDefault();
            event.stopPropagation();
            this.$variableList.focus();
        });

        this.variableList.$el.on('selected-variable', (event, variable) => {
            this.model.set('parentId', variable.id);
            dropdown.hide();
        });

        this.transformList = new TransformList();
        this.$transformList.on('mousedown', (event) => {
            dropdown.show(this.$transformList, this.transformList);
            event.preventDefault();
            event.stopPropagation();
            this.$transformList.focus();
        });

        this.transformList.$el.on('selected-transform', (event, transform) => {
            this.model.set('transform', transform.id);
            dropdown.hide();
        });

        this.transformList.$el.on('edit-transform', (event, transform) => {
            let dataset = this.model.dataset;
            this.$el.trigger('edit:transform', transform.id);
            dropdown.hide();
        });

        this.transformList.$el.on('remove-transform', (event, transform) => {
            let dataset = this.model.dataset;
            dataset.removeTransforms([transform.id]);
            let transformId = this.model.get('transform');
            if (transformId === transform.id)
                this.model.set('transform', 0);
        });

        this.transformList.$el.on('create-transform', (event) => {
            let dataset = this.model.dataset;
            dataset.setTransforms([ { id: 0, values: { description: '', formula: '' } } ]).then(() => {
                this.$el.trigger('transform-selected');
                let transforms = dataset.get('transforms');
                let transformId = transforms[transforms.length - 1].id;
                this.model.set('transform', transformId);
                this.$el.trigger('edit:transform', transformId);
            }).then(() => {
                dropdown.hide();
            });
        });

        this.model.on('change:transform', event => {
            if (this.attached === false)
                return;

            let transformId = this.model.get('transform');
            if (transformId === null || transformId === 0)
                this.$transformList.val('None');
            else {
                let transform = this.model.dataset.getTransformById(transformId);
                if (transform ===undefined)
                    this.$transformList.val('None');
                else
                    this.$transformList.val(transform.name);
            }
        });

        this.model.on('change:parentId', event => {
            if (this.attached === false)
                return;

            let dataset = this.model.dataset;
            let parentId = this.model.get('parentId');
            let column = dataset.getColumnById(parentId);
            if (column) {
                this.$variableList.val(column.name);
                this.$variableList.attr('variable-type', column.measureType);
                this.$variableList.attr('data-type', column.dataType);
            }
            else {
                let columns = dataset.attributes.columns;
                for (let i = 0; i < columns.length; i++) {
                    if (columns[i].columnType === 'data') {
                        this.$variableList.val(column.name);
                        this.$variableList.attr('variable-type', columns[i].measureType);
                        this.$variableList.attr('data-type', columns[i].dataType);
                        break;
                    }
                }
            }
        });

        this.model.dataset.on('transformsChanged', this._updateTransformList, this);
        this.model.dataset.on('dataSetLoaded', this._onDatasetLoaded, this);
        this.model.dataset.on('columnsChanged', this._updateChannelList, this);

    },
    _onDatasetLoaded() {
        this._updateChannelList();
        this._updateTransformList();
    },
    _updateChannelList() {
        if (this.attached === false)
            return;

        let dataset = this.model.dataset;
        let columns = dataset.attributes.columns;
        this.variableList.populate(columns);

        this.$variableList.empty();
        for (let i = 0; i < columns.length; i++) {
            if (columns[i].columnType === 'data')
                this.$variableList.append($('<option>' + columns[i].name + '</option>'));
        }

        let parentId = this.model.get('parentId');
        let column = dataset.getColumnById(parentId);
        if (column) {
            this.$variableList.val(column.name);
            this.$variableList.attr('variable-type', column.measureType);
            this.$variableList.attr('data-type', column.dataType);
        }
        else {
            for (let i = 0; i < columns.length; i++) {
                if (columns[i].columnType === 'data') {
                    this.$variableList.val(columns[i].name);
                    this.$variableList.attr('variable-type', columns[i].measureType);
                    this.$variableList.attr('data-type', columns[i].dataType);
                    break;
                }
            }
        }
    },
    _updateTransformList() {
        if (this.attached === false)
            return;

        let transforms = this.model.dataset.get('transforms');
        this.transformList.populate(transforms);

        this.$transformList.empty();
        this.$transformList.append('<option value="None">None</option>');
        for (let transform of transforms)
            this.$transformList.append('<option value="' + transform.name + '">' + transform.name + '</option>');

        let transformId = this.model.get('transform');
        if (transformId === null || transformId === 0)
            this.$transformList.val('None');
        else {
            let transform = this.model.dataset.getTransformById(transformId);
            if (transform ===undefined)
                this.$transformList.val('None');
            else
                this.$transformList.val(transform.name);
        }
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
    }

});

module.exports = RecodedVarWidget;
