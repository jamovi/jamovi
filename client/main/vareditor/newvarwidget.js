
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const NewVarWidget = Backbone.View.extend({
    className: 'NewVarWidget',
    initialize(args) {

        this.attached = false;

        this.$el.empty();
        this.$el.addClass('jmv-variable-new-widget');

        this.$container = $('<div class="jmv-variable-new-container"></div>').appendTo(this.$el);

        this.$data = $('<div class="button"></div>').appendTo(this.$container);
        this.$iconData = $('<div class="icon"</div>').appendTo(this.$data);
        this.$iconData.css('background-image', 'url(assets/variable-nominal.svg)');
        this.$data.append($('<div class="text">new data variable</div>'));

        this.$computed = $('<div class="button"></div>').appendTo(this.$container);
        this.$iconComputed = $('<div class="icon"</div>').appendTo(this.$computed);
        this.$iconComputed.css('background-image', 'url(assets/variable-computed.svg)');
        this.$computed.append($('<div class="text">new computed variable</div>'));

        this.$recoded = $('<div class="button"></div>').appendTo(this.$container);
        this.$iconRecoded = $('<div class="icon"</div>').appendTo(this.$recoded);
        this.$iconRecoded.css('background-image', 'url(assets/variable-recoded.svg)');
        this.$recoded.append($('<div class="text">New recoded variable</div>'));

        this.$data.on('click', (event) => {
            this.model.set('columnType', 'data');
            this.model.apply();
        });

        this.$computed.on('click', (event) => {
            this.model.set('columnType', 'computed');
            this.model.apply();
        });

        this.$recoded.on('click', (event) => {
            this.model.set('columnType', 'recoded');
            this.model.apply();
        });

    },
    detach() {
        this.attached = false;
    },
    attach() {
        this.attached = true;
    }
});

module.exports = NewVarWidget;
