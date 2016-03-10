
'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var DataSetModel = Backbone.Model.extend({

    initialize: function() {
    },
    defaults : {
        hasDataSet : false,
        columns    : [ ],
        rowCount : 0,
        columnCount : 0
    },
    setNew : function(info) {

        this.attributes.columns  = info.columns;
        this.attributes.rowCount = info.rowCount;
        this.attributes.columnCount = info.columnCount;

        this.set('hasDataSet', true);
        this.trigger('dataSetLoaded');
    }
});

var DataSetViewModel = DataSetModel.extend({

    initialize : function() {
    },

    defaults : function() {
        return _.extend({
            cells      : [ ],
            viewport   : { left : 0, top : 0, right : -1, bottom : -1}
        }, DataSetModel.prototype.defaults);
    }
});

module.exports = { DataSetModel : DataSetModel, DataSetViewModel : DataSetViewModel };
