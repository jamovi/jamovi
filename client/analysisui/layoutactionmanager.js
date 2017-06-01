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

    this.bindActionParams = function(target, targetProperty, bindData) {
        return {
            onChange: bindData.sourceNames,
            execute: (ui) => {
                let value = bindData.bindFunction(ui);
                if (bindData.inverted)
                    value = !value;
                target.setPropertyValue(targetProperty, value);
            }
        };
    };

    //enable: (!((fred:(tom)||fred:pop||!tony:touch)&&steve:cat))

    this._resolveBindPart = function(syntax, startIndex) {

        let sourceName = null;
        let compareValue = null;
        let stage = "option";
        let valueStart = -1;


        let inverted = syntax[startIndex] === '!';
        let beginOffset = 0;
        if (inverted)
            beginOffset = this._nextNonWhiteChar(syntax, startIndex + 1) - startIndex;

        let optionNameStart = startIndex + beginOffset;
        let endIndex = optionNameStart;

        for (let i = optionNameStart; i < syntax.length; i++) {
            if (stage === "option") {
                if ((syntax[i] === "|" && syntax[i + 1] === "|") ||
                    (syntax[i] === "&" && syntax[i + 1] === "&") ||
                     syntax[i] === ")") {

                    sourceName = syntax.substring(optionNameStart, i).trim();
                    endIndex = i - 1;
                    break;
                }
                else if (syntax[i] === ':') {

                    sourceName = syntax.substring(optionNameStart, i).trim();
                    valueStart = i + 1;
                    stage = "value";
                }
            }
            else if (stage === "value") {
                if ((syntax[i] === "|" && syntax[i + 1] === "|") ||
                    (syntax[i] === "&" && syntax[i + 1] === "&") ||
                     syntax[i] === ")") {

                    compareValue = syntax.substring(valueStart, i).trim();
                    endIndex = i - 1;
                    break;
                }
                else if ((syntax[i] === "!" && syntax[this._nextNonWhiteChar(syntax, i + 1)] === "(") ||
                          syntax[i] === "(") {

                    compareValue = this._resolveBinding(syntax, i);
                    endIndex = compareValue.endIndex;
                    break;
                }
            }
        }

        if (this._resources[sourceName] === undefined)
            throw "Cannot bind to '" + sourceName + "'. It does not exist.";

        let sourceNames = [sourceName];
        if (compareValue !== null && compareValue.bindFunction !== undefined)
            sourceNames = this._arrayUnique(sourceNames.concat(compareValue.sourceNames));

        return {
            bindFunction: (ui) => {
                let value = ui[sourceName].value();
                if (compareValue !== null) {
                    let cValue = compareValue;
                    if (compareValue.bindFunction !== undefined) {
                        cValue = compareValue.bindFunction(ui);
                    }
                    value = value == cValue;
                }

                return value;
            },
            startIndex: startIndex,
            inverted: inverted,
            endIndex: endIndex,
            sourceNames: sourceNames
        };
    };

    this._arrayUnique = function(array) {
        let a = array.concat();
        for(let i=0; i< a.length; ++i) {
            for(let j=i+1; j< a.length; ++j) {
                if(a[i] === a[j])
                    a.splice(j--, 1);
            }
        }

        return a;
    };

    this._nextNonWhiteChar = function(syntax, index) {
        for (let i = index; i < syntax.length; i++) {
            if (/\s/.test(syntax[i]) === false)
                return i;
        }
        return -1;
    };

    this._resolveBinding = function(syntax, startIndex) {

        let parts = [];

        let inverted = syntax[startIndex] === '!';

        let beginOffset = this._nextNonWhiteChar(syntax, startIndex + 1) - startIndex;
        if (inverted)
            beginOffset += 1;

        let partData = null;
        let endIndex = startIndex;
        for (let i = startIndex + beginOffset; i < syntax.length; i++) {

            i = this._nextNonWhiteChar(syntax, i);

            if (syntax[i] === ')' || i >= syntax.length - 1 || i === -1) {
                endIndex = i;
                break;
            }

            if (syntax[i] === '(' || (syntax[i] === '!' && syntax[this._nextNonWhiteChar(syntax, i + 1)] === '('))
                partData = this._resolveBinding(syntax, i);
            else
                partData = this._resolveBindPart(syntax, i);

            parts.push(partData);
            i = this._nextNonWhiteChar(syntax, partData.endIndex + 1);

            if (syntax[i] === ')' || i >= syntax.length - 1) {
                endIndex = i;
                break;
            }

            if ((syntax[i] === '|' && syntax[i + 1] === '|') || (syntax[i] === '&' && syntax[i + 1] === '&')) {
                let logic = null;
                let operatorLength = 0;
                if (syntax[i] === '|') {
                    logic = 'or';
                    operatorLength = 2;
                }
                else if (syntax[i] === '&') {
                    logic = 'and';
                    operatorLength = 2;
                }
                else
                    throw 'Unknown logic operator in binding syntax: "' + syntax + '"';

                partData.logic = logic;
                i += operatorLength - 1;
            }
        }

        let sourceNames = [];
        for (let i = 0; i < parts.length; i++) {
            if (parts[i].sourceNames.length > 0)
                sourceNames = this._arrayUnique(sourceNames.concat(parts[i].sourceNames));
        }

        let logicFunction = (ui) => {
            let prevLogic = null;
            let value = false;
            for (let i = 0; i < parts.length; i++) {
                if (parts[i].bindFunction) {
                    let newValue = parts[i].bindFunction(ui);
                    if (parts[i].inverted)
                        newValue = !newValue;

                    if (prevLogic === null)
                        value = newValue;
                    else if (prevLogic === 'and')
                        value = value && newValue;
                    else if (prevLogic === 'or')
                        value = value || newValue;
                }
                prevLogic = parts[i].logic;
            }
            return value;
        };

        return { startIndex: startIndex, endIndex: endIndex, bindFunction: logicFunction, sourceNames: sourceNames, inverted: inverted };
    };

    this.bindingsToActions = function() {
        for (let name in this._resources) {
            let res = this._resources[name];
            if (res.properties !== undefined) {
                for (let property in res.properties) {
                    let prop = res.properties[property];
                    if (prop.binding !== undefined) {
                        let resolvedBindData = this._resolveBinding(prop.binding.trim(), 0);
                        let params = this.bindActionParams(res, property, resolvedBindData);
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
