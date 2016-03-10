'use strict';

var Promise = require('es6-promise').Promise;

function Host() {

    var self = this;

    this.ready = new Promise(function(resolve, reject){
        self.notifyHostReady = resolve;
    });
}

Host.prototype.set = function(host) {
    this.host = host;
    this.notifyHostReady();
};

module.exports = Host;
