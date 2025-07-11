
'use strict';

import { FormattedValue } from './formatdef';
import { EventEmitter } from 'events';
import { IOptionsEventParams, OptionDef } from './options';

export interface IOptionEventParams extends IOptionsEventParams {
    eventType: string;
}

export class Opt<T> extends EventEmitter {
    static getDefaultEventParams(event?: string): IOptionEventParams {
        if (event === undefined)
            event = "changed";

        return {
            force: false,
            silent: false,
            eventType: "value" + event,
            data: null,
            externalEvent: false
        };
    }

    _value: T | null;
    _defaultValue: T | null;
    _initialized: boolean = false;
    name: string;
    _overrideCount = 0;
    params: OptionDef;


    constructor(initialValue: T | null, params: OptionDef) {
        super();
        this.params = params;
        this._paramsOverride = { };
        this._overrideCount = 0;
        this._value = initialValue;
        this._defaultValue = initialValue;
        this._initialized = false;
        
        if (params !== undefined) {
            this.name = params.name;
            this.text = params.text;
        }
    }

    getLength(keys) {
        if (this._value === null)
            return 0;

        if (Array.isArray(this._value) === false)
            return 1;

        if (keys === undefined || keys.length === 0)
            return this._value.length;

        let value = null;
        let a = this._value;
        for (let i = 0; i < keys.length; i++) {
            if (a === undefined || a === null)
                break;
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
    }

    _getObjectElement(obj, key) {
        if (key === undefined)
            return obj;

        if (Array.isArray(key)) {
            if (key.length === 0)
                return obj;
            else {
                let value = null;
                let a = obj;
                for (let i = 0; i < key.length; i++) {
                    let index = key[i];
                    if (a === null)
                        return;
                    if (typeof a === 'object')
                        a = a[index];
                    else if (index !== 0)
                        return;

                    if (i === key.length - 1 || a === undefined) {
                        value = a;
                        break;
                    }
                }

                return value;
            }
        }
        else
            return obj[key];
    }

    getValue(): T;
    getValue(key: any): any;
    getValue(key?) {
        return this._getObjectElement(this._value, key);
    }

    getFormattedValue(key, format) {
        let obj = this.getValue(key);
        return new FormattedValue(obj, format);
    }

    _isValidKey(obj, key) {
        if (key.length === 0)
            return true;

        let a = obj;
        if (a === null || a === undefined || typeof a !== "object")
            return false;

        for (let i = 0; i < key.length; i++) {
            a = a[key[i]];
            if (a === undefined)
                return false;
        }
        return true;
    }

    isValidKey(key) {
        return this._isValidKey(this._value, key);
    }

    setProperty(value, key) {
        let index = key.join('-');
        if (this._getObjectElement(this.params, key) === value) {
            delete this._paramsOverride[index];
            this._overrideCount -= 1;
        }
        else {
            if (this._paramsOverride[index] === undefined)
                this._overrideCount += 1;
            this._paramsOverride[index] = { key: key, value: value };
        }
    }

    getOverriddenProperties() {
        if (this._overrideCount === 0)
            return null;

        return this._paramsOverride;
    }

    isEqual(a, b) {
        if (a === b) return true;

        if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') {
            return false;
        }

        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;

        for (let key of aKeys) {
            if (!b.hasOwnProperty(key) || !this.isEqual(a[key], b[key])) {
            return false;
            }
        }

        return true;
    }

    setValue(value, keys, eventParams?) {

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
            if (fValue === null && this._defaultValue !== null) {
                fValue = this._defaultValue;
                if (eventParams.externalEvent)
                    force = true;  // makes sure the server is updated with the default value;
            }
            if (force || this.isEqual(fValue, this._value) === false) {
                this._value = fValue;
                if (eventParams.silent === false)
                    this.emit(eventParams.eventType, keys, eventParams.data);
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
                if (b === undefined && i !== keys.length - 1) {
                    let keyType = typeof keys[i + 1];
                    if (keyType === 'number')
                        b = [ ];
                    else if (keyType === 'string')
                        b = { };
                    a[index] = b;
                }
                else if (i === keys.length - 1 && (force || this.isEqual(b, fValue) === false)) {
                    a[index] = fValue;
                    if (eventParams.silent === false)
                        this.emit(eventParams.eventType, keys, eventParams.data);
                    return true;
                }
                a = b;
            }
        }

        return false;
    }

    isValueInitialized() {
        return this._initialized;
    }

    insertValueAt(value, keys, eventParams?) {

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
                this.emit(eventParams.eventType, keys, eventParams.data);
            return true;
        }
        else {
            if (index in obj)
                eventParams.eventType = 'valuechanged';
            //    throw 'Key already exists in object';
            //else {
                obj[index] = value;
                if (eventParams.silent === false)
                    this.emit(eventParams.eventType, keys, eventParams.data);
                return true;
            //}
        }
        return false;
    }

    removeAt(keys, eventParams?) {

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
                this.emit(eventParams.eventType, keys, eventParams.data);
            return true;
        }
        else {
            if (index in obj) {
                delete obj[index];
                if (eventParams.silent === false)
                    this.emit(eventParams.eventType, keys, eventParams.data);
                return true;
            }

            else
                throw "Key doesn't exists in object";
        }
        return false;
    }

    toString() {
        if (this._value === undefined || this._value === null)
            return '';

        return this._value.toString();
    }

    valueInited() {
        return this._value !== null;
    }
}


export default Opt;
