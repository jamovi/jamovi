
'use strict';

const $ = require('jquery');
const ActionHub = require('../actionhub');

const StatusbarButton = function(name) {

    this.$el =  $('<div class="jmv-statusbar-button"></div>');

    this.name = name;

    this.$el.attr('data-name', this.name.toLowerCase());
    this.$el.attr('disabled');

    this.$el.on('click', event => this._clicked(event));

    this.setEnabled = function(enabled) {
        if (enabled)
            this.$el.removeAttr('disabled');
        else
            this.$el.attr('disabled', '');
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
    };

    let action = ActionHub.get(name);
    this.setEnabled(action.get('enabled'));
    action.on('change:enabled', (event) => {
        this.setEnabled(event.changed.enabled);
    });
};

module.exports = StatusbarButton;
