
var Option = require('./option')
var _ = require('underscore')

function Bool(data) {
    this.type = 'Bool';

    this.parseValue = function(value) {
        return parseBoolean(value);
    };

    this.toString = function() {
        return this._value.toString();
    };

    this.onInitialise(data);
}

Bool.prototype = new Option( { default: false })
Bool.prototype.constructor = Bool

module.exports = Bool
