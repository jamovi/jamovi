
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const RecodedVarWidget = Backbone.View.extend({
    className: 'RecodedVarWidget',
    initialize(args) {

        this.attached = true;

        this.$el.empty();
        this.$el.addClass('jmv-variable-recoded-widget');
    },
    detach() {
        if ( ! this.attached)
            return;
        this.model.apply();
        this.attached = false;
    },
    attach() {
        this.attached = true;
        // update UI from model
    }
});

module.exports = RecodedVarWidget;
