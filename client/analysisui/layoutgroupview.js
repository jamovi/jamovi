
'use strict';

var $ = require('jquery');
var _ = require('underscore');

var ControlContainer = require('./controlcontainer');

var LayoutGroupView = function(params) {

    ControlContainer.extendTo(this, params);

    this.registerSimpleProperty("label", null);

    this.style = this.getPropertyValue('style');
    this.level = this.getPropertyValue('level');

    this.$el.addClass("silky-options-group silky-options-label-group silky-options-group-style-" + this.style);

    this.onContainerRendering = function(context) {
        var groupText = this.getPropertyValue('label');
        if (groupText !== null) {
            var $header = $('<div class="silky-options-group-header silky-options-label-group-header style="white-space: nowrap;">' + groupText + '</div>');
            this.addHeader($header);
        }
    };

    this.addHeader = function($header) {
        this.ignoreTransform = true;
        var fitToGrid = this.style === 'inline';
        this.headerCell = this.addCell(0, 0, fitToGrid, $header);
        this.headerCell.setVisibility(true);
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
};

module.exports = LayoutGroupView;
