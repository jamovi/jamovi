'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var SplitPanel = Backbone.View.extend({
    className: "splitpanel",
    initialize: function() {
        _.bindAll(this, "resized");
        this.render();
        $(window).on("resize", this.resized);
    },
    events: {
    },
    render: function() {

        this.$el.addClass("silky-splitpanel");
        this.$el.css("position", "relative");

        this.$children = this.$el.children();
        this.sepWidth = 16;

        var totalWidth = this.$el.width();
        var totalHeight = this.$el.height();

        var sepCount = this.$children.length - 1;

        var netWidth = totalWidth - (sepCount * this.sepWidth);
        var childWidth = netWidth / this.$children.length;

        var left = 0;

        for (var i = 0; i < this.$children.length; i++) {

            var $child = $(this.$children[i]);

            $child.css("position", "absolute");
            $child.css("left", left);
            $child.css("width", childWidth);
            $child.css("height", totalHeight);

            left += childWidth + this.sepWidth;
        }
    },
    resized: function() {

        var totalHeight = this.$el.height();
        var newNetWidth = this.$el.width() - (this.$children.length - 1) * this.sepWidth
        var oldNetWidth = 0;

        for (var i = 0; i < this.$children.length; i++) {
            var $child = $(this.$children[i]);
            var width = $child.width();
            oldNetWidth += width;
        }

        var widthMultiplier = newNetWidth / oldNetWidth;
        var left = 0;

        for (var i = 0; i < this.$children.length; i++) {
            var $child = $(this.$children[i]);
            var width = $child.width();
            var newWidth = width * widthMultiplier;

            $child.css("left", left);
            $child.css("width", newWidth);
            $child.css("height", totalHeight);

            left += newWidth + this.sepWidth;
        }
    }
});

module.exports = SplitPanel;
