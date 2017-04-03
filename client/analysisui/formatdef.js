
'use strict';

const _ = require('underscore');
const Format = require('./format.js');

const FormatDef = {

    infer: function(raw) {
        let typeName = typeof(raw);
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

            let temp = value.raw;
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

FormatDef.variables = new Format({
    name: 'variables',

    default: null,

    toString: function(raw) {
        let r = '';
        for (let i = 0; i < raw.length; i++) {
            if (i > 0)
                r = r + ', ';
            r = r + raw[i];
        }
        return r;
    },

    parse: function(value) {
        return value;
    },

    isValid: function(raw) {
        return Array.isArray(raw);
    },

    isEqual: function(raw1, raw2, orderImportant) {
        if (raw1.length !== raw2.length)
            return false;

        for (let i = 0; i < raw1.length; i++) {
            let found = false;
            if (orderImportant && raw1[i] === raw2[i])
                found = true;
            else {
                for (let j = 0; j < raw2.length; j++) {
                    if (raw1[i] === raw2[j])
                        found = true;
                }
            }
            if (found === false)
                return false;
        }
        return true;
    },

    isEmpty: function(raw) {
        return raw === null || raw.length === 0;
    }
});

FormatDef.variable = new Format ({

    name: 'variable',

    default: null,

    toString: function(raw) {
        return raw;
    },

    parse: function(value) {
        return value;
    },

    isValid: function(raw) {
        return (typeof raw === 'string');
    },

    isEqual: function(raw1, raw2) {
        return raw1 === raw2;
    },

    isEmpty: function(raw) {
        return raw === null;
    },

    interactions: function(variables) {
        let list = [];
        for (let i = 0; i < variables.length; i++) {
            let listLength = list.length;
            let rawVar = variables[i];
            if (variables[i].raw)
                rawVar = variables[i].raw;

            for (let j = 0; j < listLength; j++) {
                let newVar = JSON.parse(JSON.stringify(list[j]));

                newVar.push(rawVar);
                list.push(FormatDef.constructor(newVar, FormatDef.term));
            }
            list.push(FormatDef.constructor([rawVar], FormatDef.term));
        }

        return list;
    }
});

FormatDef.term = new Format ({

    name: 'term',

    default: null,

    toString: function(raw) {
        return FormatDef.term._itemToString(raw, 0);
    },

    parse: function(value) {
        return "test";
    },

    isValid: function(raw) {
        return FormatDef.term._validateItem(raw, 0);
    },

    isEqual: function(raw1, raw2) {
        return FormatDef.term._areItemsEqual(raw1, raw2);
    },

    isEmpty: function(raw) {
        return raw === null;
    },

    contains: function(raw, value) {

        let type1 = typeof raw;
        let type2 = typeof value;

        if (type1 === 'string' && type2 === 'string')
            return raw === value;
        else if (type1 === 'string')
            return false;

        for (let j = 0; j < raw.length; j++) {

            if (FormatDef.term.contains(raw[j], value))
                return true;
        }

        if (raw.length < value.length)
            return false;

        let jStart = 0;
        for (let i = 0; i < value.length; i++) {
            let found = false;
            for (let k = jStart; k < raw.length; k++) {
                if (FormatDef.term._areItemsEqual(value[i], raw[k])) {
                    if (jStart === k)
                        jStart = k + 1;
                    found = true;
                    break;
                }
            }

            if (found === false)
                return false;
        }

        return true;
    },

    _areItemsEqual: function(item1, item2) {
        let type1 = typeof item1;
        let type2 = typeof item1;

        if (type1 !== type2)
            return false;

        if (type1=== 'string' && type2 === 'string')
            return item1 === item2;

        if (Array.isArray(item1) === false || Array.isArray(item2) === false)
            return false;

        if (item1.length !== item2.length)
            return false;

        let jStart = 0;
        for (let i = 0; i < item1.length; i++) {
            let found = false;
            for (let j = jStart; j < item2.length; j++) {
                if (FormatDef.term._areItemsEqual(item1[i], item2[j])) {
                    if (j === jStart)
                        jStart = j + 1;
                    found = true;
                    break;
                }
            }
            if (found === false)
                return false;
        }

        return true;
    },

    _getJoiner: function(level) {
        if (level === 0)
            return '✻';

        return '-';
    },

    _itemToString: function(item, level) {
        if (typeof item === 'string')
            return item;

        let joiner = FormatDef.term._getJoiner(level);
        let combined = FormatDef.term._itemToString(item[0], level + 1);
        for (let i = 1; i < item.length; i++)
            combined = combined + " " + joiner + " " + FormatDef.term._itemToString(item[i], level + 1);

        return combined;
    },

    _validateItem: function(item, level) {
        if (level > 0 && typeof item === 'string')
            return true;
        else if (level > 2 || Array.isArray(item) === false || item.length === 0)
            return false;

        for (let i = 0; i < item.length; i++) {
            if (FormatDef.term._validateItem(item[i], level + 1) === false)
                return false;
        }

        return true;
    }
});

FormatDef.number = new Format ({

    name: 'number',

    default: 0,

    toString: function(raw) {
        return raw.toString();
    },

    parse: function(value) {
        return parseFloat(value);
    },

    isValid: function(raw) {
        return typeof(raw) === 'number';
    },

    isEmpty: function(raw) {
        return raw === null;
    },

    isEqual: function(raw1, raw2) {
        return raw1 === raw2;
    }
});

FormatDef.bool = new Format ({

    name: 'bool',

    default: false,

    toString: function(raw) {
        return raw.toString();
    },

    parse: function(value) {
        return value === 'true';
    },

    isValid: function(raw) {
        return typeof(raw) === 'boolean';
    },

    isEmpty: function(raw) {
        return raw === null;
    },

    isEqual: function(raw1, raw2) {
        return raw1 === raw2;
    }
});

FormatDef.string = new Format ({

    name: 'string',

    default: '',

    toString: function(raw) {
        return raw;
    },

    parse: function(value) {
        return value;
    },

    isValid: function(raw) {
        return typeof(raw) === 'string';
    },

    isEmpty: function(raw) {
        return raw === null;
    },

    isEqual: function(raw1, raw2) {
        return raw1 === raw2;
    }

});




module.exports = FormatDef;
