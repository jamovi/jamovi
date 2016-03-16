
/* jshint evil: true, strict: true */

'use strict';

var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var Analysis = function(name, ns) {

    this.id = -1;
    this.name = name;
    this.ns = ns;
    this.options = null;

    var self = this;

    this.ready = new Promise(function(resolve, reject) {
        self._notifyReady = resolve;
        self._notifyFail  = reject;
    });
};

Analysis.prototype.setup = function(id, options) {
    this.id = id;
    this.options = options;
    this._notifyReady(this);
};

var Analyses = Backbone.Model.extend({

    initialize : function() {
        this._analyses = [ ];
    },
    defaults : {
        dataSetModel : null
    },
    createAnalysis : function(name, ns) {
        var analysis = new Analysis(name, ns);
        this._analyses.push(analysis);
        this.trigger('analysisCreated', analysis);
    }
});

module.exports = Analyses;
