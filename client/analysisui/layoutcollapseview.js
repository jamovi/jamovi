
'use strict';

var $ = require('jquery');
var _ = require('underscore');

var ControlContainer = require('./controlcontainer');

var LayoutCollapseView = function(params) {

    ControlContainer.extendTo(this, params);

    this.registerSimpleProperty("collapsed", false);
    this.registerSimpleProperty("label", null);

    this._collapsed = this.getPropertyValue('collapsed');
    this.level = this.getPropertyValue('level');

    if (this._collapsed)
        this.$el.addClass("silky-gridlayout-collapsed");

    this.$el.addClass("silky-options-group silky-options-collapse-group silky-options-group-style-" + this.style);

    this.onContainerRendering = function(context) {

        var groupText = this.getPropertyValue('label');

        var t = '<div class="silky-options-collapse-icon" style="display: inline;"> <span class="silky-dropdown-toggle"></span></div>';
        var $header = $('<div class="silky-options-group-header silky-options-collapse-group-header style="white-space: nowrap;">' + t + groupText + '</div>');
        var cell = this.addHeader($header);
        cell.setStretchFactor(1);
        $header.on('click', null, this, function(event) {
            var group = event.data;
            group.toggleColapsedState();
        });
    };

    this.addHeader = function($header) {
        this.ignoreTransform = true;
        this.headerCell = this.addCell(0, 0, false, $header);
        this.headerCell.setVisibility(true);
        this.addSpacer(0, 1, true, 10, 5);
        this.ignoreTransform = false;
        return this.headerCell;
    };

    this.rowTransform = function(row, column) {
        if ( ! this.ignoreTransform)
            return row + 1;

        return row;
    };

    this.columnTransform = function(row, column) {
        if ( ! this.ignoreTransform)
            return column + 1;

        return column;
    };

    this.collapse = function() {

        if (this._collapsed)
            return;

        this.$el.addClass("silky-gridlayout-collapsed");

        this.setContentVisibility(false);
        this.headerCell.invalidateContentSize();
        this.invalidateLayout('both', Math.random());
        this._collapsed = true;
    };

    this.setContentVisibility = function(visible) {
        for (var i = 0; i < this._cells.length; i++) {
            var cell = this._cells[i];
            if (this.headerCell._id !== cell._id)
                cell.setVisibility(visible);
        }
    };

    this.expand = function() {

        if ( ! this._collapsed)
            return;

        this.$el.removeClass("silky-gridlayout-collapsed");

        this.setContentVisibility(true);
        this.headerCell.invalidateContentSize();
        this.invalidateLayout('both', Math.random(), true);
        this._collapsed = false;

    };

    this.toggleColapsedState = function() {
        if (this._collapsed)
            this.expand();
        else
            this.collapse();
    };

    this.onCellAdded = function(cell) {
        if (_.isUndefined(this.headerCell) === false && this.headerCell._id !== cell._id)
            cell.setVisibility(this._collapsed === false);
    };
};

module.exports = LayoutCollapseView;
