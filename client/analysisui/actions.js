
'use strict';

const _ = require('underscore');
var FormatDef = require('./formatdef');
var SuperClass = require('../common/superclass');
const RequestDataSupport = require('./requestdatasupport');

function View() {

    RequestDataSupport.extendTo(this);

    this._loaded = true;
    this._updating = false;
    this.workspace = {};

    this._baseEvents = [
        {
            onEvent: 'view.remote-data-changed', execute: function(ui, data) {
                if (this.update)
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

    this.findChanges = function(id, current, updateWS, format) {
        let oldValue = this.workspace[id];

        let diff = null;

        if (Array.isArray(current)) {
            diff = { removed: [], added: [], hasChanged: false };
            if (oldValue !== undefined)
                diff = this.findDifferences(oldValue, current, format);
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

    this.sortArraysByLength = function(arrays) {
        var changed = false;
        for (var i = 0; i < arrays.length - 1; i++) {
            var l1 = arrays[i].length;
            var l2 = arrays[i+1].length;

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

    this.listContains = function(list, value, format) {
        for (var i = 0; i < list.length; i++) {
            if (format === undefined) {
                if (list[i] === value)
                    return true;
            }
            else if (format.isEqual(list[i], value))
                return true;
        }

        return false;
    };

    this.findDifferences = function(from, to, format) {
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
                if (this.listContains(to, from[j], format) === false)
                    obj.removed.push(from[j]);
            }

            for (j = 0; j < to.length; j++) {
                if (this.listContains(from, to[j], format) === false)
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
