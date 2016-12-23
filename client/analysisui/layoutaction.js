'use strict';

var _ = require('underscore');
var $ = require('jquery');
var LayoutActionResource = require('./layoutactionresource');
var SuperClass = require('../common/superclass');

var LayoutAction = function(manager, params) {

    this._callback = params.execute;

    this._manager = manager;
    this.data = { };

    this._resources = { };
    this._listeners = [];
    this._propertyListeners = [];

    var self = this;
    this.execute = function(param1, param2, param3, param4, param5, param6, param7) {
        if (self._manager.initialisingData())
            return;

        self._manager._executeStarted(self);
        self._callback.call(self._manager._view, self._manager._resources, param1, param2, param3, param4, param5, param6, param7);
        self._manager._executeEnded(self);
    };

    this._connectToListeners = function(eventListeners, propertyListeners) {
        var i = 0;
        var q = null;
        var name = null;
        var eventObj = null;
        if (_.isUndefined(propertyListeners) === false) {
            for (i = 0; i < propertyListeners.length; i++) {
                q = propertyListeners[i].split(".");
                if (q.length > 2 || q.length <= 0)
                    continue;

                name = q[0];
                var property = "value";
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

        if (_.isUndefined(eventListeners) === false) {
            for (i = 0; i < eventListeners.length; i++) {
                q = eventListeners[i].split(".");
                if (q.length !== 2)
                    continue;

                name = q[0];
                var eventName = q[1];

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

    this.initialise = function() {
        for (var i = 0; i < this._listeners.length; i++) {
            var eventObj = this._listeners[i];
            if (eventObj.connected === false) {
                var supplier = this._manager.getObject(eventObj.name);
                if (eventObj.eventName === null)
                    eventObj.eventName = supplier.getTrigger(eventObj.property);
                eventObj.supplier = supplier;
                eventObj.connected = true;
                eventObj.supplier.on(eventObj.eventName, this.execute);
            }
        }
    };

    this.close = function() {
        for (var i = 0; i < this._listeners.length; i++) {
            var eventObj = this._listeners[i];
            if (eventObj.connected) {
                eventObj.supplier.off(eventObj.eventName, this.execute);
                eventObj.connected = false;
            }
        }
    };

    this.get = function(name, property) {
        var actionResource = this._resources[name];
        if (_.isUndefined(actionResource)) {
            var supplier = this._manager.getObject(name);
            actionResource = new LayoutActionResource(supplier);
            this._resources[name] = actionResource;
        }

        if (_.isUndefined(property) === false)
            return actionResource.get(property);

        return actionResource;
    };

    this.set = function(name, property, value) {
        var obj = this.get(name);
        obj.set(property, value);
    };

    this.setValue = function(name, value) {
        this.set(name, "value", value);
    };

    this.getValue = function(name) {
        return this.get(name, "value");
    };

    var eventListeners = params.onEvent;
    if (_.isUndefined(params.onEvent) === false && Array.isArray(eventListeners) === false)
        eventListeners = [ eventListeners ];

    var propertyListeners = params.onChange;
    if (_.isUndefined(params.onChange) === false &&  Array.isArray(propertyListeners) === false)
        propertyListeners = [ propertyListeners ];

    this._connectToListeners(eventListeners, propertyListeners);

};

SuperClass.create(LayoutAction);

module.exports = LayoutAction;
