'use strict';

var _ = require('underscore');
var $ = require('jquery');
var LayoutActionResource = require('./layoutactionresource');

var LayoutAction = function(manager, callback) {

    this._callback = callback;
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

    this.getObject = function(name) {
        var actionResource = this._resources[name];
        if (_.isUndefined(actionResource)) {
            var supplier = this._manager.getObject(name);
            actionResource = new LayoutActionResource(this, supplier);
            this._resources[name] = actionResource;
        }
        return actionResource;
    };

};

LayoutAction.extendTo = function(target, manager, callback) {
    LayoutAction.call(target, manager, callback);
};

module.exports = LayoutAction;
