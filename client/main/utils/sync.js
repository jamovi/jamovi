'use strict';

class Event {

    constructor() {
        this._set = true;
        this.clear();
    }

    set() {
        if (this._set)
            return;
        this._set = true;
        this._resolve();
    }

    clear() {
        if ( ! this._set)
            return;
        this._prom = new Promise((resolve, reject) => {
            this._resolve = resolve;
        });
        this._set = false;
    }

    wait() {
        return this._prom;
    }
}

module.exports = { Event };
