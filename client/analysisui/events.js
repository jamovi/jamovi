
'use strict';

var SuperClass = require('../common/superclass');

function Events() {

    this._eventHandlers = { };

    this.addEventListener = function(name, callback) {
        let handlers = this._eventHandlers[name];
        if (handlers === undefined) {
            handlers = [];
            this._eventHandlers[name] = handlers;
        }

        handlers.push(callback);
    };

    this.removeEventListener = function(name, callback) {
        let handlers = this._eventHandlers[name];
        if (handlers !== undefined) {
            if (callback !== undefined) {
                for (let i = 0; i < handlers.length; i++) {
                    if (handlers[i] === callback)
                        handlers.splice(i, 1);
                }
                if (handlers.length === 0)
                    delete this._eventHandlers[name];
            }
            else
                delete this._eventHandlers[name];
        }
    };

    this._fireEvent = function(name, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
        let handlers = this._eventHandlers[name];
        if (handlers) {
            for (let i = 0; i < handlers.length; i++) {
                handlers[i](arg1, arg2, arg3, arg4, arg5, arg6, arg7);
            }
        }
    };
}

SuperClass.create(Events);

module.exports = Events;
