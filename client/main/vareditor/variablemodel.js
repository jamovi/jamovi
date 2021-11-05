
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const Notify = require('../notification');

const VariableModel = Backbone.Model.extend({

    initialize(dataset) {
        this.dataset = dataset;
        this.original = { };
        this._hasChanged = { };
        this._editNote = new Notify({ duration: 3000 });
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
            if (this.dataset.attributes.editingVar === null)
                return;

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
        this.set('autoApply', false, { silent: true });
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
        missingValues: [],
        parentId: 0
    },
    editLevelPinned(index, pinned) {

        let levels = this.get('levels');
        let level = levels[index];
        let slevels = [level, ...level.others];
        levels = levels.slice();

        level = Object.assign({}, level);  // clones
        level.pinned = pinned;
        level.pinnedChanged = true;
        levels[index] = level;

        level.modified = true;

        this.set({ levels: levels, changes: true, autoMeasure: false });
        this.dataset.set('varEdited', true);

        return level;
    },
    editLevelLabel(index, label, value) {

        label = label.trim();
        let levels = this.get('levels');
        let level = levels[index];
        let newLevel = false;
        let slevels = [level, ...level.others];
        let labels = [...new Set(slevels.map(level => level.label))];
        let imports = [...new Set(slevels.map(level => level.importValue))];
        let clash = labels.length > 1;
        let multiImportNames = imports.length > 1;
        let multiSelect = slevels.length > 1;

        if (level.label === label && ! clash)
            return level;

        if (label === '' && clash)
            return level;

        level = Object.assign({}, level);  // clones
        levels = levels.slice();

        let valueAsString = level.importValue;
        if (multiImportNames)
            valueAsString = null;

        if (label === '') {
            // if empty, set back to the original
            label = valueAsString;
        }

        if (label !== null) {
            // check that the label isn't already in use
            let existing = new Set();
            let getLabels = (levels) => {
                for (let alevel of levels) {
                    if (this._compareLevels(alevel, level))
                        continue;
                    existing.add(alevel.label);
                    getLabels(alevel.others);
                }
            };

            getLabels(levels);


            let newLabel = label; // modify label if already in use
            let c = 2;
            while (existing.has(newLabel))
                newLabel = label + ' (' + c++ + ')';
            label = newLabel;
        }

        level.modified = true;

        level.label = label;
        for (let olevel of level.others) {
            olevel.label = label;
        }

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
            parentId : null,
            missingValues : null
        };

        let first = true;
        this._compareWithValue = false;
        for (let id of ids) {
            let column = this.dataset.getColumnById(id);
            if (column.dataType !== 'text')
                this._compareWithValue = true;
            for (let level of column.levels) {
                level.others = [];
                level.modified = false;
                level.pinnedChanged = false;
            }

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
                    else if (prop === 'missingValues')
                        this._filterMissingValues(column);
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
    _compareLevels(l1, l2) {
        if (this._compareWithValue === false)
            return l1.importValue === l2.importValue;

        return l1.value === l2.value;
    },
    _filterLevels(column) {
        if (this.original.levels === null)
            return;

        let level = null;
        let compare = a => {
            return this._compareLevels(a, level);
        };
        for (level of column.levels) {
            let found = this.original.levels.find(compare);
            if (found)
                found.others.push(level);
            else {
                let inserted = false;
                for (let i = this.original.levels.length - 1; i >= 0; i--) {
                    if (this.original.levels[i].value <= level.value) {
                        this.original.levels.splice(i+1, 0, level);
                        inserted = true;
                        break;
                    }
                    else if (i === 0) {
                        this.original.levels.splice(i, 0, level);
                        inserted = true;
                    }
                }
                if ( ! inserted) {
                    this.original.levels.push(level);
                }
            }
        }
    },
    _filterMissingValues(column) {
        if (this.original.missingValues === null)
            return;

        this.original.missingValues = this.original.missingValues.filter(a => {
            return column.missingValues.some(b => {
                return b === a;
            });
        });
        if (this.original.missingValues.length === 0)
            this.original.missingValues = null;
    },
    _constructAppyValues(column, values) {
        let findLevel = (levels, level) => {
            return levels.find(a => { return this._compareLevels(a, level); });
        };

        let newValues = $.extend(true, {}, values);
        if (newValues.levels && this.attributes.ids.length > 1) {
            let newLevels = [];
            for (let editLevel of newValues.levels) {
                let oldLevel = findLevel(column.levels, editLevel);
                if (oldLevel || editLevel.label !== null) {
                    let modified = editLevel.modified;
                    if (modified) {
                        let label = null;
                        if (editLevel.label === null)
                            label = oldLevel.importValue;
                        else
                            label = editLevel.label;

                        let existing = new Set();
                        for (let alevel of column.levels) {
                            if (this._compareLevels(alevel, editLevel))
                                continue;
                            existing.add(alevel.label);
                        }

                        let newLabel = label; // modify label if already in use
                        let c = 2;
                        while (existing.has(newLabel))
                            newLabel = label + ' (' + c++ + ')';
                        label = newLabel;

                        if (oldLevel) {
                            oldLevel.label = label;
                            if (editLevel.pinnedChanged)
                                oldLevel.pinned = editLevel.pinned;
                            else
                                oldLevel.pinned = true;
                            newLevels.push(oldLevel);
                        }
                        else {
                            let newLevel = $.extend(true, {}, editLevel);
                            newLevel.label = label;
                            newLevel.pinned = true;
                            newLevels.push(newLevel);
                        }
                    }
                    else {
                        if (oldLevel)
                            newLevels.push(oldLevel);
                        else if (this.levelsReordered) {
                            let newLevel = $.extend(true, {}, editLevel);
                            newLevel.pinned = true;
                            newLevels.push(newLevel);
                        }
                    }
                }
            }
            newValues.levels = newLevels;
        }
        return newValues;
    },
    apply() {

        this.set('autoApply', true, { silent: true });

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

        this.levelsReordered = false;

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
                        parentId: this.attributes.parentId,
                        missingValues: this.attributes.missingValues
                    };

                    this.original = latestValues;
                    this.set(this.original);
                    this.set('changes', false);
                    this._hasChanged = { };
                    this.dataset.set('varEdited', false);

                    let column = this.dataset.getColumnById(this.attributes.ids[0]);
                    this.set('formulaMessage', column.formulaMessage);
                }
            }, (error) => {
                this.set(this.original);
                this._notifyEditProblem({
                    title: error.message,
                    message: error.cause,
                    type: 'error',
                });
            });
    },
    revert() {
        this.set(this.original);
    },
    _notifyEditProblem(details) {
        this._editNote.set(details);
        this.trigger('notification', this._editNote);
    }
});

module.exports = VariableModel;
