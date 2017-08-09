
'use strict';

const _ = require('underscore');
const FormatDef = require('./formatdef');
const SuperClass = require('../common/superclass');
const RequestDataSupport = require('./requestdatasupport');
const EventEmitter = require('events');

function View() {

    RequestDataSupport.extendTo(this);
    EventEmitter.call(this);
    Object.assign(this, EventEmitter.prototype);

    this._loaded = true;
    this._updating = false;
    this.workspace = {};

    this.customVariables = [];

    this.setCustomVariables = function(variables) {
        this.customVariables = variables;
        let event = { dataType: 'columns' , dataInfo: { measureTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: true } };
        this.emit('customVariablesChanged', event);
        //this._fireEvent("customVariablesChanged", event);
    };

    this.setCustomVariable = function(name, measureType, levels) {
        let event = { dataType: 'columns' , dataInfo: { measureTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: false } };

        let found = false;
        let changed = false;
        for (let i = 0; i < this.customVariables.length; i++) {
            if (this.customVariables[i].name === name) {

                if (measureType !== this.customVariables[i].measureType) {
                    changed = true;
                    event.dataInfo.measureTypeChanged = true;
                    this.customVariables[i].measureType = measureType;
                }


                if (levels !== this.customVariables[i].levels) {
                    if (levels === undefined || this.customVariables[i].levels === undefined || levels.length !== this.customVariables[i].levels.length) {
                        changed = true;
                        event.dataInfo.levelsChanged = true;
                        this.customVariables[i].levels = levels;
                    }
                    else {
                        for (let j = 0; j < levels.length; j++) {
                            if (levels[j] !== this.customVariables[i].levels[j]) {
                                changed = true;
                                event.dataInfo.levelsChanged = true;
                                this.customVariables[i].levels = levels;
                                break;
                            }
                        }
                    }
                }
                found = true;
                break;
            }
        }

        if (found === false) {
            changed = true;
            event.dataInfo.countChanged = true;
            this.customVariables.push( { name: name, measureType: measureType, levels: levels });
        }

        if (changed)
            this.emit('customVariablesChanged', event);
    };

    this.removeCustomVariable = function(name) {
        let found = false;
        for (let i = 0; i < this.customVariables.length; i++) {
            if (this.customVariables[i].name === name) {
                this.customVariables.splice(i, 1);
                found = true;
                break;
            }
        }

        if (found) {
            let event = { dataType: 'columns' , dataInfo: { measureTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: true } };
            this.emit('customVariablesChanged', event);
        }
    };

    this.clearCustomVariables = function(name, measureType, levels) {
        if (this.customVariables.length > 0) {
            let event = { dataType: 'columns' , dataInfo: { measureTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: true } };
            this.customVariables = [];
            this.emit('customVariablesChanged', event);
        }
    };


    this._baseEvents = [
        {
            onEvent: 'view.remote-data-changed', execute: function(ui, data) {
                if (this.remoteDataChanged)
                    this.remoteDataChanged(ui, data);
            }
        },
        {
            onEvent: "view.loaded", execute: function(ui) {
                this._loaded = true;
            }
        },
        {
            onEvent: "view.data-initializing", execute: function(ui) {
                this.workspace = {};
                this._updating = true;
            }
        },
        {
            onEvent: "view.ready", execute: function(ui) {
                this._updating = false;
                if (this.update) {
                    this.update(ui);
                }
            }
        }
    ];

    this.findChanges = function(id, current, updateWS, format, itemProperty) {
        let oldValue = this.workspace[id];

        let diff = null;

        if (Array.isArray(current)) {
            diff = { removed: [], added: [], hasChanged: false };
            if (oldValue !== undefined)
                diff = this.findDifferences(oldValue, current, format, itemProperty);
            diff.hasChanged = diff.removed.length > 0 || diff.added.length;
        }
        else {
            let hasChanged = oldValue === undefined;
            if (current === undefined)
                hasChanged = true;
            else if (oldValue !== undefined) {
                if (format === undefined)
                    hasChanged = oldValue !== current;
                else
                    hasChanged = format.isEqual(oldValue, current) === false;
            }

            diff = { oldValue: oldValue, newValue: current, hasChanged: hasChanged };
        }

        if (updateWS)
            this.workspace[id] = current;

        return diff;
    };

    this.checkPairsValue = function(ctrl, variables) {
        let changed = false;
        let pairs = this.cloneArray(ctrl.value());
        if (pairs !== null && pairs.length > 0) {
            for (let i = 0; i < pairs.length; i++) {
                let pair = pairs[i];
                let found = 0;
                for (let j = 0; j < variables.length; j++) {
                    let variable = variables[j];
                    if (pair.i1 === variable)
                        found += 1;
                    if (pair.i2 === variable)
                        found += 2;
                    if (found === 3)
                        break;
                }
                if (found !== 3) {
                    changed = true;
                    if (found === 0) {
                        pairs.splice(i, 1);
                        i -= 1;
                    }
                    else if (found === 1)
                        pair.i2 = null;
                    else if (found === 2)
                        pair.i1 = null;
                }
            }
            if (changed)
                ctrl.setValue(pairs);
        }
    };

    this.checkValue = function(ctrl, valueIsList, validValues, format) {
        let value = this.clone(ctrl.value());
        if (valueIsList && value === null)
            value = [];

        let changed = false;

        if (valueIsList) {
            for (let i = 0; i < value.length; i++) {
                if (this.listContains(validValues, value[i], format) === false) {
                    value.splice(i, 1);
                    i -= 1;
                    changed = true;
                }
            }
        }
        else if (this.listContains(validValues, value, format) === false) {
            value = null;
            changed = true;
        }

        if (changed)
            ctrl.setValue(value);
    };

    this.isReady = function() {
        return this._updating === false && this._loaded;
    };

    this.initializeValue = function(option, defaultValue) {
        var value = option.value();
        if (value === null) {
            option.setValue(defaultValue);
            return true;
        }

        return false;
    };

    this.clone = function(obj) {
        return JSON.parse(JSON.stringify(obj));
    };

    this.cloneArray = function(array, ifNull) {
        let clone = this.clone(array);
        if (ifNull !== undefined && clone === null)
            clone = ifNull;

        return clone;
    };

    this.sortArraysByLength = function(arrays, itemPropertyName) {
        var changed = false;
        for (var i = 0; i < arrays.length - 1; i++) {
            let item1 = itemPropertyName === undefined ? arrays[i] : arrays[i][itemPropertyName];
            let item2 = itemPropertyName === undefined ? arrays[i+1] : arrays[i+1][itemPropertyName];

            var l1 = item1.length;
            var l2 = item2.length;

            if (arrays.length > i + 1 && (l1 > l2)) {
                changed = true;
                var temp = arrays[i+1];
                arrays[i+1] = arrays[i];
                arrays[i] = temp;
                if (i > 0)
                    i = i - 2;
            }
        }

        return changed;
    };

    this.listContains = function(list, value, format, itemPropertyName) {
        for (var i = 0; i < list.length; i++) {
            let item = itemPropertyName === undefined ? list[i] : list[i][itemPropertyName];
            if (format === undefined) {
                if (item === value)
                    return true;
            }
            else if (format.isEqual(item, value))
                return true;
        }

        return false;
    };

    this.findDifferences = function(from, to, format, itemPropertyName) {
        var j = 0;

        var obj = { removed: [], added: [] };

        if ((from === null || from === undefined) && (to === null || to === undefined))
            return obj;
        else if (from === null || from === undefined) {
            for (j = 0; j < to.length; j++)
                obj.added.push(to[j]);
        }
        else if (to === null || to === undefined) {
            for (j = 0; j < from.length; j++)
                obj.removed.push(from[j]);
        }
        else {
            for (j = 0; j < from.length; j++) {
                let fromItem = itemPropertyName === undefined ? from[j] : from[j][itemPropertyName];
                if (this.listContains(to, fromItem, format, itemPropertyName) === false)
                    obj.removed.push(from[j]);
            }

            for (j = 0; j < to.length; j++) {
                let toItem = itemPropertyName === undefined ? to[j] : to[j][itemPropertyName];
                if (this.listContains(from, toItem, format, itemPropertyName) === false)
                    obj.added.push(to[j]);
            }
        }

        return obj;
    };

    this.getCombinations = function(values, baseList) {
        var list = [];
        if (baseList !== undefined && Array.isArray(baseList))
            list = baseList;

        for (let i = 0; i < values.length; i++) {
            var listLength = list.length;
            var value = values[i];

            for (let j = 0; j < listLength; j++) {
                var newValue = this.clone(list[j]);
                if (Array.isArray(value))
                    newValue = newValue.concat(value);
                else
                    newValue.push(value);
                list.push(newValue);
            }
            if (Array.isArray(value))
                list.push(this.clone(value));
            else
                list.push([value]);
        }

        return list;
    };

    this.getItemCombinations = function(items) {
        var values = this.itemsToValues(items);
        var combinations = this.getCombinations(values);
        return this.valuesToItems(combinations, FormatDef.term);
    };

    this.valuesToItems = function(values, format) {
        var list = [];
        for (var i = 0; i < values.length; i++)
            list.push({ value: new FormatDef.constructor(values[i], format) });
        return list;
    };

    this.itemsToValues = function(items) {
        var list = [];
        for (var i = 0; i < items.length; i++)
            list.push(items[i].value.raw);
        return list;
    };
}

SuperClass.create(View);

View.extend = function(params) {
    return function() {
        View.extendTo(this);
        _.extend(this, params);
        if (this.events !== undefined)
            this.events = this._baseEvents.concat(this.events);
        else
            this.events = this._baseEvents;
    };
};

module.exports = View;
