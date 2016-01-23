
var Bool = require('bool')
var Variables = require('variables')

var Model = Backbone.Model.extend({
    defaults : {
        "variables" : new Variables({
            "permitted" : "continuous|ordinal|nominal",
            "suggested" : "continuous"
        }),
        "mean" : new Bool({default : true}),
        "median" : new Bool({default : false})
    }
})

var View = Backbone.View.extend({

})

module.exports = { Model : Model, View : View }
