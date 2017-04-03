
'use strict';

const _ = require('underscore');
const Backbone = require('backbone');
const FormatDef = require('./formatdef');

const Opt = function(initialValue, params) {

    this.params = params;
    this._value = initialValue;
    this._initialized = false;

    Object.assign(this, Backbone.Events);

    this.getLength = function(keys) {
        if (this._value === null)
            return 0;

        if (Array.isArray(this._value) === false)
            return 1;

        if (keys === undefined || keys.length === 0)
            return this._value.length;

        let value = null;
        let a = this._value;
        for (let i = 0; i < keys.length; i++) {
            let index = keys[i];
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
        if (keys === undefined)
            return this._value;

        if (Array.isArray(keys)) {
            if (keys.length === 0)
                return this._value;
            else {
                let value = null;
                let a = this._value;
                for (let i = 0; i < keys.length; i++) {
                    let index = keys[i];
                    if (a === null)
                        return;
                    if (typeof a === 'object')
                        a = a[index];
                    else if (index !== 0)
                        return;

                    if (i === keys.length - 1 || a === undefined) {
                        value = a;
                        break;
                    }
                }

                return value;
            }
        }
        else
            return this._value[keys];
    };

    this.getFormattedValue = function(keys, format) {
        let obj = this.getValue(keys);
        return FormatDef.constructor(obj, format);
    };

    this.isValidKey = function(key) {
        if (key.length === 0)
            return true;

        let a = this._value;
        if (a === null || a === undefined || typeof a !== "object")
            return false;

        for (let i = 0; i < key.length; i++) {
            a = a[key[i]];
            if (a === undefined)
                return false;
        }
        return true;
    };

    this.setValue = function(value, keys, eventParams) {

        if (eventParams === undefined) {
            if (keys === undefined) {
                keys = [];
                eventParams = Opt.getDefaultEventParams("changed");
            }
            else if (Array.isArray(keys) === false) {
                eventParams = keys;
                keys = [];
            }
            else
                eventParams = Opt.getDefaultEventParams("changed");
        }

        let force = eventParams.force;

        let fValue = value;
        if (value !== null && value.raw !== undefined) //To handle typed values
            fValue = value.raw;

        force = force | !this._initialized;
        this._initialized = true;

        if (keys.length === 0) {
            if (force || _.isEqual(fValue, this._value) === false) {
                this._value = fValue;
                if (eventParams.silent === false)
                    this.trigger(eventParams.eventType, keys, eventParams.data);
                return true;
            }
        }
        else {
            let p = null;
            let a = this._value;
            for (let i = 0; i < keys.length; i++) {
                let index = keys[i];
                if (a === null) {
                    let keyType = typeof index;
                    if (keyType === 'number')
                        a = [ ];
                    else if (keyType === 'string')
                        a = { };
                    if (p === null)
                        this._value = a;
                    else
                        p[keys[i-1]] = a;
                }
                p = a;
                let b = a[index];
                if (i === keys.length - 1 && (force || _.isEqual(b, fValue) === false)) {
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

    this.isValueInitialized = function() {
        return this._initialized;
    };

    this.insertValueAt = function(value, keys, eventParams) {

        if (eventParams === undefined)
            eventParams = Opt.getDefaultEventParams("inserted");

        let baseKeys = keys.slice(0, keys.length - 1);
        let index = keys[keys.length - 1];
        let obj = this.getValue(baseKeys);

        if (typeof(obj) !== 'object')
            throw 'Can only insert into an array or object';

        let isArray = Array.isArray(obj);

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

        if (eventParams === undefined)
            eventParams = Opt.getDefaultEventParams("removed");

        let baseKeys = keys.slice(0, keys.length - 1);
        let index = keys[keys.length - 1];
        let obj = this.getValue(baseKeys);

        if (typeof(obj) !== 'object')
            throw 'Can only remove from an array or object';

        let isArray = Array.isArray(obj);

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

    this.toString = function() {
        if (this._value === undefined || this._value === null)
            return '';

        return this._value.toString();
    };

    this.valueInited = function() {
        return this._value !== null;
    };

    if (params !== undefined) {
        this.name = params.name;
        this.text = params.text;
    }
};

Opt.extend = function(target, initialValue, params) {
    Opt.call(target, initialValue, params);
};

Opt.getDefaultEventParams = function(event) {
    if (event === undefined)
        event = "changed";

    return {
        force: false,
        silent: false,
        eventType: "value" + event,
        data: null,
     };
};

module.exports = Opt;
