'use strict';

var _ = require('underscore');
var backbone = require('backbone');
var LayoutAction = require('./layoutaction');
var SuperClass = require('../common/superclass');

var LayoutActionManager = function(view) {

    this._view = view;
    this._actions = [];
    this._resources = { };
    this._executingActions = 0;
    this._initializingData = 0;

    this.beginInitializingData = function() {
        this._initializingData += 1;
    };

    this.endInitializingData = function() {
        if (this._initializingData === 0)
            return;

        this._initializingData -= 1;
    };

    this.initializingData = function() {
        return this._initializingData !== 0;
    };

    this._executeStarted = function(action) {
        this._executingActions += 1;
        if (this._executingActions === 1) {
            this.onExecutingStateChanged(true);
        }
    };

    this._executeEnded = function(action) {
        this._executingActions -= 1;
        if (this._executingActions === 0) {
            this.onExecutingStateChanged(false);
        }
    };

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

    this.initializeAll = function() {
        for (var i = 0; i < this._actions.length; i++) {
            var action = this._actions[i];
            action.initialize();
        }
    };

    this.close = function() {
        for (var i = 0; i < this._actions.length; i++) {
            var action = this._actions[i];
            action.close();
        }
        this._resources = { };
    };


    if (Array.isArray(this._view.events)) {
        for (var i = 0; i < this._view.events.length; i++) {
            var action = this._view.events[i];
            if (_.isFunction(action.execute) === false)
                throw "An action must contain an execute function.";

            if (_.isUndefined(action.onChange) && _.isUndefined(action.onEvent))
                throw "An action must contain an onChange or onEvent property.";

            this.addAction(action);
        }
    }


};

SuperClass.create(LayoutActionManager);

module.exports = LayoutActionManager;
