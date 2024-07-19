
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const selectionLoop = require('../../common/selectionloop');
Backbone.$ = $;

const NewVarWidget = Backbone.View.extend({
    className: 'NewVarWidget',
    initialize(args) {

        this.attached = false;

        this.$el.empty();
        this.$el.addClass('jmv-variable-new-widget');

        this.$container = $('<div class="jmv-variable-new-container var-buttons" role="list"></div>').appendTo(this.$el);

        this.$data = $('<button class="button data-variable var-buttons-list-item var-buttons-auto-select" role="listitem"></button>').appendTo(this.$container);
        this.$iconData = $('<div class="icon"</div>').appendTo(this.$data);
        this.$data.append($(`<div class="text">${_('New data variable')}</div>`));

        this.$computed = $('<button class="button computed-variable var-buttons-list-item var-buttons-auto-select" role="listitem"></button>').appendTo(this.$container);
        this.$iconComputed = $('<div class="icon"</div>').appendTo(this.$computed);
        this.$computed.append($(`<div class="text">${_('New computed variable')}</div>`));

        this.$recoded = $('<button class="button transformed-variable var-buttons-list-item var-buttons-auto-select" role="listitem"></button>').appendTo(this.$container);
        this.$iconRecoded = $('<div class="icon"</div>').appendTo(this.$recoded);
        this.$recoded.append($(`<div class="text">${_('New transformed variable')}</div>`));

        this.buttons = new selectionLoop('var-buttons', this.$container[0], true);

        this.$data.on('click', (event) => {
            this.model.set('columnType', 'data');
        });

        this.$computed.on('click', (event) => {
            this.model.set('columnType', 'computed');
        });

        this.$recoded.on('click', (event) => {
            this.model.set('columnType', 'recoded');
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
