
'use strict';

var _ = require('underscore');
var Backbone = require('backbone');
var FormatDef = require('./formatdef');

var Opt = function(type, initialValue, params) {

    this.params = params;
    this.type = type;
    this._value = initialValue;

    _.extend(this, Backbone.Events);

    this.getLength = function(keys) {
        if (Array.isArray(this._value) === false)
            return 1;

        if (_.isUndefined(keys) || keys.length === 0)
            return this._value.length;

        var value = null;
        var a = this._value;
        for (var i = 0; i < keys.length; i++) {
            var index = keys[i];
            a = a[index];
            if (i === keys.length - 1)
                value = a;
        }

        if (value === null)
            return 0;

        if (Array.isArray(value) === false)
            return 1;

        return value.length;
    };

    this.getValue = function(keys) {
        if (_.isUndefined(keys))
            return this._value;

        if (Array.isArray(keys)) {
            if (keys.length === 0)
                return this._value;
            else {
                var value = null;
                var a = this._value;
                for (var i = 0; i < keys.length; i++) {
                    var index = keys[i];
                    a = a[index];
                    if (i === keys.length - 1)
                        value = a;
                }

                return value;
            }
        }
        else
            return this._value[keys];
    };

    this.getFormattedValue = function(keys, format) {
        var obj = this.getValue(keys);
        return FormatDef.constructor(obj, format);
    };

    this.setValue = function(value, keys, eventParams) {

        if (_.isUndefined(eventParams)) {
            if (_.isUndefined(keys)) {
                keys = [];
                eventParams = Opt.getDefaultEventParams("changed");
            }
            else if (Array.isArray(keys) === false) {
                eventParams = keys;
                keys = [];
            }
        }

        var force = eventParams.force;

        var fValue = value;
        if (_.isUndefined(value.raw) === false) //To handle typed values
            fValue = value.raw;

        if (keys.length === 0) {
            if (force || _.isEqual(fValue, this._value) === false) {
                this._value = fValue;
                if (eventParams.silent === false)
                    this.trigger(eventParams.eventType, keys, eventParams.data);
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
                    if (eventParams.silent === false)
                        this.trigger(eventParams.eventType, keys, eventParams.data);
                    return true;
                }
                a = b;
            }
        }

        return false;
    };

    this.insertValueAt = function(value, keys, eventParams) {

        if (_.isUndefined(eventParams))
            eventParams = Opt.getDefaultEventParams("inserted");

        var baseKeys = keys.slice(0, keys.length - 1);
        var index = keys[keys.length - 1];
        var obj = this.getValue(baseKeys);

        if (typeof(obj) !== 'object')
            throw 'Can only insert into an array or object';

        var isArray = Array.isArray(obj);

        if (isArray === true && typeof(index) !== 'number')
            throw 'Index can only be a number for an array';
        else if (isArray === false && typeof(index) !== 'string')
            throw 'Index can only be a string for an object';

        if (isArray) {
            if (index < obj.length)
                obj.splice(index, 0, value);
            else if (index === obj.length)
                obj.push(value);
            else
                throw 'not a valid index for the array';

            if (eventParams.silent === false)
                this.trigger(eventParams.eventType, keys, eventParams.data);
            return true;
        }
        else {
            if (index in obj)
                eventParams.eventType = 'valuechanged';
            //    throw 'Key already exists in object';
            //else {
                obj[index] = value;
                if (eventParams.silent === false)
                    this.trigger(eventParams.eventType, keys, eventParams.data);
                return true;
            //}
        }
        return false;
    };

    this.removeAt = function(keys, eventParams) {

        if (_.isUndefined(eventParams))
            eventParams = Opt.getDefaultEventParams("removed");

        var baseKeys = keys.slice(0, keys.length - 1);
        var index = keys[keys.length - 1];
        var obj = this.getValue(baseKeys);

        if (typeof(obj) !== 'object')
            throw 'Can only remove from an array or object';

        var isArray = Array.isArray(obj);

        if (isArray === true && typeof(index) !== 'number')
            throw 'Index can only be a number for an array';
        else if (isArray === false && typeof(index) !== 'string')
            throw 'Index can only be a string for an object';

        if (isArray) {
            if (index < obj.length)
                obj.splice(index, 1);
            else
                throw 'not a valid index for the array';

            if (eventParams.silent === false)
                this.trigger(eventParams.eventType, keys, eventParams.data);
            return true;
        }
        else {
            if (index in obj) {
                delete obj[index];
                if (eventParams.silent === false)
                    this.trigger(eventParams.eventType, keys, eventParams.data);
                return true;
            }

            else
                throw "Key doesn't exists in object";
        }
        return false;
    };

    this.onInitialise = function(params) {
        if (_.isUndefined(params) === false) {
            //this.setValue(params.default);
            this.name = params.name;
            this.text = params.text;
        }
    };

    this.toString = function() {
        return this._value.toString();
    };

    this.onInitialise(params);
};

Opt.extend = function(target, type, initialValue, params) {
    Opt.call(target, type, initialValue, params);
};

Opt.getDefaultEventParams = function(event) {
    if (_.isUndefined(event))
        event = "changed";

    return {
        force: false,
        silent: false,
        eventType: "value" + event,
        data: null,
     };
};

module.exports = Opt;
