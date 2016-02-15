
var Option = require('./option')

function Int(data) {
    this.type = 'Int'

    this.parseValue = function(value) {
        return parseInt(value);
    };

    this.toString = function() {
        return this._value.toString();
    };

    this.onInitialise(data);

    this.inputPattern = "[0-9]*";
}

Int.prototype = new Option({ default: 0 })
Int.prototype.constructor = Int

module.exports = Int
