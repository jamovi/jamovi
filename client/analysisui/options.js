
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const Opt = require('./option');

const keyedQueue = function() {

    this.map = {};
    this._hasEvents = false;

    this.get = function(index) {
        return this.data[index];
    };

    this.getKeyLevel = function(keys) {
        if (keys === undefined)
            return 0;

        return keys.length;
    };

    this.push = function(key, obj) {
        this._hasEvents = true;
        let oldData = this.map[key];

        if (oldData === undefined) {
            oldData = { events: [ ], properties: [ ] };
            this.map[key] = oldData;
        }

        oldData.option = obj.option;
        if (obj.type === 'change' && this.getKeyLevel(obj.keys) === 0) {
            oldData.events = [ obj ];
            return;
        }

        if (obj.type === 'property')
            this.processProperty(obj, oldData.properties);
        else
            this.processEvent(obj, oldData.events);
    };

    this.compareKeys = function(newKey, k2) {
        if (k2.length > newKey.length || newKey.length === 0)
            return { same: false, sibling: false };

        for (let i = 0; i < newKey.length; i++) {
            if (i === newKey.length.length - 1) {
                let isIndex = typeof(newKey[i]) === 'number';
                let sameType = typeof(newKey[i]) === typeof(k2[i]);
                if (sameType && newKey[i] === k2[i])
                    return { same: true, sibling: true, distance: 0 };
                else if (sameType && isIndex)
                    return { same: false, sibling: true, distance: newKey[i] - k2[i] };
                else
                    return { same: false, sibling: true, distance: null };
            }
            else
                return { same: false, sibling: false };
        }
    };

    this.compareArrays = function(a1, a2) {
        if (a1.length !== a2.length)
            return false;

        for (let i = 0; i < a1.length; i++) {
            if (a1[i] !== a2[i])
                return false;
        }

        return true;
    };

    this.processProperty = function(obj, oldData) {
        for (let i = 0; i < oldData.length; i++) {
            if (this.compareArrays(obj.keys, oldData[i].keys)) {
                oldData[i] = obj;
                return;
            }
        }

        oldData.push(obj);
    };

    this.processEvent = function(obj, oldData, startIndex) {

        if (startIndex === undefined)
            startIndex = oldData.length - 1;

        if (startIndex === -1) {
            oldData.push(obj);
            return;
        }

        let lastItem = oldData[startIndex];
        let compare = this.compareKeys(obj.keys, lastItem.keys);
        let unsafeDirection = -1;
        if (obj.type === 'change')
            unsafeDirection = 1;

        if (lastItem.type === obj.type && compare.sibling && compare.distance !== null && compare.distance <= lastItem.length) {
            if (obj.value)
                lastItem.value[compare.distance] = obj.value[0];

            if (compare.distance === lastItem.length)
                lastItem.length += 1;
        }
        else if (compare.sibling && compare.distance !== null && (unsafeDirection * compare.distance) >= 0)
            oldData.push(obj);
        else
            this.processEvent(obj, oldData, startIndex - 1);
    };

    this.contains = function(key) {
        return this.map[key] !== undefined;
    };

    this.hasEvents = function() {
        return this._hasEvents;
    };
};

const Options = function(def, translator) {

    Object.assign(this, Backbone.Events);

    this._list = [];
    this._refList = { };
    this._refListIndex = 0;

    this._beginEdit = 0;
    this._serverQueuedEvents = new keyedQueue();

    this.initialize = function(def, translator) {
        for (let i = 0;i < def.length; i++) {
            let item = def[i];

            if (item.default === undefined)
                item.default = null;

            let translated = this.translateDefault(translator, item, item.default);
            if (translated !== null)
                item.default = translated;

            let option = new Opt(item.default, item);

            this._list.push(option);
        }
    };

    this.translateDefault = function(translator, item, defaultValue) {
        if (defaultValue) {
            switch (item.type) {
                case 'String':
                    return translator(defaultValue);
                case 'Group':
                    for (let element of item.elements) {
                        let translated = this.translateDefault(translator, element, defaultValue[element.name]);
                        if (translated !== null)
                            defaultValue[element.name] = translated;
                    }
                    break;
                case 'Array':
                    for (let i = 0; i  < defaultValue.length; i++) {
                        let translated = this.translateDefault(translator, item.template, defaultValue[i]);
                        if (translated !== null)
                            defaultValue[i] = translated;
                    }
                    break;
            }
        }

        return null;
    };

    this.beginEdit = function() {
        this._beginEdit += 1;
    };

    this.endEdit = function() {
        this._beginEdit -= 1;
        if (this._beginEdit === 0) {
            this.fireQueuedEvents();
        }
    };

    this.getOption = function(name) {

        let list = this._list;

        if ( ! list)
            return null;

        if ($.isNumeric(name))
            return list[name];

        let option = this._refList[name];

        if (option === undefined) {
            option = null;
            let i = this._refListIndex;
            for (; i < list.length; i++) {
                let optObj = list[i];
                this._refList[optObj.name] = optObj;
                if (optObj.name === name) {
                    option = optObj;
                    i += 1;
                    break;
                }
            }

            this._refListIndex = i;
        }

        return option;
    };

    this.setOptionValue = function(name, value, keys, eventParams) {

        if (eventParams === undefined) {
            if (keys === undefined) {
                keys = [];
                eventParams = Options.getDefaultEventParams();
            }
            else if (Array.isArray(keys) === false) {
                eventParams = keys;
                keys = [];
            }
            else
                eventParams = Options.getDefaultEventParams();
        }

        let option = null;
        if (name._value !== undefined && name._initialized !== undefined)
            option = name;
        else
            option = this.getOption(name);

        if (option === null || !option.setValue)
            return false;

        let eOpt = Opt.getDefaultEventParams();
        eOpt.force = eventParams.force;

        if (option.setValue(value, keys, eOpt) && eventParams.silent === false)
            this.onValueChanged(option, value, keys, 'change');

        return true;
    };

    this.setPropertyValue = function(name, propertyName, value, key, fragmentName) {
        if (propertyName === 'value' && ! fragmentName) {
            this.setOptionValue(name, value, key);
            return;
        }

        let option = null;
        if (name._value !== undefined && name._initialized !== undefined)
            option = name;
        else
            option = this.getOption(name);

        key.push(propertyName);

        option.setProperty(value, key);

        this.onValueChanged(option, value, key, 'property');
    };

    this.insertOptionValue = function(name, value, keys, eventParams) {

        if (eventParams === undefined)
            eventParams = Options.getDefaultEventParams();

        let option = null;
        if (name._value !== undefined && name._initialized !== undefined)
            option = name;
        else
            option = this.getOption(name);

        let eOpt = Opt.getDefaultEventParams('inserted');
        eOpt.force = eventParams.force;

        if (option.insertValueAt(value, keys, eOpt) && eventParams.silent === false)
            this.onValueChanged(option, value, keys, 'insert');
    };

    this.removeOptionValue = function(name, keys, eventParams) {

        if (eventParams === undefined)
            eventParams = Options.getDefaultEventParams();

        let option = null;
        if (name._value !== undefined && name._initialized !== undefined)
            option = name;
        else
            option = this.getOption(name);

        let eOpt = Opt.getDefaultEventParams('removed');
        eOpt.force = eventParams.force;

        if (option.removeAt(keys, eOpt) && eventParams.silent === false)
            this.onValueChanged(option, null, keys, 'remove');
    };

    this.onValueChanged = function(option, value, keys, type) {

        this._serverQueuedEvents.push(option.name, { option: option, keys: keys, type: type, value: [value], length: 1 });

        if (this._beginEdit === 0)
            this.fireQueuedEvents();
    };

    this.fireQueuedEvents = function() {

        if (this._serverQueuedEvents.hasEvents()) {
            this.trigger('options.valuesForServer', this._serverQueuedEvents);
            this._serverQueuedEvents = new keyedQueue(); //a new queue is made so that the old queue can be sent without being modified.
        }
    };

    this.initialize(def, translator);
};

Options.getDefaultEventParams = function() {
    return {
        force: false,
        silent: false,
        data: null
     };
};

module.exports = Options;
