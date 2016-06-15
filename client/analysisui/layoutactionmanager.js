'use strict';

var _ = require('underscore');
var $ = require('jquery');
var LayoutAction = require('./layoutaction');

var LayoutActionManager = function(layoutDef) {

    this._layoutDef = layoutDef;
    this._actions = [];
    this._resources = { };

    this.addAction = function(callback) {
        this._actions.push(new LayoutAction(this, callback));
    };

    this.addResource = function(name, resource) {
        this._resources[name] = resource;
    };

    this.exists = function(name) {
        return _.isUndefined(this._resources[name]) === false;
    };

    this.getObject = function(name) {
        var obj = this._resources[name];
        if (_.isUndefined(obj))
            throw "UI Object '" + name + "' does not exist and cannot be accessed.";

        return obj;
    };

    this.initialiseAll = function() {
        for (var i = 0; i < this._actions.length; i++) {
            var action = this._actions[i];
            action.execute(this._layoutDef);
        }
    };

    this.close = function() {
        for (var i = 0; i < this._actions.length; i++) {
            var action = this._actions[i];
            action.close();
        }
        this._resources = { };
    };

    var self = this;
    _.each(this._layoutDef.actions, function(value, key, list) {
        if (_.isFunction(value) === false)
            throw "An action must be a function.";

        self.addAction(value);
    });


};

LayoutActionManager.extendTo = function(target, actions) {
    LayoutActionManager.call(target, actions);
};

module.exports = LayoutActionManager;
