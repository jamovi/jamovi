
'use strict';

const $ = require('jquery');
const ActionHub = require('../actionhub');

const StatusbarButton = function(name, properties) {

    this.$el =  $('<button class="jmv-statusbar-button" tabindex="0"></button>');

    this.name = name;

    this.$el.attr('data-name', this.name.toLowerCase());
    this.$el.attr('aria-disabled', true);
    if (properties && properties.label) 
        this.$el.attr('aria-label', properties.label);

    this.$el.on('click', event => this._clicked(event));
    this.$el.keydown((event) => {
        if (event.keyCode == 13 || event.keyCode == 32) {
            this._clicked(event);
        }
    });

    this.setEnabled = function(enabled) {
        if (enabled)
            this.$el.removeAttr('aria-disabled');
        else
            this.$el.attr('aria-disabled', true);
    };

    this._clicked = function(event) {

        let $target = $(event.target);
        if ($target.closest(this.$menu).length !== 0)
            return;

        let action = ActionHub.get(this.name);

        if ( ! action.attributes.enabled)
            ; // do nothing
        else {
            action.do();
            this.$el.trigger('menuActioned');
        }

        event.stopPropagation();
        event.preventDefault();
    };

    let action = ActionHub.get(name);
    this.setEnabled(action.get('enabled'));
    action.on('change:enabled', (event) => {
        this.setEnabled(event.changed.enabled);
    });
};

module.exports = StatusbarButton;
