
'use strict';

const Backbone = require('backbone');

const Request = function(data) {

    this.data = data;
    
    this._p = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
};

Request.prototype.then = function(then, catc) {
    this._p.then(then, catc);
};

Request.prototype.waitOn = function(promise) {
    promise.then(v => this.resolve(v), e => this.reject(e));
};

module.exports = Request;
