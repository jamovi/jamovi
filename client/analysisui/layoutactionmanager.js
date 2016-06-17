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


    for (var i = 0; i < this._layoutDef.actions.length; i++) {
        var action = this._layoutDef.actions[i];
        if (_.isFunction(action.execute) === false)
            throw "An action must contain an execute function.";

        if (_.isUndefined(action.onChange))
            throw "An action must contain an onChange property.";

        this.addAction(action);
    }


};

LayoutActionManager.extendTo = function(target, actions) {
    LayoutActionManager.call(target, actions);
};

module.exports = LayoutActionManager;
