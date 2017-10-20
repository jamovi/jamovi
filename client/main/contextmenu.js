
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');

const tarp = require('./utils/tarp');

const ContextMenu = function() {

    Object.assign(this, Backbone.Events);

    this.$el = $('<div class="jmv-context-menu jmv-ribbon-group-body-vertical"></div>');
    this.$el.hide();

    this.$el.on('menuActioned', () => { this._menuClosed(); });

    this.owner = null;

    this.show = function(menuItems, x, y, openPath, owner) {
        openPath = openPath === undefined ? [] : openPath;
        this.owner = owner;
        this.$el.show();
        if ( ! this._tarpVisible) {
            tarp.show('click-menu', true, 0, 40)
                .then(() => this._menuClosed(), (event) => this._menuClosed(event));
            this.$el.css('z-index', '50');
            this._tarpVisible = true;
        }

        this.buttons = [ ];
        let menuShown = (menu) => this._menuShown(menu);

        this.$el.empty();
        this.$separator = $('<div class="jmv-click-menu-separator"></div>').appendTo(this.$el);

        let openButton = null;

        for (let i = 0; i < menuItems.length; i++) {
            let button = menuItems[i];

            if (button.dock === 'right')
                button.$el.insertAfter(this.$separator);
            else
                button.$el.insertBefore(this.$separator);
            button.on('shown', menuShown);
            this.buttons.push(button);

            if (openPath.length > 0 && button.openPath) {
                openButton = button.openPath(openPath);
                if (openButton !== null)
                    openPath = []
            }
        }

        if (openButton !== null) {
            x -= this.$el.outerWidth(true) - 10;
            y -= openButton.$el.position().top + 10;
        }

        this.$el.css({ top: y, left: x });

    };

    this.isVisible = function() {
        return this._tarpVisible;
    };

    this._menuShown = function(source) {
        for (let button of this.buttons) {
            if (button !== source && button.hideMenu)
                button.hideMenu();
        }
    };

    this._menuClosed = function(event) {
        if (this._tarpVisible === false)
            return;
        this.$el.css('z-index', '');
        this._tarpVisible = false;
        for (let button of this.buttons) {
            if (button.hideMenu)
                button.hideMenu();
        }
        this.owner = null;
        this.$el.hide();

        this.trigger('menu-closed', event);
    };
};

let _menu = new ContextMenu();
$(document).ready(() => {
    _menu.$el.appendTo($('body'));
});

module.exports = _menu;
