
'use strict';

var Opt = require('./option');

function Bool() {
    this.type = 'Bool';
}

Bool.prototype = new Opt();
Bool.prototype.constructor = Bool;

module.exports = Bool;
