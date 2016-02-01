
var Option = require('./option')

function Bool() {
    this.type = 'Bool'
}

Bool.prototype = new Option()
Bool.prototype.constructor = Bool

module.exports = Bool
