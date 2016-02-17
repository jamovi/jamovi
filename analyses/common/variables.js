
"use strict";

var Opt = require('./option');

function Variables() {
    this.type = 'Variables';
}

Variables.prototype = new Opt();
Variables.prototype.constructor = Variables;

module.exports = Variables;
