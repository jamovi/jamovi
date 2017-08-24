
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
        let newLabel = label.trim();
        let levels = this.get('levels');
        if (levels[index].label === newLabel)
            return levels[index];

        let newLevels = [];
        let alterationCount = 0;
        let desiredLabel = newLabel;
        for (let i = 0; i < levels.length; i++) {
            if (i === index)
                newLevels[i] = { value: levels[i].value, label: desiredLabel, importValue: levels[i].importValue };
            else if (levels[i].label === desiredLabel) {
                alterationCount += 1;
                desiredLabel = newLabel + '(' + alterationCount + ')';
                i = -1;
            }
            else if (i >= newLevels.length)
                newLevels[i] = levels[i];
        }

        this.set({ levels: newLevels, changes: true, autoMeasure: false });
        this.dataset.set('varEdited', true);

        return newLevels[index];
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
            measureType: this.attributes.measureType,
            autoMeasure: this.attributes.autoMeasure,
            levels: this.attributes.levels,
            dps: this.attributes.dps,
            formula: this.attributes.formula,
        };

        this.dataset.changeColumn(this.attributes.id, values)
            .then(() => {
                this.original = values;
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
