'use strict';

import { DefaultEventMap, EventEmitter, Listener } from 'tsee';
import { CtrlDef } from './optionsview';
import { ControlBaseProperties } from './controlbase';

export interface IPropertyFilter<T> {
    check: (value: T) => T;
}

interface IProperties<T> {
    trigger: string;
    isDefined?: boolean;
    get: () => T;
    set: (value: T) => void;
    value?: T;
    binding?: string;
    externalTrigger?: any;
}

export type EventHandlers<P> = {
    [K in keyof P as P[K] extends Listener ? `${(K & string)}` : `${(K & string)}_changed`]: (P[K] extends Listener ? P[K] : Listener);
};

export class PropertySupplier<P extends CtrlDef, E extends { } = EventHandlers<P>> extends EventEmitter<E> {
    public params: Partial<P>;
    private _propertySupplier_editting: number;
    private _propertySupplier_eventsPending: { [key: string]: boolean };
    public properties: Partial<{ [K in keyof P]: IProperties<P[K]> }>;

    constructor(properties: Partial<P>) {
        super();

        this.params = properties;
        this._propertySupplier_editting = 0;
        this._propertySupplier_eventsPending = {};

        this.registerProperties(properties);
    }

    protected registerProperties(properties: Partial<P>) {
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

    protected registerComplexProperty<K extends (keyof P & string)>(name: K, getter: () => P[K], setter: (value: P[K]) => void, externalTrigger: string) {
        if (this.properties[name] !== undefined)
            return;

        this.properties[name] = { get: getter, set: setter, trigger: externalTrigger, externalTrigger: externalTrigger };
    }

    public registerSimpleProperty<K extends keyof P>(name: K, initialValue: P[K], filter: IPropertyFilter<P[K]>=null, defined=false) {

        if (this.properties[name] !== undefined && this.properties[name].isDefined)
            return;

        let properties: IProperties<P[K]> = {
            trigger: (name.toString() + "_changed"),
            isDefined: defined,
            get: () => {
                return this.properties[name].value;
            },
            set: (value: P[K]) => {
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
            properties.binding = initialValue as string;
            properties.value = null;
        }

        this.properties[name] = properties;
    }

    protected isValueDataBound(value: any) {
        if (typeof value === 'string') {
            let temp = value.trim();
            return temp.startsWith('(') && temp.endsWith(')');
        }

        return false;
    }

    public getPropertyValue<K extends keyof P>(property: K): P[K] {

        var propertyObj = this.properties[property];
        if (propertyObj === undefined)
            throw "property '" + property.toString() + "' does not exist";

        var value = propertyObj.get.call(this);
        if (typeof value === 'function')
            return value.call(this);
        else
            return value;
    }

    public setPropertyValue<K extends (keyof P & string)>(property: K, value: P[K]) {
        if (property === "name" || property === "type")
            throw "Cannot change the '" + property.toString() + "' property";

        var propertyObj = this.properties[property];
        if (propertyObj === undefined)
            throw "property '" + property.toString() + "' does not exist";

        var oldValue = propertyObj.get.call(this);
        if (oldValue !== value) {
            oldValue = propertyObj.set.call(this, value);
            if (propertyObj.externalTrigger === undefined)
                this.firePropertyChangedEvent(property);

            if (this.onPropertyChanged)
                this.onPropertyChanged(property);
        }
    }

    protected onPropertyChanged<K extends keyof P>(property: K) {

    }

    public isPropertyDefined<K extends keyof P>(propertyName: K) {
        let property = this.properties[propertyName];
        return property && property.isDefined;
    }

    public hasProperty<K extends keyof P>(property: K) {
        return property in this.properties;
    }

    public getTrigger<K extends keyof P>(property: K) {
        return this.properties[property].trigger;
    }

    public runInEditScope(fn: () => void) {
        this.beginPropertyEdit();
        try {
            fn();
        } finally {
            this.endPropertyEdit();
        }
    }

    public beginPropertyEdit() {
        this._propertySupplier_editting += 1;
    }

    public endPropertyEdit() {
        if (this._propertySupplier_editting === 0)
            return;

        this._propertySupplier_editting -= 1;

        if (this._propertySupplier_editting === 0) {
            for (let key in this._propertySupplier_eventsPending)
                this.firePropertyChangedEvent(key);

            this._propertySupplier_eventsPending = { };
        }
    }

    protected firePropertyChangedEvent<K extends (keyof P & string)>(property: K) {
        if (this._propertySupplier_editting > 0)
            this._propertySupplier_eventsPending[property] = true;
        else {
            let eventName = this.getTrigger(property) as string;
            let emitter = this as EventEmitter;
            emitter.emit(eventName);
        }
    }
}

export default PropertySupplier;
