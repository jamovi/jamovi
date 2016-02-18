
'use strict';

var Opt = require('./option');
var _ = require('underscore');

function Bool(data) {
    this.type = 'Bool';

    this.parseValue = function(value) {
        return value == 'true';
    };

    this.toString = function() {
        return this._value.toString();
    };

    this.onInitialise(data);
}

Bool.prototype = new Opt( { default: false });
Bool.prototype.constructor = Bool;

module.exports = Bool;
