
var Option = require('./option')

function Variables() {
    this.type = 'Variables'
}

Variables.prototype = new Option()
Variables.prototype.constructor = Variables

module.exports = Variables
