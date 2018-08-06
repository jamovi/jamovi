
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const VariableModel = Backbone.Model.extend({

    initialize(dataset) {
        this.dataset = dataset;
        this.original = { };

        this.on('change', event => {
            let changes = false;
            for (let name in this.original) {
                if ( ! _.isEqual(this.attributes[name], this.original[name])) {
                    changes = true;
                    break;
                }
            }
            this.set('changes', changes);
            if (changes) {
                this.dataset.set('varEdited', changes);
            }

            if (this.get('autoApply') && !this._applyId && this.get('changes')) {
                this._applyId = setTimeout(() => {
                    this.apply();
                    this._applyId = null;
                }, 0);
            }
        });

        this.dataset.on('columnsChanged', (event) => {
            let id = this.get('id');
            for (let changes of event.changes) {

                if (changes.created || changes.deleted)
                    continue;

                if (changes.id === id)
                    this.setColumn(changes.id);
            }
        });
    },
    suspendAutoApply() {
        this.set('autoApply', false);
    },
    defaults : {
        name : null,
        id: null,
        columnType: null,
        dataType: null,
        measureType : null,
        autoMeasure : false,
        levels : null,
        dps : 0,
        changes : false,
        formula : '',
        formulaMessage : '',
        description: '',
        hidden: false,
        active: true,
        filterNo: -1,
        importName: '',
        trimLevels: true,
        autoApply: true,
        transform: 0 // zero means 'none'
    },
    editLevelLabel(index, label) {

        label = label.trim();
        let levels = this.get('levels');
        let level = levels[index];
        if (level.label === label)
            return level;

        level = Object.assign({}, level);  // clones
        levels = levels.slice();

        let valueAsString = Number(level.value).toString();

        if (label === '') {
            // if empty, set back to the original
            label = valueAsString;
        }
        else if (label !== valueAsString) {
            // check that the label isn't already in use
            let existing = levels.map(level => level.label);

            if (Number.isFinite(Number(label)))
                label = '"' + label + '"';

            let newLabel = label; // modify label if already in use
            let c = 2;
            while (existing.includes(newLabel))
                newLabel = label + ' (' + c++ + ')';
            label = newLabel;
        }

        level.label = label;
        levels[index] = level;

        this.set({ levels: levels, changes: true, autoMeasure: false });
        this.dataset.set('varEdited', true);

        return level;
    },
    setup(dict) {
        this.original = dict;
        this.set(dict);
    },
    setColumn(id) {
        this.trigger('columnChanging');

        if (this._applyId) {
            clearTimeout(this._applyId);
            this._applyId = null;
            this.apply();
        }

        let column = this.dataset.getColumnById(id);
        this.original = {
            name : column.name,
            id : column.id,
            columnType: column.columnType,
            dataType: column.dataType,
            measureType : column.measureType,
            autoMeasure : column.autoMeasure,
            description: column.description,
            levels : column.levels,
            formula : column.formula,
            hidden : column.hidden,
            active : column.active,
            filterNo : column.filterNo,
            importName : column.importName,
            trimLevels : column.trimLevels,
            transform : column.transform
        };
        this.set(this.original);
        this.set('formulaMessage', column.formulaMessage);
    },
    apply() {

        this.set('autoApply', true);

        if (this.attributes.changes === false)
            return Promise.resolve();

        let values = {
            name: this.attributes.name.trim(),
            columnType: this.attributes.columnType,
            dataType: this.attributes.dataType,
            measureType: this.attributes.measureType,
            autoMeasure: this.attributes.autoMeasure,
            levels: this.attributes.levels,
            dps: this.attributes.dps,
            formula: this.attributes.formula,
            description: this.attributes.description,
            hidden: this.attributes.hidden,
            active: this.attributes.active,
            filterNo: this.attributes.filterNo,
            importName: this.attributes.importName,
            trimLevels: this.attributes.trimLevels,
            transform:  this.attributes.transform
        };

        let columnId = this.attributes.id;
        return this.dataset.changeColumn(this.attributes.id, values)
            .then(() => {
                if (columnId === this.attributes.id) {
                    let latestValues = {
                        name: this.attributes.name.trim(),
                        columnType: this.attributes.columnType,
                        dataType: this.attributes.dataType,
                        measureType: this.attributes.measureType,
                        autoMeasure: this.attributes.autoMeasure,
                        levels: this.attributes.levels,
                        dps: this.attributes.dps,
                        formula: this.attributes.formula,
                        description: this.attributes.description,
                        hidden: this.attributes.hidden,
                        active: this.attributes.active,
                        filterNo: this.attributes.filterNo,
                        importName: this.attributes.importName,
                        trimLevels: this.attributes.trimLevels,
                        transform: this.attributes.transform
                    };

                    this.original = latestValues;
                    this.set(this.original);
                    this.set('changes', false);
                    this.dataset.set('varEdited', false);

                    let column = this.dataset.getColumnById(this.attributes.id);
                    this.set('formulaMessage', column.formulaMessage);
                }
            });
    },
    revert() {
        this.set(this.original);
    },
    setColumnForEdit(id) {
        let columns = this.dataset.get('columns');
        for (let i = 0; i < columns.length; i++) {
            if (columns[i].id === id) {
                this.dataset.set('editingVar', i);
                break;
            }
        }
    }
});

module.exports = VariableModel;
