
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');

const RibbonSeparator = Backbone.View.extend({

    initialize(params) {

        if (params === undefined)
            params = { };

        let right = params.right === undefined ? false : params.right;
        let $el = params.$el === undefined ? $('<div></div>') : params.$el;

        this.$el = $el;
        this.$el.addClass('jmv-ribbon-separator');

        this.dock = right ? 'right' : 'left';

        if (right)
            this.$el.addClass('right');
    }
});

module.exports = RibbonSeparator;
