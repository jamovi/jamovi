
'use strict';

const $ = require('jquery');
//const tarp = require('../utils/tarp');
const SuperClass = require('../superclass');
const Backbone = require('backbone');

const Toolbar = function(items) {

    Object.assign(this, Backbone.Events);

    this.items = items;

    this.$el = $('<div></div');

    this.$el.addClass('jmv-toolbar');
    this.$el.click(this._menuClosed);
    this._rendered = false;

    this.getLevel = function() {
        return 0;
    };

    this.getParent = function(level) {
        if (level === 0)
            return this;
    };

    this.render = function(items) {

        if (this._rendered)
            return;

        this.$el.empty();
        this.$separator = $('<div class="jmv-toolbar-button-separator"></div>').appendTo(this.$el);

        for (let i = 0; i < items.length; i++) {
            let button = items[i];

            if (button.getMenus) {
                let subMenus = button.getMenus();
                for (let subMenu of subMenus) {
                    if (!subMenu.connected)
                        subMenu.connect(this.menu);
                }
            }

            if (button.setParent)
                button.setParent(this, this);

            if (button.dock === 'right')
                button.$el.insertAfter(this.$separator);
            else
                button.$el.insertBefore(this.$separator);
        }

        this._rendered = true;
    };

    this._menuClosed = function() {
        this.$el.css('z-index', '');
        this._tarpVisible = false;
        for (let button of this.items) {
            if (button.hideMenu)
                button.hideMenu();
        }
        this.$el[0].focus();
    };

    this._buttonClicked = function(action) {
        if (action._menuGroup === undefined)
            this._menuClosed();
        else {
            let child = action;
            let parent = child.getParent();
            while (parent) {
                for (let button of parent.items) {
                    if (button !== child && button.hideMenu && button.getLevel)
                        button.hideMenu();
                }
                child = parent;
                parent = parent.getParent();
            }
        }
        this.trigger("buttonClicked", action);
    };

    this.render(items);
};

SuperClass.create(Toolbar);

module.exports = Toolbar;
