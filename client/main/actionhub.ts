
'use strict';

import { EventMap } from '../common/eventmap';

interface IActionModel {
    enabled: boolean;
    name: string;
    description: string;
}

export class Action extends EventMap<IActionModel> {
    _direct: any;

    constructor() {
        super({
                enabled: true,
                name: '',
                description: ''
            });
    }

    do(source?) {
        if (this._direct) {
            for (let call of this._direct) {
                call(source);
            }
        }
        this.trigger('request', source);
    }

    isEnabled() {
        return this.attributes.enabled;
    }

    isDisabled() {
        return ! this.attributes.enabled;
    }

    direct(call, context) {
        if (this._direct === undefined)
            this._direct = [];
        this._direct.push(call.bind(context));
    }
    
}

class ActionHub {

    _actions: { [name: string]: Action } = { };

    constructor() {
    }

    get(actionName: string) {
        let action = this._actions[actionName];
        if (action === undefined) {
            action = new Action();
            this._actions[actionName] = action;
        }
        return action;
    }

    setDetails(actionName: string, name: string, description: string) {
        let action = this.get(actionName);
        action.attributes.name = name;
        action.attributes.description = description;
    }
}



export default new ActionHub();
