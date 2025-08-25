'use strict';

import { ViewEvent } from './actions';
import LayoutActionManager from './layoutactionmanager';
import LayoutActionResource from './layoutactionresource';

interface EventObj {
    name: string;
    property: string;
    eventName: string;
    supplier: any;
    connected: boolean;
    execute?: (...args: any[]) => void;
}

export class LayoutAction {
    _manager: LayoutActionManager;
    _callback: (a: any, b: any, ...args: any[]) => void;
    _propertyListeners: EventObj[];
    _listeners: EventObj[];
    _resources: { [name: string]: LayoutActionResource };

    constructor(manager: LayoutActionManager, params: ViewEvent) {

        this._callback = params.execute;

        this._manager = manager;

        this._resources = { };
        this._listeners = [];
        this._propertyListeners = [];

        let eventListeners = params.onEvent;
        if (params.onEvent !== undefined && Array.isArray(eventListeners) === false)
            eventListeners = [ eventListeners ];

        let propertyListeners = params.onChange;
        if (params.onChange !== undefined && Array.isArray(propertyListeners) === false)
            propertyListeners = [ propertyListeners ];

        this._connectToListeners(eventListeners, propertyListeners);
    }

    execute(...args: any[]) {
        if (this._manager.initializingData())
            return;

        this._manager._executeStarted(this);
        this._callback.call(this._manager._view, this._manager._resources, ...args);
        this._manager._executeEnded(this);
    }

    _connectToListeners(eventListeners, propertyListeners) {
        let q = null;
        let name = null;
        let eventObj: EventObj = null;
        if (propertyListeners !== undefined) {
            for (let i = 0; i < propertyListeners.length; i++) {
                q = propertyListeners[i].split(".");
                if (q.length > 2 || q.length <= 0)
                    continue;

                name = q[0];
                let property = "value";
                if (q.length > 1)
                    property = q[1];

                eventObj = {
                    name: name,
                    property: property,
                    eventName: null,
                    supplier: null,
                    connected: false,
                };
                this._propertyListeners.push(eventObj);
                this._listeners.push(eventObj);
            }
        }

        if (eventListeners !== undefined) {
            for (let i = 0; i < eventListeners.length; i++) {
                q = eventListeners[i].split(".");
                if (q.length !== 2)
                    continue;

                name = q[0];
                let eventName = q[1];

                eventObj = {
                    name: name,
                    property: null,
                    eventName: eventName,
                    supplier: null,
                    connected: false
                };
                this._listeners.push(eventObj);
            }
        }
    }

    hasEventName(eventName: string): boolean {
        for (let obj of this._listeners) {
            if (obj.eventName === eventName) {
                return true;
            }
        }
        return false;
    }

    initialize() {
        for (let eventObj of this._listeners) {
            if (eventObj.connected === false) {
                let supplier = this._manager.getObject(eventObj.name);
                if (eventObj.eventName === null)
                    eventObj.eventName = supplier.getTrigger(eventObj.property);
                eventObj.supplier = supplier;
                eventObj.connected = true;
                eventObj.execute = this._createExecute(supplier, eventObj.eventName);
                eventObj.supplier.on(eventObj.eventName, eventObj.execute);
            }
        }
    }

    _createExecute(sender, eventName) {
        return (...args: any[]) => {
            if (args === undefined)
                args = [];

            if (args[0] !== undefined)
                Object.assign(args[0], { sender: sender, eventName: eventName });
            else
                args[0] = { sender: sender, eventName: eventName };

            this.execute(...args);
        };
    }

    tryConnectTo(name, supplier) {
        let found = false;
        for (let eventObj of this._listeners) {
            if (eventObj.name === name && eventObj.connected === false) {
                if (eventObj.eventName === null)
                    eventObj.eventName = supplier.getTrigger(eventObj.property);
                eventObj.supplier = supplier;
                eventObj.connected = true;
                eventObj.execute = this._createExecute(supplier, eventObj.eventName);
                eventObj.supplier.on(eventObj.eventName, eventObj.execute);
                found = true;
            }
        }
        return found;
    }

    disconnectFrom(supplier) {
        for (let eventObj of this._listeners) {
            if (eventObj.supplier === supplier) {
                if (eventObj.connected) {
                    eventObj.supplier.off(eventObj.eventName, eventObj.execute);
                    eventObj.supplier = null;
                    if (eventObj.property !== null)
                        eventObj.eventName = null;
                    eventObj.connected = false;
                }
            }
        }
    }

    close() {
        for (let eventObj of this._listeners) {
            if (eventObj.connected) {
                eventObj.supplier.off(eventObj.eventName, eventObj.execute);
                eventObj.supplier = null;
                if (eventObj.property !== null)
                    eventObj.eventName = null;
                eventObj.connected = false;
            }
        }
    }

    get(name: string, property?: string): LayoutActionResource {
        let actionResource = this._resources[name];
        if (actionResource === undefined) {
            let supplier = this._manager.getObject(name);
            actionResource = new LayoutActionResource(supplier);
            this._resources[name] = actionResource;
        }

        if (property !== undefined)
            return actionResource.get(property);

        return actionResource;
    }

    set(name: string, property: string, value) {
        let obj = this.get(name);
        obj.set(property, value);
    }

    setValue(name: string, value) {
        this.set(name, "value", value);
    }

    getValue(name: string) {
        return this.get(name, "value");
    }

}

export default LayoutAction;
