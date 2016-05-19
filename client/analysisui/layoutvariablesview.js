
'use strict';

var $ = require('jquery');
var _ = require('underscore');
var FormatDef = require('./formatdef');
var LayoutGrid = require('./layoutgrid').Grid;
var SelectableLayoutGrid = require('./selectablelayoutgrid');

var LayoutVariablesView = function(params) {
    LayoutGrid.extendTo(this);

    this._persistentItems = _.isUndefined(params.persistentItems) ? false : params.persistentItems;

    this.rowTransform = function(row, column) {
        return row;
    };

    this.columnTransform = function(row, column) {
        if ( ! this.ignoreTransform)
            return column + 1;

        return column;
    };

    this._targets = [];

    this.supplierGrid = new SelectableLayoutGrid();
    this.supplierGrid.$el.addClass("silky-layout-grid silky-variable-supplier");
    this.supplierGrid.stretchEndCells = false;
    this.supplierGrid.$el.css("overflow", "auto");
    this.supplierGrid._animateCells = true;
    this.supplierGrid.setFixedHeight(200);
    this.ignoreTransform = true;
    var cell = this.addLayout("supplier", 0, 0, false, this.supplierGrid);
    this.ignoreTransform = false;
    cell.horizontalStretchFactor = 0.5;
    cell.dockContentWidth = true;
    cell.dockContentHeight = true;
    cell.spanAllRows = true;


    this.addHeader = function(title) {
        var cell = this.addCell(0, 0, false);
    };


    this.setInfo = function(resources, style, level) {

        this.resources = resources;
        this.style = style;
        this.level = level;
        this._items = { _list:[] };

        this.populateItemList();
        this.renderItemList();
    };

    this.getItem = function(index) {
        return this._items._list[index];
    };

    this.getSelectedItem = function(index) {
        if (this.supplierGrid.selectedCellCount() > index)
            return this.getItem(this.supplierGrid.getSelectedCell(index).data.row);

        return null;
    };

    this.pullSelectedItem = function(index) {
        var item = this.getSelectedItem(index);
        if (item !== null)
            item.used += 1;
        return item;
    };

    this.pushItem = function(formatted) {
        for (var i = 0; i < this._items._list.length; i++) {
            var item = this._items._list[i];
            if (item.value.equalTo(formatted)) {
                item.used -= 1;
                break;
            }
        }
    };

    this.addTarget = function(target) {
        this._targets.push(target);
        var self = this;
        target.targetGrid.on('layoutgrid.gotFocus', function() {
            self.supplier.clearSelection();
        });
    };


    this.populateItemList = function() {
        var columns = this.resources.columns;
        for (var i = 0; i < columns.length; i++) {
            var column = columns[i];
            var item = { value: new FormatDef.constructor(column.name, FormatDef.variable), used: 0, properties: { type: column.measureType } };
            this._items._list.push(item);
            this._items[column.name] = item;
        }
    };

    this.renderItemList = function() {
        for (var i = 0; i < this._items._list.length; i++) {
            var item = this._items._list[i];
            this['render_' + item.value.format.name](item, i);
        }
    };

    this.render_variable = function(item, row) {
        var c1 = this.supplierGrid.addCell(0, row, false, $('<div class="silky-variable silky-variable-type-' + item.properties.type + '">' + item.value.toString() + '</div>'));
        c1.horizontalStretchFactor = 1;
        c1.dockContentWidth = true;
        c1.clickable(true);
    };

    this.filterSuppliersList = function() {
        if (this._persistentItems === false) {
            this.supplierGrid.suspendLayout();
            for (var i = 0; i < this._items._list.length; i++) {
                var item = this._items._list[i];
                var rowCells = this.supplierGrid.getRow(i);
                for (var j = 0; j < rowCells.length; j++) {
                    var cell = rowCells[j];
                    this.supplierGrid.setCellVisibility(cell, item.used === 0);
                }
            }
            this.supplierGrid.resumeLayout();
        }
    };

};

module.exports = LayoutVariablesView;
