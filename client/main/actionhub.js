
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Action = Backbone.Model.extend({
    defaults: {
        enabled: true,
        name: '',
        description: '',
    },
    do(source) {
        if (this._direct) {
            for (let call of this._direct) {
                call(source);
            }
        }
        this.trigger('request', source);
    },
    isEnabled() {
        return this.attributes.enabled;
    },
    isDisabled() {
        return ! this.attributes.enabled;
    },
    direct(call, context) {
        if (this._direct === undefined)
            this._direct = [];
        this._direct.push(call.bind(context));
    },
    
});

class ActionHub {

    constructor() {
        this._actions = { };
    }

    get(actionName) {
        let action = this._actions[actionName];
        if (action === undefined) {
            action = new Action();
            this._actions[actionName] = action;
        }
        return action;
    }

    setDetails(actionName, name, description) {
        let action = get(actionName);
        action.attributes.name = name;
        action.attributes.description = description;
    }
}



module.exports = new ActionHub();
