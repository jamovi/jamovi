
import LayoutAction from './layoutaction';

export class LayoutActionManager {
    constructor(view) {

        this._view = view;
        this._actions = [];
        this._directActions = { };
        this._resources = { };
        this._executingActions = 0;
        this._initializingData = 0;
        this._initialised = false;

        this._bindingActions = {};
        if (Array.isArray(this._view.events)) {
            for (let i = 0; i < this._view.events.length; i++) {
                let action = this._view.events[i];
                if ((typeof action.execute === 'function') === false)
                    throw "An action must contain an execute function.";

                if (action.onChange === undefined && action.onEvent === undefined)
                    throw "An action must contain an onChange or onEvent property.";

                this.addAction(action);
            }
        }
    }

    beginInitializingData() {
        this._initializingData += 1;
    }

    endInitializingData() {
        if (this._initializingData === 0)
            return;

        this._initializingData -= 1;

        //Refreshes the final values of the data bindings after the data has been updated (initialised).
        //This is because action events are suspended during data initializati0n. They are suspended because
        //action events are linked to *.event.js files where an 'update' event is provided after initialisation
        //so that the ui can be updated with post initialising data. We don't want any 'onChange' events firing
        //as data is being initialised. As a by-product, binding actions (which are yaml descriptions) don't have
        // access to this 'update' event therefore can't refresh.
        //Hence the executeBindingActions function is called when data initialising has ended to update their post initializing state.
        if (this._initializingData === 0)
            this.executeBindingActions();
    }

    initializingData() {
        return this._initializingData !== 0;
    }

    _executeStarted(action) {
        this._executingActions += 1;
        if (this._executingActions === 1) {
            this.onExecutingStateChanged(true);
        }
    }

    _executeEnded(action) {
        this._executingActions -= 1;
        if (this._executingActions === 0) {
            this.onExecutingStateChanged(false);
        }
    }

    onExecutingStateChanged?(state: boolean): void;

    bindActionParams(target, targetProperty, bindData) {
        return {
            onChange: bindData.sourceNames,
            execute: (ui) => {
                let value = bindData.bindFunction(ui);
                if (bindData.inverted)
                    value = !value;
                target.setPropertyValue(targetProperty, value);
            }
        };
    }

    _resolveBindCode(syntax, startIndex) {
        let start = startIndex+1;
        let open = 1;
        let end = -1;
        let code = 'return false;';
        for (let i = start; i < syntax.length - 1; i++) {
            if (syntax[i] === '{')
                open += 1;
            else if (syntax[i] === '}')
                open -= 1;

            if (open === 0) {
                end = i;
                break;
            }
        }

        let sourceNames = [];
        if (end !== -1) {
            code = syntax.substring(start, end);
            sourceNames = Array.from(new Set([...code.matchAll(/ui\['(.*?)'\]/g)].map(m => m[1])));  // finds all options used by snippet
        }
        else
            console.log("WARNING: Code binding close } is missing.");

        return {
            bindFunction: new Function('ui', code),
            startIndex: startIndex,
            inverted: false,
            endIndex: end === -1 ? syntax.length - 1 : end,
            sourceNames: sourceNames
        };
    }

    _resolveBindPart(syntax, startIndex) {

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

        let failed = false;
        if (this._resources[sourceName] === undefined) {
            failed = true;
            console.log("WARNING: Cannot bind to '" + sourceName + "'. It does not exist.");
        }

        let sourceNames = [];
        if ( ! failed) {
            sourceNames = [sourceName];
            if (compareValue !== null && compareValue.bindFunction !== undefined)
                sourceNames = this._arrayUnique(sourceNames.concat(compareValue.sourceNames));
        }

        return {
            bindFunction: (ui) => {
                let value = null;
                if (failed === false)
                    value = ui[sourceName].value();

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
    }

    _arrayUnique(array) {
        let a = array.concat();
        for(let i=0; i< a.length; ++i) {
            for(let j=i+1; j< a.length; ++j) {
                if(a[i] === a[j])
                    a.splice(j--, 1);
            }
        }

        return a;
    }

    _nextNonWhiteChar(syntax, index) {
        for (let i = index; i < syntax.length; i++) {
            if (/\s/.test(syntax[i]) === false)
                return i;
        }
        return -1;
    }

    _resolveBinding(syntax, startIndex) {

        let parts = [];

        let inverted = syntax[startIndex] === '!';

        let beginOffset = this._nextNonWhiteChar(syntax, startIndex + 1) - startIndex;
        if (inverted)
            beginOffset += 1;

        let partData = null;
        let endIndex = startIndex;
        let failed = false;
        for (let i = startIndex + beginOffset; i < syntax.length; i++) {

            i = this._nextNonWhiteChar(syntax, i);

            if (syntax[i] === ')' || syntax[i] === '}' || i >= syntax.length - 1 || i === -1) {
                endIndex = i === -1 ? syntax.length - 1 : i;
                break;
            }

            if (syntax[i] === '(' || (syntax[i] === '!' && syntax[this._nextNonWhiteChar(syntax, i + 1)] === '('))
                partData = this._resolveBinding(syntax, i);
            else if (syntax[i] === '{')
                partData = this._resolveBindCode(syntax, i);
            else
                partData = this._resolveBindPart(syntax, i);

            parts.push(partData);
            i = this._nextNonWhiteChar(syntax, partData.endIndex + 1);

            if (syntax[i] === ')' || i >= syntax.length - 1 || i === -1) {
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
                else {
                    failed = true;
                    console.log('WARNING: Unknown logic operator in binding syntax: "' + syntax + '"');
                    break;
                }

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
            if (failed)
                return false;

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
    }

    bindingsToActions() {
        for (let resourceId in this._resources) {
            let res = this._resources[resourceId];
            if (res.properties !== undefined) {
                for (let property in res.properties) {
                    let prop = res.properties[property];
                    if (prop.binding !== undefined) {
                        let resolvedBindData = this._resolveBinding(prop.binding.trim(), 0);
                        let params = this.bindActionParams(res, property, resolvedBindData);
                        this.addDirectAction(resourceId, params, true);
                        params.execute(this._resources);
                    }
                }
            }
        }
    }

    executeBindingActions() {
        for (let resourceId in this._bindingActions) {
            let list = this._bindingActions[resourceId];
            for (let i = 0; i < list.length; i++) {
                let action = list[i];
                action.execute(this._resources);
            }
        }
    }

    addAction(params) {
        let action = new LayoutAction(this, params);
        this._actions.push(action);
        if (this._initialised)
            action.initialize();
    }

    addDirectAction(resourceId, params, isBinding) {
        if (this._directActions[resourceId] === undefined)
            this._directActions[resourceId] = [];

        let action = new LayoutAction(this, params);
        this._directActions[resourceId].push(action);

        if (isBinding) {
            if (this._bindingActions[resourceId] === undefined)
                this._bindingActions[resourceId] = [];
            this._bindingActions[resourceId].push(action);
        }

        if (this._initialised)
            action.initialize();
    }

    removeDirectActions(resourceId) {
        let actions = this._directActions[resourceId];
        if (actions === undefined)
            return;

        for (let i = 0; i < actions.length; i++) {
            let action = actions[i];
            action.close();
        }

        delete this._directActions[resourceId];
        if (this._bindingActions[resourceId] !== undefined)
            delete this._bindingActions[resourceId];
    }

    addResource(name, resource) {
        let resId = null;
        if (name === null && resource.hasProperty && resource.hasProperty('controlID'))
            resId = resource.getPropertyValue('controlID');

        if (name === null && resId === null)
            throw 'If a resource does not have an id, it then requires a name.';

        let useId = name === null ? '{' + resId + '}' : name;

        if (this._resources[useId] !== undefined)
            throw "The following resource id is already in use: " + useId;

        let events = null;
        if (resource.hasProperty && resource.hasProperty('events'))
            events = resource.getPropertyValue('events');
        else if (resource.events !== undefined)
            events = resource.events;
        
        let hasBinding = false;
        if (resource.properties !== undefined) {
            for (let property in resource.properties) {
                let prop = resource.properties[property];
                if (prop.binding !== undefined) {
                    hasBinding = true;
                    break;
                }
            }
        }

        if (events !== null || name !== null || hasBinding)
            this._resources[useId] = resource;
        else
            useId = null;

        let hasNewActions = false;

        if (events !== null && Array.isArray(events)) {
            for (let i = 0; i < events.length; i++) {
                let execute = events[i].execute;
                let params = JSON.parse(JSON.stringify(events[i]));
                params.execute = execute;

                if ((typeof params.execute === 'function') === false)
                    throw "An action must contain an execute function.";

                if (params.onChange === undefined && params.onEvent === undefined)
                        params.onChange = useId;

                if (params.onEvent !== undefined) {
                    if (typeof params.onEvent === 'string') {
                        if (params.onEvent.includes('.') === false)
                            params.onEvent = useId + '.' + params.onEvent;
                    }
                    else {
                        for (let j = 0; j < params.onEvent.length; j++) {
                            if (params.onEvent[j].includes('.') === false)
                                params.onEvent = useId + '.' + params.onEvent;
                        }
                    }
                }

                this.addDirectAction(useId, params);
            }

            hasNewActions = true;
        }

        if (this._initialised) {
            if (resource.properties !== undefined) {
                for (let property in resource.properties) {
                    let prop = resource.properties[property];
                    if (prop.binding !== undefined) {
                        let resolvedBindData = this._resolveBinding(prop.binding.trim(), 0);
                        let params = this.bindActionParams(resource, property, resolvedBindData);
                        this.addDirectAction(resId, params, true);
                        params.execute(this._resources);
                        hasNewActions = true;
                    }
                }
            }

            if (hasNewActions) {
                for (let action of this._actions)
                    action.tryConnectTo(useId, resource);

                for (let id in this._directActions) {
                    let list = this._directActions[id];
                    for (let i = 0; i < list.length; i++) {
                        let action = list[i];
                        action.tryConnectTo(useId, resource);
                    }
                }
            }
        }

        return useId;
    }

    removeResource(resourceId) {
        this.removeDirectActions(resourceId);
        delete this._resources[resourceId];

        if (this._initialised) {
            for (let action of this._actions)
                action.disconnectFrom(resourceId);

            for (let id in this._directActions) {
                let list = this._directActions[id];
                for (let i = 0; i < list.length; i++) {
                    let action = list[i];
                    action.disconnectFrom(resourceId);
                }
            }
        }
    }

    exists(resourceId) {
        return this._resources[resourceId] !== undefined;
    }

    getObject(resourceId) {
        let obj = this._resources[resourceId];
        if (obj === undefined)
            throw "UI Object '" + resourceId + "' does not exist and cannot be accessed.";

        return obj;
    }

    fireCreateEvents(panel) {
        for (let action of this._actions) {
            if (action.hasEventName('creating'))
                action.execute();
        }

        for (let resourceId in this._directActions) {
            let list = this._directActions[resourceId];
            for (let i = 0; i < list.length; i++) {
                let action = list[i];
                if (action.hasEventName('creating'))
                    action.execute();
            }
        }

        if (this._view.creating)
            this._view.creating.call(this._view.getContext(), this._resources, { sender: panel, eventName: 'creating' });
    }

    initializeAll() {
        this.bindingsToActions();

        for (let action of this._actions)
            action.initialize();

        for (let resourceId in this._directActions) {
            let list = this._directActions[resourceId];
            for (let i = 0; i < list.length; i++) {
                let action = list[i];
                action.initialize();
            }
        }

        this._initialised = true;
    }

    close() {
        for (let action of this._actions)
            action.close();

        for (let resourceId in this._directActions) {
            let list = this._directActions[resourceId];
            for (let i = 0; i < list.length; i++) {
                let action = list[i];
                action.close();
            }
        }

        this._directActions = { };

        this._resources = { };
    }
}

export default LayoutActionManager;
