
'use strict';

var $ = require('jquery');
var Backbone = require('backbone');
var LayoutGrid = require('./layoutgrid').Grid;
var LayoutGridProtoType = require('./layoutgrid').prototype;
Backbone.$ = $;

var LayoutVariablesView = LayoutGrid.extend({

    onInitialise: function() {

        this._targets = [];

        this.supplierGrid = new LayoutGrid({ className: "silky-layout-grid silky-variable-supplier" });
        this.supplierGrid.$el.css("overflow", "auto");
        //supplier.setCellBorders();
        this.supplierGrid.setFixedHeight(200);
        this.ignoreTransform = true;
        var cell = this.addLayout("supplier", 0, 0, false, this.supplierGrid);
        this.ignoreTransform = false;
        cell.horizontalStretchFactor = 0.5;
        cell.dockContentWidth = true;
        cell.dockContentHeight = true;
        cell.spanAllRows = true;
    },

    addHeader: function(title) {
        var cell = this.addCell(0, 0, false);
    },

    rowTransform: function(row, column) {
        return row;
    },

    columnTransform: function(row, column) {
        if (!this.ignoreTransform)
            return column + 1;

        return column;
    },

    setInfo: function(resources, format, level) {

        this.resources = resources;
        this.format = format;
        this.level = level;

        var columns = this.resources.columns;
        for (var i = 0; i < columns.length; i++) {
            var column = columns[i];

            var c1 = this.supplierGrid.addCell(0, i, false, $('<div class="silky-variable silky-variable-type-' + column.measureType + '">' + column.name + '</div>'));
            c1.horizontalStretchFactor = 1;
            c1.dockContentWidth = true;
            c1.clickable(true);
        }
    },

    addTarget: function(target) {
        this._targets.push(target);
        var self = this;
        target.targetGrid.on('layoutgrid.gotFocus', function() {
            self.supplier.clearSelection();
        });
    }

});

module.exports = LayoutVariablesView;
