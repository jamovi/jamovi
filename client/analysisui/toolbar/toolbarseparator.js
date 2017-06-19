
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');

const ToolbarSeparator = function(params) {

    Object.assign(this, Backbone.Events);

    if (params === undefined)
        params = { };

    let right = params.right === undefined ? false : params.right;
    let orientation = params.orientation === undefined ? 'horizontal' : params.orientation;
    let $el = params.$el === undefined ? $('<div></div>') : params.$el;

    this.$el = $el;
    this.$el.addClass('jmv-toolbar-separator');
    this.$el.addClass('jmv-toolbar-separator-' + orientation);

    this.dock = right ? 'right' : 'left';

    if (right)
        this.$el.addClass('right');
};

module.exports = ToolbarSeparator;
