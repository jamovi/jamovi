
'use strict';

class CancelledError extends Error { }

class JError extends Error {
    constructor(message, opts={}) {
        super(message);
        this.cause = opts.cause;
        this.messageSrc = opts.messageSrc;
        this.status = opts.status || 'error';
    }
}

module.exports = {
    JError,
    CancelledError,
};
