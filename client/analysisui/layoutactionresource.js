'use strict';

var _ = require('underscore');

var LayoutActionResource = function(action, supplier) {
    this._action = action;
    this._supplier = supplier;
    this._properties = { };

    this._beginAction = function() {
        _.each(this._properties, function(value, key, list) {
            value.read = false;
            value.written = false;
            value.connectionPending = false;
        });
    };

    this._endAction = function() {
        var self = this;
        _.each(this._properties, function(value, key, list) {
            if (value.read === false && value.connected) {
                self._supplier.off(value.trigger, value.callback);
                value.connected = false;
                value.connectionPending = false;
            }
            /*else if (value.connectionPending && value.written) {
                value.connected = false;
                value.connectionPending = false;
            }*/
            else if (value.connectionPending && value.connected === false) {
                self._supplier.on(value.trigger, value.callback);
                value.connected = true;
                value.connectionPending = false;
            }
        });
    };

    this.close = function() {
        var self = this;
        _.each(this._properties, function(value, key, list) {
            if (value.connected) {
                self._supplier.off(value.trigger, value.callback);
                value.connected = false;
            }
            value.read = false;
            value.written = false;
            value.connectionPending = false;
        });
    };

    this.getBufferedItem = function(property) {
        var bufferItem = this._properties[property];
        if (_.isUndefined(bufferItem)) {
            var self = this;
            bufferItem = {
                trigger: this._supplier.getTrigger(property),
                callback: function() {
                    self._action.execute(self._action._manager._layoutDef);
                },
                read: false,
                written: false,
                connected: false,
                connectionPending: false
            };
            this._properties[property] = bufferItem;
        }
        return bufferItem;
    };

    this.peek = function(property) {
        return this.get(property, false);
    };

    this.get = function(property, listenTo) {

        if (_.isUndefined(listenTo))
            listenTo = true;

        var bufferItem =this.getBufferedItem(property);

        if (listenTo) {
            if (bufferItem.connected === false)
                bufferItem.connectionPending = true;
            bufferItem.read = true;
        }

        return this._supplier.getPropertyValue(property);
    };

    this.set = function(property, value) {
        var bufferItem =this.getBufferedItem(property);
        this._supplier.setPropertyValue(property, value);
        bufferItem.written = true;
    };
};

LayoutActionResource.extendTo = function(target, action, supplier) {
    LayoutActionResource.call(target, action, supplier);
};

module.exports = LayoutActionResource;
