'use strict';

const _ = require('underscore');
const backbone = require('backbone');
const LayoutAction = require('./layoutaction');
const SuperClass = require('../common/superclass');

const LayoutActionManager = function(view) {

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

    this.bindAction = function(sourceName, target, targetProperty, isCompare, compareValue) {
        return {
            onChange: sourceName,
            execute: (ui) => {
                let value = ui[sourceName].value();
                if (isCompare)
                    value = value === compareValue;
                target.setPropertyValue(targetProperty, value);
            }
        };
    };

    this.bindingsToActions = function() {
        for (let name in this._resources) {
            let res = this._resources[name];
            if (res.properties !== undefined) {
                for (let property in res.properties) {
                    let prop = res.properties[property];
                    if (prop.binding !== undefined) {
                        let bind = prop.binding.substring(1, prop.binding.length - 1);
                        let parts = bind.split(":");
                        let sourceName = parts[0];
                        if (this._resources[sourceName] === undefined)
                            throw "Cannot bind to '" + sourceName + "'. It does not exist.";
                        let isCompare = parts.length > 1;
                        let action = this.bindAction(sourceName, res, property, isCompare, parts[1]);
                        this.addAction(action);
                        action.execute(this._resources);
                    }
                }
            }
        }
    };

    this.addAction = function(callback) {
        this._actions.push(new LayoutAction(this, callback));
    };

    this.addResource = function(name, resource) {
        this._resources[name] = resource;
    };

    this.exists = function(name) {
        return this._resources[name] !== undefined;
    };

    this.getObject = function(name) {
        let obj = this._resources[name];
        if (obj === undefined)
            throw "UI Object '" + name + "' does not exist and cannot be accessed.";

        return obj;
    };

    this.initializeAll = function() {
        this.bindingsToActions();

        for (let i = 0; i < this._actions.length; i++) {
            let action = this._actions[i];
            action.initialize();
        }
    };

    this.close = function() {
        for (let i = 0; i < this._actions.length; i++) {
            let action = this._actions[i];
            action.close();
        }
        this._resources = { };
    };


    if (Array.isArray(this._view.events)) {
        for (let i = 0; i < this._view.events.length; i++) {
            let action = this._view.events[i];
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
