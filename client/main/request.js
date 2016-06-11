
'use strict';

var Request = function(data) {

    this.data = data;

    var self = this;
    this._p = new Promise(function(resolve, reject) {
        self.resolve = resolve;
        self.reject = reject;
    });
    this.then = function(then, catc) {
        self._p.then(then, catc);
    };
};

Request.prototype.waitOn = function(promise) {
    promise.then(this.resolve, this.reject);
};

module.exports = Request;
