'use strict';

export class Event {
    _set = true;
    _resolve: () => void;
    _prom: Promise<void>;

    constructor() {
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

