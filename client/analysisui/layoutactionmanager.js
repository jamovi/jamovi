'use strict';

const _ = require('underscore');
const backbone = require('backbone');
const LayoutAction = require('./layoutaction');
const SuperClass = require('../common/superclass');

const LayoutActionManager = function(view) {

    this._view = view;
    this._actions = [];
    this._directActions = { };
    this._resources = { };
    this._executingActions = 0;
    this._initializingData = 0;
    this._initialised = false;

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

    this.bindActionParams = function(sourceName, target, targetProperty, isCompare, compareValue) {
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
                        let params = this.bindActionParams(sourceName, res, property, isCompare, parts[1]);
                        this.addDirectAction(name, params);
                        params.execute(this._resources);
                    }
                }
            }
        }
    };

    this.addAction = function(params) {
        let action = new LayoutAction(this, params);
        this._actions.push(action);
        if (this._initialised)
            action.initialize();
    };

    this.addDirectAction = function(name, params) {
        if (this._directActions[name] === undefined)
            this._directActions[name] = [];

        let action = new LayoutAction(this, params);
        this._directActions[name].push(action);
        if (this._initialised)
            action.initialize();
    };

    this.removeDirectActions = function(name) {
        let actions = this._directActions[name];
        if (actions === undefined)
            return;

        for (let i = 0; i < actions.length; i++) {
            let action = actions[i];
            action.close();
        }

        delete this._directActions[name];
    };

    this.addResource = function(name, resource) {
        this._resources[name] = resource;

        let events = null;
        if (resource.hasProperty && resource.hasProperty('events'))
            events = resource.getPropertyValue('events');
        else if (resource.events !== undefined)
            events = resource.events;

        if (events !== null) {
            if (Array.isArray(events)) {
                for (let i = 0; i < events.length; i++) {
                    let execute = events[i].execute;
                    let params = JSON.parse(JSON.stringify(events[i]));
                    params.execute = execute;

                    if (_.isFunction(params.execute) === false)
                        throw "An action must contain an execute function.";

                    if (params.onChange === undefined && params.onEvent === undefined)
                        params.onChange = name;

                    if (params.onEvent !== undefined) {
                        if (typeof params.onEvent === 'string') {
                            if (params.onEvent.includes('.') === false)
                                params.onEvent = name + '.' + params.onEvent;
                        }
                        else {
                            for (let j = 0; j < params.onEvent.length; j++) {
                                if (params.onEvent[j].includes('.') === false)
                                    params.onEvent = name + '.' + params.onEvent;
                            }
                        }
                    }

                    this.addDirectAction(name, params);
                }
            }
        }

        if (this._initialised) {
            for (let i = 0; i < this._actions.length; i++) {
                let action = this._actions[i];
                action.tryConnectTo(name, resource);
            }

            for (let name in this._directActions) {
                let list = this._directActions[name];
                for (let i = 0; i < list.length; i++) {
                    let action = list[i];
                    action.tryConnectTo(name, resource);
                }
            }
        }
    };

    this.removeResource = function(name) {
        let resource = this._resources[name];
        this.removeDirectActions(name);
        delete this._resources[name];

        if (this._initialised) {
            for (let i = 0; i < this._actions.length; i++) {
                let action = this._actions[i];
                action.disconnectFrom(name);
            }

            for (let name in this._directActions) {
                let list = this._directActions[name];
                for (let i = 0; i < list.length; i++) {
                    let action = list[i];
                    action.disconnectFrom(name);
                }
            }
        }
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

        for (let name in this._directActions) {
            let list = this._directActions[name];
            for (let i = 0; i < list.length; i++) {
                let action = list[i];
                action.initialize();
            }
        }

        this._initialised = true;
    };

    this.close = function() {
        for (let i = 0; i < this._actions.length; i++) {
            let action = this._actions[i];
            action.close();
        }

        for (let name in this._directActions) {
            let list = this._directActions[name];
            for (let i = 0; i < list.length; i++) {
                let action = list[i];
                action.close();
            }
        }

        this._directActions = { };

        this._resources = { };
    };


    if (Array.isArray(this._view.events)) {
        for (let i = 0; i < this._view.events.length; i++) {
            let action = this._view.events[i];
            if (_.isFunction(action.execute) === false)
                throw "An action must contain an execute function.";

            if (action.onChange === undefined && action.onEvent === undefined)
                throw "An action must contain an onChange or onEvent property.";

            this.addAction(action);
        }
    }


};

SuperClass.create(LayoutActionManager);

module.exports = LayoutActionManager;
