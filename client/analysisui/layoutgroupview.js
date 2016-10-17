
'use strict';

var $ = require('jquery');
var _ = require('underscore');

var GridControl = require('./gridcontrol');
var ControlBase = require('./controlbase');
var ChildLayoutSupport = require('./childlayoutsupport');
var EnumPropertyFilter = require('./enumpropertyfilter');

var LayoutGroupView = function(params) {

    ControlBase.extendTo(this, params);
    GridControl.extendTo(this);

    this.registerSimpleProperty("label", "");
    this.registerSimpleProperty("style", "list", new EnumPropertyFilter(["list", "inline", "list-inline", "inline-list"], "list"));
    this.registerSimpleProperty("margin", "large", new EnumPropertyFilter(["small", "normal", "large", "none"], "large"));

    this.style = this.getPropertyValue('style');

    this.onRenderToGrid = function(grid, row, column) {
        var groupText = this.getPropertyValue('label');
        var classes = groupText === "" ? "silky-control-label-empty" : "";
        var $header = $('<div class="silky-control-label silky-control-margin-' + this.getPropertyValue("margin") + ' ' + classes + '" style="white-space: nowrap;">' + groupText + '</div>');
        this.headerCell = grid.addCell(column, row, false, $header);
        this.hasHeader = true;
        return { height: 1, width: 1 };
    };

    ChildLayoutSupport.extendTo(this);
};

module.exports = LayoutGroupView;
