
'use strict';

export class CancelledError extends Error { }

export class JError extends Error {
    constructor(message, opts={}) {
        super(message);
        this.cause = opts.cause;
        this.messageSrc = opts.messageSrc;
        this.status = opts.status || 'error';
    }
}

export default {
    JError,
    CancelledError,
};
