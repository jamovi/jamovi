'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const SuperClass = require('../common/superclass');

var PropertySupplier = function(properties) {

    Object.assign(this, Backbone.Events);

    this.params = properties;
    this._propertySupplier_editting = 0;
    this._propertySupplier_eventsPending = {};

    this.registerComplexProperty = function(name, getter, setter, externalTrigger) {
        if (this.properties[name] !== undefined)
            return;

        this.properties[name] = { get: getter, set: setter, trigger: externalTrigger, externalTrigger: externalTrigger };
    };

    this.registerSimpleProperty = function(name, initialValue, filter, defined) {

        if (defined === undefined)
            defined = false;

        if (this.properties[name] !== undefined && this.properties[name].isDefined)
            return;

        let properties = {
            trigger: name + "_changed",
            isDefined: defined,
            get: () => {
                return this.properties[name].value;
            },
            set: (value) => {
                var v = value;
                if (filter !== null && filter !== undefined)
                    v = filter.check(value);
                this.properties[name].value = v;
            },
            value: initialValue
        };

        let dataBound = this.isValueDataBound(initialValue);
        if (dataBound) {
            properties.binding = initialValue;
            properties.value = null;
        }

        this.properties[name] = properties;
    };

    this.isValueDataBound = function(value) {
        if (typeof value === 'string') {
            let temp = value.trim();
            return temp.startsWith('(') && temp.endsWith(')');
        }

        return false;
    };

    this.getPropertyValue = function(property) {

        var propertyObj = this.properties[property];
        if (propertyObj === undefined)
            throw "property '" + property + "' does not exist";

        var value = propertyObj.get.call(this);
        if ($.isFunction(value))
            return value.call(this);
        else
            return value;
    };

    this.setPropertyValue = function(property, value) {
        if (property === "name" || property === "type")
            throw "Cannot change the '" + property + "' property";

        var propertyObj = this.properties[property];
        if (propertyObj === undefined)
            throw "property '" + property + "' does not exist";

        var oldValue = propertyObj.get.call(this);
        if (oldValue !== value) {
            oldValue = propertyObj.set.call(this, value);
            if (propertyObj.externalTrigger === undefined)
                this.firePropertyChangedEvent(property);

            if (this.onPropertyChanged)
                this.onPropertyChanged(property);
        }
    };

    this.isPropertyDefined = function (propertyName) {
        let property = this.properties[propertyName];
        return property && property.isDefined;
    };

    this.hasProperty = function(property) {
        return property in this.properties;
    };

    this.getTrigger = function(property) {
        return this.properties[property].trigger;
    };

    this.beginPropertyEdit = function() {
        this._propertySupplier_editting += 1;
    };

    this.endPropertyEdit = function() {
        if (this._propertySupplier_editting === 0)
            return;

        this._propertySupplier_editting -= 1;

        if (this._propertySupplier_editting === 0) {
            for (let key in this._propertySupplier_eventsPending)
                this.firePropertyChangedEvent(key);

            this._propertySupplier_eventsPending = { };
        }
    };

    this.firePropertyChangedEvent = function(property) {
        if (this._propertySupplier_editting > 0)
            this._propertySupplier_eventsPending[property] = true;
        else
            this.trigger(this.getTrigger(property));
    };

    this.properties = { };
    if (properties  !== undefined && properties !== null) {
        if (typeof properties !== 'object' || Array.isArray(properties) === true)
            throw 'Properties can only be an object.';
        else {
            for (let key in properties) {
                let value = properties[key];
                this.registerSimpleProperty(key, value, null, true);
            }
        }
    }
};

SuperClass.create(PropertySupplier);

module.exports = PropertySupplier;
