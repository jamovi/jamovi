
'use strict';

var _ = require('underscore');

var FormatDef = {

    variable: {

        name: 'variable',

        toString: function(raw) {
            return FormatDef.variable._itemToString(raw, 0);
        },

        parse: function(value) {
            return "test";
        },

        isValid: function(raw) {
            return FormatDef.variable._validateItem(raw, 0);
        },

        isEqual: function(raw1, raw2) {
            return FormatDef.variable._areItemsEqual(raw1, raw2);
        },

        _areItemsEqual: function(item1, item2) {
            var type1 = typeof item1;
            var type2 = typeof item1;

            if (type1 !== type2)
                return false;

            if (type1=== 'string' && type2 === 'string')
                return item1 === item2;

            if (Array.isArray(item1) === false || Array.isArray(item2) === false)
                return false;

            if (item1.length > 2 || item2.length > 2)
                throw 'Not a valid variable type';

            if (item1.length !== item2.length)
                return false;

            for (var i = 0; i < item1.length; i++) {
                if (FormatDef.variable._validateItem(item1[i], item2[i]) === false)
                    return false;
            }

            return true;
        },

        _getJoiner: function(level) {
            if (level === 0)
                return '*';

            return '-';
        },

        _itemToString: function(item, level) {
            if (typeof item === 'string')
                return item;

            var joiner = FormatDef.variable._getJoiner(level);
            var combined = '';
            for (var i = 0; i < item.length; i++)
                combined = combined + joiner + FormatDef.variable._itemToString(item[i], level + 1);

            return combined;
        },

        _validateItem: function(item, level) {
            if (typeof item === 'string')
                return true;

            if (level < 2 || Array.isArray(item) === false || item.length === 0)
                return false;

            for (var i = 0; i < item.length; i++) {
                if (FormatDef.variable._validateItem(item[i], level + 1) === false)
                    return false;
            }

            return true;
        }
    },

    number: {

        name: 'number',

        toString: function(raw) {
            return raw.toString();
        },

        parse: function(value) {
            return parseFloat(value);
        },

        isValid: function(raw) {
            return typeof(raw) === 'number';
        },

        isEqual: function(raw1, raw2) {
            return raw1 === raw2;
        }
    },

    bool: {

        name: 'bool',

        toString: function(raw) {
            return raw.toString();
        },

        parse: function(value) {
            return value === 'true';
        },

        isValid: function(raw) {
            return typeof(raw) === 'boolean';
        },

        isEqual: function(raw1, raw2) {
            return raw1 === raw2;
        }

    },

    string:  {

        name: 'string',

        toString: function(raw) {
            return raw;
        },

        parse: function(value) {
            return value;
        },

        isValid: function(raw) {
            return typeof(raw) === 'string';
        },

        isEqual: function(raw1, raw2) {
            return raw1 === raw2;
        }

    },

    infer: function(raw) {
        var typeName = typeof(raw);
        switch (typeName) {
            case 'number':
            case 'string':
                return FormatDef[typeName];
            case 'boolean':
                return FormatDef.bool;
            case 'object':
                _.each(this, function(value, key, list) {
                    if (value.isValid) {
                        if (value.isValid(raw))
                            return value;
                    }
                });
                break;
        }
        return null;
    },

    constructor: function(raw, format) {

        this.format = format;
        if (_.isUndefined(format))
            this.format = FormatDef.infer(raw);

        this.raw = raw;

        this.toString = function() {
            if (this.format === null && this.raw.toString)
                return this.raw.toString();

            if (this.format === null)
                return '';

            return this.format.toString(this.raw);
        };

        this.equalTo = function(value) {
            if (this.format === null)
                return this.raw === value;

            var temp = value.raw;
            if (_.isUndefined(temp))
                temp = value;
            else if (this.format.name !== value.format.name)
                return false;

            return this.format.isEqual(this.raw, temp);
        };

        this.isValid = function() {
            return this.format === null || this.format.isValid(this.raw);
        };

        this.isPrimitive = function() {
            return this.format !== null;
        };
    }
};



module.exports = FormatDef;
