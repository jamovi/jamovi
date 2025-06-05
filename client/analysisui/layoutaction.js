'use strict';

const LayoutActionResource = require('./layoutactionresource');
const SuperClass = require('../common/superclass');

const LayoutAction = function(manager, params) {

    this._callback = params.execute;

    this._manager = manager;
    this.data = { };

    this._resources = { };
    this._listeners = [];
    this._propertyListeners = [];

    this.execute = (param1, param2, param3, param4, param5, param6, param7) => {
        if (this._manager.initializingData())
            return;

        this._manager._executeStarted(this);
        this._callback.call(this._manager._view.getContext(), this._manager._resources, param1, param2, param3, param4, param5, param6, param7);
        this._manager._executeEnded(this);
    };

    this._connectToListeners = function(eventListeners, propertyListeners) {
        let q = null;
        let name = null;
        let eventObj = null;
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
    };

    this.hasEventName = function(eventName) {
        for (let obj of this._listeners) {
            if (obj.eventName === eventName) {
                return true;
            }
        }
        return false;
    };

    this.initialize = function() {
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
    };

    this._createExecute = function(sender, eventName) {
        return (param1, param2, param3, param4, param5, param6, param7) => {
            if (param1 !== undefined)
                Object.assign(param1, { sender: sender, eventName: eventName });
            else
                param1 = { sender: sender, eventName: eventName };

            this.execute(param1, param2, param3, param4, param5, param6, param7);
        };
    };

    this.tryConnectTo = function(name, supplier) {
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
    };

    this.disconnectFrom = function(supplier) {
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
    };

    this.close = function() {
        for (let eventObj of this._listeners) {
            if (eventObj.connected) {
                eventObj.supplier.off(eventObj.eventName, eventObj.execute);
                eventObj.supplier = null;
                if (eventObj.property !== null)
                    eventObj.eventName = null;
                eventObj.connected = false;
            }
        }
    };

    this.get = function(name, property) {
        let actionResource = this._resources[name];
        if (actionResource === undefined) {
            let supplier = this._manager.getObject(name);
            actionResource = new LayoutActionResource(supplier);
            this._resources[name] = actionResource;
        }

        if (property !== undefined)
            return actionResource.get(property);

        return actionResource;
    };

    this.set = function(name, property, value) {
        let obj = this.get(name);
        obj.set(property, value);
    };

    this.setValue = function(name, value) {
        this.set(name, "value", value);
    };

    this.getValue = function(name) {
        return this.get(name, "value");
    };

    let eventListeners = params.onEvent;
    if (params.onEvent !== undefined && Array.isArray(eventListeners) === false)
        eventListeners = [ eventListeners ];

    let propertyListeners = params.onChange;
    if (params.onChange !== undefined && Array.isArray(propertyListeners) === false)
        propertyListeners = [ propertyListeners ];

    this._connectToListeners(eventListeners, propertyListeners);

};

SuperClass.create(LayoutAction);

module.exports = LayoutAction;
