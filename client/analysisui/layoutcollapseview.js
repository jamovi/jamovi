
'use strict';

var $ = require('jquery');
var _ = require('underscore');

var GridControl = require('./gridcontrol');
var ControlBase = require('./controlbase');
var LayoutGrid = require('./layoutgrid').Grid;
var EnumPropertyFilter = require('./enumpropertyfilter');
var LayoutGridBorderSupport = require('./layoutgridbordersupport');

var LayoutCollapseView = function(params) {

    ControlBase.extendTo(this, params);
    GridControl.extendTo(this);

    this.registerSimpleProperty("collapsed", false);
    this.registerSimpleProperty("label", null);

    this._collapsed = this.getPropertyValue('collapsed');

    this._body = null;

    this.onRenderToGrid = function(grid, row, column) {
        this._layout = new LayoutGrid();
        this._layout.$el.addClass("silky-layout-container silky-options-group silky-options-group-style-list silky-control-margin-" + this.getPropertyValue("margin"));
        LayoutGridBorderSupport.extendTo(this._layout);
        var cell = grid.addLayout(column, row, false, this._layout);
        cell.setStretchFactor(1);

        var groupText = this.getPropertyValue('label');
        var t = '<div class="silky-options-collapse-icon" style="display: inline;"> <span class="silky-dropdown-toggle"></span></div>';
        this.$header = $('<div class="silky-options-collapse-button silky-control-margin-' + this.getPropertyValue("margin") + '" style="white-space: nowrap;">' + t + groupText + '</div>');

        if (this._collapsed)
            this.$header.addClass("silky-gridlayout-collapsed");

        this._headerCell = this._layout.addCell(0, 0, false, this.$header);
        this._headerCell.setStretchFactor(1);

        this.$header.on('click', null, this, function(event) {
            var group = event.data;
            group.toggleColapsedState();
        });

        return { height: 1, width: 1 };
    };

    this.setBody = function(body) {
        this._body = body;
        body.$el.addClass("silky-control-body");
        var data = body.renderToGrid(this._layout, 1, 0);
        this._bodyCell = data.cell;
        this._bodyCell.setStretchFactor(1);
        this.setContentVisibility(this._collapsed === false);
    };

    this.collapse = function() {

        if (this._collapsed)
            return;

        this.$header.addClass("silky-gridlayout-collapsed");

        this.setContentVisibility(false);
        this._headerCell.invalidateContentSize();
        this._layout.invalidateLayout('both', Math.random());
        this._collapsed = true;
    };

    this.setContentVisibility = function(visible) {
        this._bodyCell.setVisibility(visible);
    };

    this.expand = function() {

        if ( ! this._collapsed)
            return;

        this.$header.removeClass("silky-gridlayout-collapsed");

        this.setContentVisibility(true);
        this._headerCell.invalidateContentSize();
        this._layout.invalidateLayout('both', Math.random(), true);
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
