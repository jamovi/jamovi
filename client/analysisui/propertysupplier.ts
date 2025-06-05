'use strict';

import { EventEmitter } from 'events';

export interface IPropertyFilter<T> {
    check: (value: T) => T;
}

export class PropertySupplier extends EventEmitter {
    protected params: any;
    private _propertySupplier_editting: number;
    private _propertySupplier_eventsPending: any;
    public properties: any;

    constructor(properties) {
        super();

        this.params = properties;
        this._propertySupplier_editting = 0;
        this._propertySupplier_eventsPending = {};

        this.registerProperties(properties);
    }

    protected registerProperties(properties) {
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
    }

    protected registerComplexProperty(name: string, getter, setter, externalTrigger) {
        if (this.properties[name] !== undefined)
            return;

        this.properties[name] = { get: getter, set: setter, trigger: externalTrigger, externalTrigger: externalTrigger };
    }

    public registerSimpleProperty<T>(name: string, initialValue, filter: IPropertyFilter<T>=null, defined=false) {

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
                if (filter !== null)
                    v = filter.check(value);
                this.properties[name].value = v;
            },
            value: initialValue,
            binding: undefined
        };

        let dataBound = this.isValueDataBound(initialValue);
        if (dataBound) {
            properties.binding = initialValue;
            properties.value = null;
        }

        this.properties[name] = properties;
    }

    isValueDataBound(value) {
        if (typeof value === 'string') {
            let temp = value.trim();
            return temp.startsWith('(') && temp.endsWith(')');
        }

        return false;
    }

    getPropertyValue(property) {

        var propertyObj = this.properties[property];
        if (propertyObj === undefined)
            throw "property '" + property + "' does not exist";

        var value = propertyObj.get.call(this);
        if (typeof value === 'function')
            return value.call(this);
        else
            return value;
    }

    setPropertyValue(property, value) {
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
    }

    onPropertyChanged(property: string) {

    }

    isPropertyDefined(propertyName) {
        let property = this.properties[propertyName];
        return property && property.isDefined;
    }

    hasProperty(property) {
        return property in this.properties;
    }

    getTrigger(property) {
        return this.properties[property].trigger;
    }

    beginPropertyEdit() {
        this._propertySupplier_editting += 1;
    }

    endPropertyEdit() {
        if (this._propertySupplier_editting === 0)
            return;

        this._propertySupplier_editting -= 1;

        if (this._propertySupplier_editting === 0) {
            for (let key in this._propertySupplier_eventsPending)
                this.firePropertyChangedEvent(key);

            this._propertySupplier_eventsPending = { };
        }
    }

    firePropertyChangedEvent(property) {
        if (this._propertySupplier_editting > 0)
            this._propertySupplier_eventsPending[property] = true;
        else
            this.emit(this.getTrigger(property));
    }
}

export default PropertySupplier;
