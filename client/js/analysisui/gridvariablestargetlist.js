'use strict';

var $ = require('jquery');
var _ = require('underscore');
var LayoutGrid = require('./layoutgrid').Grid;
var GridOptionControl = require('./gridoptioncontrol');

var GridVariablesTargetList = function(option, params) {
    GridOptionControl.extend(this, option, params);

    this.targetGrid = new LayoutGrid({ className: "silky-layout-grid silky-variable-target" });
    this.hasColumnHeaders = false;
    this.showHeaders = true;
    this.gainOnClick = true;

    this.setSupplier = function(supplier) {
        this._supplier = supplier;
        var self = this;
        this._supplier.supplierGrid.on('layoutgrid.gotFocus', function() {
            self.gainOnClick = false;
            self.targetGrid.clearSelection();
        });
    };

    this.renderTransferButton = function(grid, row, column) {

        this.$button = $('<button type="button" class="silky-option-variable-button"></button>');
        var self = this;
        this.$button.click(function(event) {
            self.onAddButtonClick();
        });

        grid.addCell(column, row, true, this.$button);

        return { height: 1, width: 1 };
    };

    this.onRender = function(grid, row, column) {

        var self = this;
        var id = this.option.getName();
        var label = this.option.getText();

        grid.addCell(column + 1, row, true, $('<div style="white-space: nowrap; ">' + label + '</div>'));
        this.renderTransferButton(grid, row + 1, column);

        //this.targetGrid = new LayoutGrid({ className: "silky-layout-grid silky-variable-target" });
        this.targetGrid._animateCells = true;
        this.targetGrid.allocateSpaceForScrollbars = false;
        this.targetGrid.setCellBorders();
        this.targetGrid.$el.css("overflow", "auto");
        this.targetGrid.setFixedHeight(100);
        this.targetGrid.setDockWidth(true);
        this.targetGrid.on('layoutgrid.lostFocus layoutgrid.gotFocus', function() {
            self.onSelectionChanged();
        });
        var cell = grid.addLayout("target", column + 1, row + 1, false, this.targetGrid);
        cell.horizontalStretchFactor = 0.5;
        cell.dockContentWidth = true;
        cell.dockContentHeight = true;

        var list = this.params.columns;
        this._columnInfo = {};

        if (Array.isArray(list)) {
            this.cellStrechFactor = 100 / list.length;
            for (var i = 0; i < list.length; i++) {
                this._columnInfo[list[i]] = { index: i };
                this.hasColumnHeaders =true;
                if (this.showHeaders) {
                    var hCell = this.targetGrid.addCell(i, 0, false,  $('<div style="white-space: nowrap;" class="silky-listview-header">' + list[i] + '</div>'));
                    hCell.horizontalStretchFactor = this.cellStrechFactor;
                    hCell.hAlign = 'centre';
                }
            }
        }

        return { height: 2, width: 2 };
    };

    this.onSelectionChanged = function() {
        this.gainOnClick = this.targetGrid.hasFocus === false;
    };

    this.renderItem = function(item, grid, row) {
         var self = this;
        _.each(item, function(value, key, list) {
            var columnInfo = self._columnInfo[key];
            if (_.isUndefined(columnInfo))
                return;
            var c = columnInfo.index;
            var cell = grid.getCell(c, row);
            if (cell === null) {
                cell = grid.addCell(c, row, false,  $('<div style="white-space: nowrap; ">' + value + '</div>'));
                cell.clickable(true);
            }
            else
                cell.setContent($('<div style="white-space: nowrap; ">' + value + '</div>'));
            cell.horizontalStretchFactor = self.cellStrechFactor;
            cell.hAlign = 'left';
        });
    };

    this.validateOption = function() {
        var list = this.option.getValue();
        if (_.isUndefined(list) || list === null)
            this.state = 'Uninitialised';
        else if (Array.isArray(list))
            this.state = 'OK';
        else
            this.state = 'Invalid';
    };

    this.onAddButtonClick = function() {
        console.log("ADD!");

        //this.option.removeItem([2]);
        //if (this.gainOnClick)
            this.option.insertValueAt( { vars: 7, werf: 8, rger: 9 }, [2] );
        //else
        //    this.option.removeItem([2]);
    };

    this.onOptionValueInserted = function(keys, data) {
        this.targetGrid.insertRow(keys[0] + (this.hasColumnHeaders ? 1 : 0), 1);
        var item = this.option.getValue(keys);
        this.renderItem(item, this.targetGrid, keys[0] + (this.hasColumnHeaders ? 1 : 0));

        var itemCount = 400;
        this.targetGrid.insertRow(keys[0] + (this.hasColumnHeaders ? 1 : 0), itemCount);
        for (var i = 0; i < itemCount; i++) {
            item = { vars: 7 + i, werf: 8 + i, rger: 9 + i };
            this.renderItem(item, this.targetGrid, keys[0] + i + (this.hasColumnHeaders ? 1 : 0));
        }

        this.targetGrid.renderNewCells();
    };

    this.onOptionValueRemoved = function(keys, data) {
        this.targetGrid.removeRow(keys[0]);
    };

    this.onOptionValueChanged = function(keys, data) {
        var list = this.option.getValue();
        if (Array.isArray(list)) {
            this.targetGrid.suspendLayout();
            for (var i = 0; i < list.length; i++) {
                this.renderItem(list[i], this.targetGrid, i + (this.hasColumnHeaders ? 1 : 0));
            }
            if (list.length > 0) {
                this.targetGrid.renderNewCells();
            }
            this.targetGrid.resumeLayout();
        }
    };
};

module.exports = GridVariablesTargetList;
