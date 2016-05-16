
'use strict';

var $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');
var LayoutGrid = require('./layoutgrid').Grid;
//var LayoutGridProtoType = require('./layoutgrid').prototype;


var LayoutGroupView = function() {
    LayoutGrid.extendTo(this);

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

    this.setInfo = function(style, level) {
        this.style = style;
        this.level = level;
    };

    this.addHeader = function($header) {
        this.ignoreTransform = true;
        var fitToGrid = this.style === 'inline';
        this.headerCell = this.addCell(0, 0, fitToGrid, $header);
        this.headerCell.$el.addClass("silky-group-header");
        if (this.style === 'list')
            this.addSpacer(0, 1, true, 10, 5);
        this.ignoreTransform = false;
        return this.headerCell;
    };

    this.colapse = function() {

        if (this._colapsed)
            return;

        this._ignoreLayout = true;

        this.$el.addClass("silky-gridlayout-colapsed");

        var self = this;
        //window.setTimeout(function() {
            var height = _.isUndefined(self.headerCell) ? 0 : self.headerCell.contentHeight();
            var data = {height: height };
            self.$el.animate(data, {
                duration: 100,
                queue: false,
                complete: function() {
                    self.animationComplete('colapse');
                },
                progress: function() {
                    self.onSizeChanged('height');
                }
            });
            var $contents = self.$el.children(':not(.silky-group-header)').animate(
                {
                    opacity: 0
                },
                {
                    duration: 100,
                    queue: false
                }
            );
        //});
    };

    this.expand = function() {

        if ( ! this._colapsed)
            return;

        this.$el.removeClass("silky-gridlayout-colapsed");

        var height = this.preferredHeight;
        var data = {height: height };
        var self = this;
        this.$el.animate(data, {
            duration: 100,
            queue: false,
            complete: function() {
                self.animationComplete('expand');
            },
            progress: function() {
                self.onSizeChanged('height');
            }
        });
        var $contents = this.$el.children(':not(.silky-group-header)').animate(
            {
                opacity: 1
            },
            {
                duration: 100,
                queue: false,
            }
        );
    };

    this.toggleColapsedState = function() {
        if (this._colapsed)
            this.expand();
        else
            this.colapse();
    };

    this.animationComplete = function(action) {
        if (action === 'colapse' || action === 'expand') {
            this._colapsed = action === 'colapse';
            this._ignoreLayout =  action === 'colapse';
        }
    };

    this.onSizeChanged = function(type) {
        this.$el.trigger('layoutgrid.sizeChanged', { type:type, updateId: Math.random() });
    };

};

module.exports = LayoutGroupView;
