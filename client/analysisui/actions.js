
'use strict';

const _ = require('underscore');
var FormatDef = require('./formatdef');
var SuperClass = require('../common/superclass');

function Actions() {

    this.clone = function(obj) {
        return JSON.parse(JSON.stringify(obj));
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

    this.getCombinations = function(values) {
        var list = [];
        for (let i = 0; i < values.length; i++) {
            var listLength = list.length;
            var value = values[i];

            for (let j = 0; j < listLength; j++) {
                var newValue = this.clone(list[j]);
                newValue.push(value);
                list.push(newValue);
            }

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

SuperClass.create(Actions);

Actions.extend = function(params) {
    return function() {
        Actions.extendTo(this);
        _.extend(this, params);
    };
};

module.exports = Actions;
