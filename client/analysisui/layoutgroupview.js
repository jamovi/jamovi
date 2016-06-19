
'use strict';

var $ = require('jquery');
var _ = require('underscore');

var ControlContainer = require('./controlcontainer');

var LayoutGroupView = function(model, params) {

    ControlContainer.extendTo(this, model, params);

    this.registerSimpleProperty("collapsed", false);
    this.registerSimpleProperty("label", null);

    this._collapsed = this.getPropertyValue('collapsed');
    this.style = this.getPropertyValue('style');
    this.level = this.getPropertyValue('level');

    if (this._collapsed)
        this.$el.addClass("silky-gridlayout-collapsed");
    this.$el.addClass("silky-options-group silky-options-level-" + this.level + " silky-options-group-style-" + this.style);

    this.onLayoutRendering = function() {

        var groupText = this.getPropertyValue('label');
        if (groupText !== null) {
            var $header = null;
            if (typeof groupText === "string") {
                var t = '';
                if (this.level === 1)
                    t = '<div class="silky-options-collapse-icon" style="display: inline;"> <span class="silky-dropdown-toggle"></span></div>';
                $header = $('<div class="silky-options-h' + this.level + '" style="white-space: nowrap;">' + t + groupText + '</div>');
            }
            else {
                if (this.level === 1)
                    throw "An option cannot be a level 1 heading.";

                var ctrl = this.model.createControl(groupText);
                if (ctrl !== null)
                    $header = ctrl.$el;
                else
                    throw "A group header cannot be of this type.";
            }

            if ($header !== null) {
                $header.addClass("silky-options-group-header silky-options-group-header"  + this.level);
                var cell = this.addHeader($header);
                if (this.level === 1) {
                    cell.setStretchFactor(1);
                    $header.on('click', null, this, function(event) {
                        var group = event.data;
                        group.toggleColapsedState();
                    });
                }
            }
        }
    };

    this.addHeader = function($header) {
        this.ignoreTransform = true;
        var fitToGrid = this.style === 'inline';
        this.headerCell = this.addCell(0, 0, fitToGrid, $header);
        this.headerCell.setVisibility(true);
        this.headerCell.$el.addClass("silky-group-header");
        if (this.style === 'list')
            this.addSpacer(0, 1, true, 10, 5);
        this.ignoreTransform = false;
        return this.headerCell;
    };

    this.rowTransform = function(row, column) {
        if ( ! this.ignoreTransform) {
            if (this.style === 'inline')
                return row;
            else
                return row + 1;
        }

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
        this.invalidateLayout('both', Math.random());
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

module.exports = LayoutGroupView;
