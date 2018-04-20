
'use strict';

const $ = require('jquery');
const tarp = require('../utils/tarp');
const SuperClass = require('../superclass');
const Backbone = require('backbone');

const Toolbar = function(items) {

    Object.assign(this, Backbone.Events);

    this.items = items;

    this.$el = $('<div></div');

    this.$el.addClass('jmv-toolbar');
    this.$el.click(this._menuClosed);
    this._rendered = false;

    this.render = function(items) {

        if (this._rendered)
            return;

        let menuShown = (menu) => this._menuShown(menu);

        this.$el.empty();
        this.$separator = $('<div class="jmv-toolbar-button-separator"></div>').appendTo(this.$el);

        for (let i = 0; i < items.length; i++) {
            let button = items[i];
            if (button.setParent)
                button.setParent(this);

            if (button.dock === 'right')
                button.$el.insertAfter(this.$separator);
            else
                button.$el.insertBefore(this.$separator);
            button.on('shown', menuShown);
        }

        this._rendered = true;
    };

    this._menuShown = function(source) {

        for (let button of this.items) {
            if (button !== source && button.hideMenu)
                button.hideMenu();
        }

        if ( ! this._tarpVisible) {
            tarp.show(true, 0, 10)
                .then(() => this._menuClosed(), () => this._menuClosed());
            this.$el.css('z-index', 100);
            this._tarpVisible = true;
        }
    };

    this._menuClosed = function() {
        if (this._tarpVisible === false)
            return;

        tarp.hide();
        this.$el.css('z-index', '');
        this._tarpVisible = false;
        for (let button of this.items) {
            if (button.hideMenu)
                button.hideMenu();
        }
        this.$el[0].focus();
    };

    this._buttonClicked = function(action) {
        this._menuClosed();
        this.trigger("buttonClicked", action);
    };

    this.render(items);
};

SuperClass.create(Toolbar);

module.exports = Toolbar;
