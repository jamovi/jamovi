
'use strict';

var $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');
var LayoutGrid = require('./layoutgrid').Grid;
var LayoutGridProtoType = require('./layoutgrid').prototype;
Backbone.$ = $;

var LayoutGroupView = LayoutGrid.extend({

    rowTransform: function(row, column) {
        if (!this.ignoreTransform) {
            if (this.format === 'inline')
                return row;
            else
                return row + 1;
        }

        return row;
    },

    columnTransform: function(row, column) {
        if (!this.ignoreTransform)
            return column + 1;

        return column;
    },

    setInfo: function(format, level) {
        this.format = format;
        this.level = level;
    },

    addHeader: function($header) {
        this.ignoreTransform = true;
        var fitToGrid = this.format === 'inline';
        this.headerCell = LayoutGridProtoType.addCell.call(this, 0, 0, fitToGrid, $header);
        this.headerCell.$el.addClass("silky-group-header");
        if (this.format === 'list')
            LayoutGridProtoType.addSpacer.call(this, 0, 1, true, 10, 5);
        this.ignoreTransform = false;
        return this.headerCell;
    },

    colapse: function() {

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
    },

    expand: function() {

        if ( ! this._colapsed)
            return;

        this.$el.removeClass("silky-gridlayout-colapsed");

        var height = this.preferedHeight;
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
    },

    toggleColapsedState: function() {
        if (this._colapsed)
            this.expand();
        else
            this.colapse();
    },

    animationComplete: function(action) {
        if (action === 'colapse' || action === 'expand') {
            this._colapsed = action === 'colapse';
            this._ignoreLayout =  action === 'colapse';
        }
    },

    onSizeChanged: function(type) {
        this.$el.trigger('layoutgrid.sizeChanged', { type:type, updateId: Math.random() });
    }

});

module.exports = LayoutGroupView;
