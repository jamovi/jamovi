
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const ComputedVarWidget = Backbone.View.extend({
    className: 'ComputedVarWidget',
    initialize(args) {

        this.attached = true;

        this.$el.empty();
        this.$el.addClass('jmv-variable-computed-widget');
    },
    detach() {
        this.model.apply();
        this.attached = false;
    },
    attach() {
        this.attached = true;
        // update displayed values from model
    }
});

module.exports = ComputedVarWidget;
