
'use strict';

var $ = require('jquery');
var _ = require('underscore');

var GridControl = require('./gridcontrol');
var ControlBase = require('./controlbase');
var LayoutGrid = require('./layoutgrid').Grid;

var LayoutCollapseView = function(params) {

    ControlBase.extendTo(this, params);
    GridControl.extend(this);

    this.registerSimpleProperty("collapsed", false);
    this.registerSimpleProperty("label", null);

    this._collapsed = this.getPropertyValue('collapsed');
    this.level = this.getPropertyValue('level');

    this._body = null;

    this.onRenderToGrid = function(grid, row, column) {
        this._layout = new LayoutGrid();
        var cell = grid.addLayout(column, row, false, this._layout);
        cell.setStretchFactor(1);

        var groupText = this.getPropertyValue('label');
        var t = '<div class="silky-options-collapse-icon" style="display: inline;"> <span class="silky-dropdown-toggle"></span></div>';
        this.$header = $('<div class="silky-options-group-header silky-options-collapse-group-header style="white-space: nowrap;">' + t + groupText + '</div>');

        if (this._collapsed)
            this.$header.addClass("silky-gridlayout-collapsed");

        this.$header.addClass("silky-options-collapse-group silky-options-group-style-" + this.style);

        cell = this._layout.addCell(0, 0, false, this.$header);
        cell.setStretchFactor(1);

        this.$header.on('click', null, this, function(event) {
            var group = event.data;
            group.toggleColapsedState();
        });

        return { height: 1, width: 1 };
    };

    this.setBody = function(body) {
        this._body = body;
        this._bodyCell = this._layout.addLayout(0, 1, false, body);
        this._bodyCell.setStretchFactor(1);
        this.setContentVisibility(this._collapsed === false);
    };

    this.collapse = function() {

        if (this._collapsed)
            return;

        this.$header.addClass("silky-gridlayout-collapsed");

        this.setContentVisibility(false);
        this._bodyCell._parentLayout.invalidateLayout('both', Math.random());
        this._collapsed = true;
    };

    this.setContentVisibility = function(visible) {
        this._bodyCell.setVisibility(visible);
        /*for (var i = 0; i < this._body._cells.length; i++) {
            var cell = this._body._cells[i];
            if (this.headerCell._id !== cell._id)
                cell.setVisibility(visible);
        }*/
    };

    this.expand = function() {

        if ( ! this._collapsed)
            return;

        this.$header.removeClass("silky-gridlayout-collapsed");

        this.setContentVisibility(true);
        this._bodyCell._parentLayout.invalidateLayout('both', Math.random(), true);
        this._collapsed = false;

    };

    this.toggleColapsedState = function() {
        if (this._collapsed)
            this.expand();
        else
            this.collapse();
    };
};

module.exports = LayoutCollapseView;
