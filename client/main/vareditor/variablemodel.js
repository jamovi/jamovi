
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const VariableModel = Backbone.Model.extend({

    initialize(dataset) {
        this.dataset = dataset;
        this.original = { };
        this._hasChanged = { };
        this.on('change', event => {
            let changes = false;
            for (let name in this.original) {
                if ( ! _.isEqual(this.attributes[name], this.original[name])) {
                    changes = true;
                    this._hasChanged[name] = true;
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
            let ids = this.get('ids');
            if (ids === null)
                return;

            let changed = false;
            for (let changes of event.changes) {

                if (changes.created || changes.deleted)
                    continue;

                if (ids.includes(changes.id)) {
                    changed = true;
                    break;
                }
            }
            if (changed)
                this.setColumn(ids, this.typeFilter);
        });
    },
    suspendAutoApply() {
        this.set('autoApply', false);
    },
    defaults : {
        name : null,
        ids: null,
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
        transform: 0, // zero means 'none'
        parentId: 0
    },
    editLevelLabel(index, label) {

        label = label.trim();
        let levels = this.get('levels');
        let level = levels[index];
        if (level.label === label)
            return level;
        if (label === '' && level.label === null)
            return level;

        level = Object.assign({}, level);  // clones
        levels = levels.slice();

        let valueAsString = level.importValue;

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
    setColumn(ids, typeFilter) {
        this.trigger('columnChanging');

        if (this._applyId) {
            clearTimeout(this._applyId);
            this._applyId = null;
            this.apply();
        }

        this.columns = [];
        this.typeFilter = typeFilter;
        this.excludedColumns = [];
        this.original = {
            name : null,
            ids : ids,
            columnType: null,
            dataType: null,
            measureType : null,
            autoMeasure : null,
            description: null,
            levels : null,
            formula : null,
            hidden : null,
            active : null,
            filterNo : null,
            importName : null,
            trimLevels : null,
            transform : null,
            parentId : null
        };

        let first = true;
        for (let id of ids) {
            let column = this.dataset.getColumnById(id);
            if (column.columnType === typeFilter) {
                this.columns.push(column);
                for (let prop in this.original) {
                    if (prop === 'ids')
                        continue;
                    else if (first) {
                        let obj = column[prop];
                        if (Array.isArray(obj))
                            this.original[prop] = $.extend(true, [], obj);
                        else if (typeof obj === 'object')
                            this.original[prop] = $.extend(true, {}, obj);
                        else
                            this.original[prop] = column[prop];
                    }
                    else if (prop === 'levels')
                        this._filterLevels(column);
                    else if (column[prop] !== this.original[prop])
                        this.original[prop] = null;
                }
                first = false;
            }
            else
                this.excludedColumns.push(column);
        }

        this.set(this.original);
        if (this.columns.length > 0)
            this.set('formulaMessage', this.columns[0].formulaMessage);
    },
    _filterLevels(column) {
        if (this.original.levels === null)
            return;

        this.original.levels = this.original.levels.filter(a => {
            return column.levels.some(b => {
                return b.importValue === a.importValue;
            });
        });
        if (this.original.levels.length === 0)
            this.original.levels = null;
        else {
            let level = null;
            let compare = a => { return a.importValue === level.importValue && a.label === level.label; };
            for (level of this.original.levels) {
                if (column.levels.some(compare) === false)
                    level.label = null;
            }
        }
    },
    _constructAppyValues(column, values) {
        let level = null;
        let findLevel = (levels, level) => {
            return levels.find(a => { return a.importValue === level.importValue; });
        };

        let newValues = $.extend(true, {}, values);
        if (newValues.levels) {
            for (level of column.levels) {
                let editLevel = findLevel(newValues.levels, level);
                if (editLevel && editLevel.label !== null)
                    level.label = editLevel.label;
            }
            newValues.levels = column.levels;
        }
        return newValues;
    },
    apply() {

        this.set('autoApply', true);

        if (this.attributes.changes === false)
            return Promise.resolve();


        let values = { };
        let cancel = true;
        for (let prop in this._hasChanged) {
            if (prop === 'ids')
                continue;

            let value = this.attributes[prop];
            if (value !== undefined && value !== null) {
                values[prop] = value;
                cancel = false;
            }
        }

        if (cancel) {
            this.set('changes', false);
            return Promise.resolve();
        }

        let pairs = [];
        for (let column of this.columns) {
            let newValues = this._constructAppyValues(column, values);
            pairs.push({ id: column.id, values: newValues });
        }

        return this.dataset.changeColumns(pairs)
            .then(() => {
                let ids = this.attributes.ids;
                if (ids.length === pairs.length && pairs.every(a => {
                    return ids.includes(a.id);
                })) {

                    let latestValues = {
                        name: this.attributes.name === null ? this.attributes.name : this.attributes.name.trim(),
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
                        transform: this.attributes.transform,
                        parentId: this.attributes.parentId
                    };

                    this.original = latestValues;
                    this.set(this.original);
                    this.set('changes', false);
                    this._hasChanged = { };
                    this.dataset.set('varEdited', false);

                    let column = this.dataset.getColumnById(this.attributes.ids[0]);
                    this.set('formulaMessage', column.formulaMessage);
                }
            });
    },
    revert() {
        this.set(this.original);
    }
});

module.exports = VariableModel;
