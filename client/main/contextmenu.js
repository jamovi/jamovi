
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const ContextMenus = require('./contextmenu/contextmenus');
const focusLoop = require('../common/focusloop');
const Menu = require('../common/menu');

const ContextMenu = function() { // this is constructed at the bottom

    Object.assign(this, Backbone.Events);

    this.menu = new Menu(null, 0, { exitKeys: ['ArrowLeft'] });
    this.$el = this.menu.$el;
    this.$el.attr('hloop', false);

    this.menu.on('menu-hidden', (event) => {
        if (! this._showing)
            this.trigger('menu-hidden', event);
    } );
    this.$el.on('menuActioned', () => { this.menu.hide(true); });

    this.show = function(menuItems, x, y, anchor, openPath, owner) {
        anchor = anchor === undefined ? 'left' : anchor;
        openPath = openPath === undefined ? [] : openPath;

        this.buttons = [ ];

        this._showing = true;

        this.$el.empty();
        this.$separator = $('<div class="jmv-click-menu-separator"></div>').appendTo(this.$el);

        let openButton = null;

        for (let i = 0; i < menuItems.length; i++) {
            let button = menuItems[i];

            if (button.getMenus) {
                let subMenus = button.getMenus();
                for (let subMenu of subMenus) {
                    if (!subMenu.connected)
                        subMenu.connect(this.menu);
                }
            }

            if (button.dock === 'right')
                button.$el.insertAfter(this.$separator);
            else
                button.$el.insertBefore(this.$separator);

            this.buttons.push(button);

            if (openButton === null && button.getEntryButton)
                openButton = button.getEntryButton(openPath, false);
        }

        setTimeout(() => {
            if (openButton !== null) {
                x -= this.$el.outerWidth(true) - 10;
                y -= openButton.$el.position().top + 10;
            }

            this.menu.show(x, y, { withMouse: true });
            this._showing = false;

            if (openButton !== null)
                openButton.getEntryButton(openPath, true, true);
            else
                focusLoop.enterFocusLoop(this.$el[0], { withMouse: true });
        }, 0);
    };

    this.showDataRowMenu = function(x, y, plural) {
        this.show(ContextMenus.createRowMenuItems(plural), x, y);
    };

    this.showFilterRowMenu = function(x, y) {
        this.show(ContextMenus.createFilterRowMenuItems(), x, y);
    };

    this.showVariableMenu = function(x, y, plural, noData) {
        this.show(ContextMenus.createVariableMenuItems(plural, noData), x, y);
    };

    this.showAppendVariableMenu = function(x, y, anchor) {
        this.show(ContextMenus.createAppendVariableMenuItems(), x, y, anchor);
    };

    this.showFilterMenu = function(x, y, noData) {
        this.show(ContextMenus.createFilterMenuItems(noData), x, y);
    };

    this.showResultsMenu = function(entries, x, y) {
        let menu = ContextMenus.createResultsObjectMenuItems(entries);
        let openPath = [];
        if (menu[0].items.length > 0)
            openPath.push(menu[0].items[menu[0].items.length-1].name);

        this.show(menu, x, y, 'left', openPath);
    };

    this.isVisible = function() {
        return this.menu.isVisible();
    };
};

let _menu = new ContextMenu();
$(document).ready(() => {
    _menu.menu.connect();
});

module.exports = _menu;
