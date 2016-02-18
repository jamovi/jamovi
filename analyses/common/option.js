
'use strict';

var _ = require('underscore');

function Option(data) {

    this.getValue = function(keys) {
        if (_.isUndefined(keys))
            return this._value;

        if (Array.isArray(keys)) {
            if (keys.length === 0)
                return this._value;
            else {
                var value = null;
                var a = this._value;
                for (var i = keys.length - 1; i >= 0; i--) {
                    var index = keys[i];
                    a = a[index];
                    if (i === 0)
                        value = a;
                }

                return value;
            }
        }
        else
            return this._value[keys];
    };

    this.setValue = function(value, keys, force) {

        if (_.isUndefined(force)) {
            if (_.isUndefined(keys))
                keys = [];
            else if(typeof(keys) === "boolean") {
                force = keys;
                keys = [];
            }
        }

        var fValue = value;
        if (typeof this._value === 'string') {
            if (this.parseValue)
                fValue = this.parseValue(value);
            else
                return false;
        }

        if (keys.length === 0) {
            if (force || _.isEqual(fValue, this._value) === false) {
                this._value = fValue;
                return true;
            }
        }
        else {
            var a = this._value;
            for (var i = keys.length - 1; i >= 0; i--) {
                var index = keys[i];
                var b = a[index];
                if (i === 0 && (force || _.isEqual(b, fValue) === false)) {
                    a[index] = fValue;
                    return true;
                }
                a = b;
            }
        }

        return false;
    };

    this.onInitialise = function(data) {
        if (_.isUndefined(data) === false) {

            if (_.isUndefined(data.default) === false)
                this.setValue(data.default);

            this.name = data.name;
            this.text = data.text;
        }
    };

    this.onInitialise(data);
}

module.exports = Option;
