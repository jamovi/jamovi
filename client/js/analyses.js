
var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
Backbone.$ = $
var Promise = require('es6-promise').Promise

var Analysis = function(id, name, ns) {

    this.id = id
    this.name = name
    this.ns = ns

    var self = this
    
    this.ready = new Promise(function(resolve, reject) {
        self._notifyReady = resolve
        self._notifyFail  = reject
    })  

    var url = 's/analyses/' + this.ns + '/' + this.name
    
    $.getScript(url, function(script) {
            
        var module = { exports : { } }
        eval(script)
        var Model = module.exports.Model
        self.model = new Model()
        self.View = module.exports.View
        
        self._notifyReady()
        
    }).fail(function() {
    
        self._notifyFail(err)
    })
}

var Analyses = Backbone.Model.extend({

    initialize : function() {
        this._analyses = [ ]
        this._nextId = 0
    },
    createAnalysis : function(name, ns) {
        var id = this._nextId
        var analysis = new Analysis(id, name, ns)
        this._analyses[id] = analysis
        this._nextId++
        
        this.trigger('analysisCreated', analysis)
    }
})

module.exports = Analyses
