
'use strict';

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
                for (let key in this) {
                    let value = this[key];
                    if (value.isValid) {
                        if (value.isValid(raw))
                            return value;
                    }
                }
                break;
        }
        return null;
    },

    constructor: function(raw, format) {

        this.format = format;
        if (format === undefined)
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
            if (temp === undefined)
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

        this.convert = function(format, properties) {
            if (format.from === undefined)
                throw 'Format "' + format.name + '" does not have a "from" converter function.';

            return new FormatDef.constructor(format.from(this, properties), format);
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
        return (typeof raw === 'string') || Array.isArray(raw);
    },

    isEqual: function(raw1, raw2) {
        return raw1 === raw2;
    },

    isEmpty: function(raw) {
        return raw === null;
    },

    interactions: function(values, minLength, maxLength) {

        if (maxLength === undefined)
            maxLength = -1;

        if (minLength === undefined)
            minLength = 1;

        let counts = [0];
        let findPosition = (length) => {
            let pos = 0;
            for (let k = 0; k < length; k++)
                pos += counts[k];
            return pos;
        };

        let list = [];
        for (let i = 0; i < values.length; i++) {
            let listLength = list.length;
            let rawVar = values[i];
            let isFormatted = false;
            if (values[i].raw) {
                rawVar = values[i].raw;
                isFormatted = true;
            }

            for (let j = 0; j < listLength; j++) {
                let f = list[j];
                if (maxLength > 1 && f.length === maxLength)
                    break;

                let newVar = JSON.parse(JSON.stringify(f));

                newVar.push(rawVar);

                if (counts[newVar.length - 1] === undefined)
                    counts[newVar.length - 1] = 1;
                else
                    counts[newVar.length - 1] += 1;
                list.splice(findPosition(newVar.length), 0, isFormatted ? new FormatDef.constructor(newVar, FormatDef.term) : newVar);
            }

            list.splice(i, 0, isFormatted ? new FormatDef.constructor([rawVar], FormatDef.term) : [rawVar]);
            counts[0] += 1;
        }

        if (minLength > 1)
            list.splice(0, findPosition(minLength - 1));

        for (let i = 0; i < list.length; i++)
            list[i] = this._flattenList(list[i]);

        return list;
    },

    _flattenList: function(list) {
        let flatList = [];
        for (let value of list) {
            if (Array.isArray(value))
                flatList = flatList.concat(this._flattenList(value));
            else
                flatList.push(value);
        }
        return flatList;
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

    getSuperscript: function(value) {
        return '<sup> ' + value + '</sup>';
    },

    _itemToString: function(item, level, power) {
        if (typeof item === 'string')
            return item + (power > 1 ? this.getSuperscript(power) : '');

        if (item === null || item.length === 0)
            return '';

        let joiner = FormatDef.term._getJoiner(level);

        let combined = '';
        let npower = 1;
        for (let i = 0; i < item.length; i++) {
            if (i < item.length - 1 && item[i] === item[i+1])
                npower += 1;
            else {
                combined = (combined !== '' ? (combined + ' ' + joiner + ' ') : '') + FormatDef.term._itemToString(item[i], level + 1, npower);
                npower = 1;
            }
        }

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
    },

    from: function(raw, properties) {
        let format = properties.format;
        if (format === undefined) {
            format = raw.format;
            raw = raw.raw;
        }

        let power = properties.power;
        if (power === undefined)
            power = 1;

        if (format.name === 'term')
            return raw;

        if (format.name === 'variable') {
            if (Array.isArray(raw))
                return raw;
            else {
                let term = [];
                for (let p = 0; p < power; p++)
                    term.push(raw);
                return term;
            }
        }

        return null;
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
        return ! (isNaN(raw) || typeof(raw) !== 'number');
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

FormatDef.output = new Format ({

    name: 'output',

    default: null,

    toString: function(raw) {
        if (raw === null)
            return 'false';

        return raw.value.toString();
    },

    parse: function(value) {
        return { value: value === 'true', vars: [] };
    },

    isValid: function(raw) {
        return raw === null || (typeof(raw) === 'object' && typeof(raw.value) === 'boolean');
    },

    isEmpty: function(raw) {
        return raw === null || raw.vars.length === 0;
    },

    isEqual: function(raw1, raw2) {
        if (raw1 === null && raw2 === null)
            return true;

        if (raw1.value === raw2.value) {
            if (raw1.vars.length === raw2.vars.length) {
                for (let i = 0; i < raw1.vars.length; i++) {
                    if (raw1.vars[i] !== raw2.vars[i])
                        return false;
                }
            }
            return true;
        }
        return false;
    }
});



module.exports = FormatDef;
