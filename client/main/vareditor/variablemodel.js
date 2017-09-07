
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
        });
    },
    defaults : {
        name : null,
        id: null,
        columnType: null,
        measureType : null,
        autoMeasure : false,
        levels : null,
        dps : 0,
        changes : false,
        formula : '',
        formulaMessage : '',
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
        let column = this.dataset.getColumnById(id);
        this.original = {
            name : column.name,
            id : column.id,
            columnType: column.columnType,
            measureType : column.measureType,
            autoMeasure : column.autoMeasure,
            levels : column.levels,
            formula : column.formula,
        };
        this.set(this.original);
        this.set('formulaMessage', column.formulaMessage);
    },
    apply() {

        if (this.attributes.changes === false)
            return;

        let values = {
            name: this.attributes.name,
            columnType: this.attributes.columnType,
            measureType: this.attributes.measureType,
            autoMeasure: this.attributes.autoMeasure,
            levels: this.attributes.levels,
            dps: this.attributes.dps,
            formula: this.attributes.formula,
        };

        this.dataset.changeColumn(this.attributes.id, values)
            .then(() => {
                let latestValues = {
                    name: this.attributes.name,
                    columnType: this.attributes.columnType,
                    measureType: this.attributes.measureType,
                    autoMeasure: this.attributes.autoMeasure,
                    levels: this.attributes.levels,
                    dps: this.attributes.dps,
                    formula: this.attributes.formula,
                };

                this.original = latestValues;
                this.set(this.original);
                this.set('changes', false);
                this.dataset.set('varEdited', false);

                let column = this.dataset.getColumnById(this.attributes.id);
                this.set('formulaMessage', column.formulaMessage);
            });
    },
    revert() {
        this.set(this.original);
    }
});

module.exports = VariableModel;
