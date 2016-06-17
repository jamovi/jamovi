'use strict';

var _ = require('underscore');
var $ = require('jquery');
var LayoutActionResource = require('./layoutactionresource');

var LayoutAction = function(manager, callback) {

    this._callback = callback.execute;

    if (Array.isArray(callback.onChange))
        this._registeredListeners = callback.onChange;
    else
        this._registeredListeners = [ callback.onChange ];

    this._manager = manager;
    this.data = { };

    this._resources = { };

    this.execute = function(context) {
        _.each(this._resources, function(value, key, list) {
            value._beginAction();
        });

        this._callback.call(context, this);

        _.each(this._resources, function(value, key, list) {
            value._endAction();
        });
    };

    this.close = function() {
        _.each(this._resources, function(value, key, list) {
            value.close();
        });
    };

    this.get = function(name, property) {
        var actionResource = this._resources[name];
        if (_.isUndefined(actionResource)) {
            var supplier = this._manager.getObject(name);
            actionResource = new LayoutActionResource(this, name, supplier);
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

    this.isListenerRegistered = function(name, property) {

        var found = false;

        if (property === "value")
            found = this._registeredListeners.includes(name);

        if (found === false)
            found = this._registeredListeners.includes(name + "." + property);

        return found;
    };
};

LayoutAction.extendTo = function(target, manager, callback) {
    LayoutAction.call(target, manager, callback);
};

module.exports = LayoutAction;
