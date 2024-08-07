
'use strict';

const $ = require('jquery');
const RibbonGroup = require('./toolbargroup');
const Backbone = require('backbone');
const focusLoop = require('../focusloop');
const Menu = require('../menu');

const ToolbarButton = function(params) {

    Object.assign(this, Backbone.Events);
    /*
    params
    {
        title:      //Title to be displayed
        name:       //Button Id used in action event  REQUIRED!
        tabName:    //Tab in which the button lives (namespace). Will add if not specified.
        size:       //'small', 'medium', 'large', 'huge' [default: medium]
        right:      //Is the button docked to the right? [default: false]
        $el:        //jquery element. Will create if not defined.
    }
    */
    this.params = params;

    this.initialize = function(params) {

        let title = params.title === undefined ? null : params.title;
        let name = params.name;
        let size = params.size === undefined ? 'medium' : params.size;
        let right = params.right === undefined ? false : params.right;
        let $el = params.$el === undefined ? $('<button></button>') : params.$el;
        let classes = params.classes === undefined ? '' : params.classes;
        let hasIcon = params.hasIcon === undefined ? true : params.hasIcon;
        let hasMenuArrow = params.hasMenuArrow === undefined ? true : params.hasMenuArrow;

        this.$el = $el;
        this.$el.addClass('jmv-toolbar-button');
        this.$el.addClass(classes);
        this.$el.addClass('jmv-toolbar-button-size-' + size);

        this.size = size;
        this.title = title;
        this.name = name;
        this.dock = right ? 'right' : 'left';
        this.hasIcon = hasIcon || size === 'small';
        this.hasMenuArrow = hasMenuArrow;
        this._enabled = true;
        this.menuVisible = false;

        this.$el.attr('data-name', this.name.toLowerCase());
        this.$el.attr('aria-disabled');
        if (right)
            this.$el.addClass('right');

        this.$el.on('mousedown', event => {
            if (this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.$el.on('mouseup', event => {
            if ( ! this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.$el.on('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space')
                this._clicked(event, false);
        });

        this._render();

        if (params.items !== undefined) {
            for (let i = 0; i < params.items.length; i++)
                this.addItem(params.items[i]);
        }

        if (params.items !== undefined)
            this.items = params.items;
    };

    this.getParent = function(level) {
        if (level === undefined)
            return this.parent;
        else if (level === this._level)
            return this;

        return this.parent.getParent(level);
    };

    this.getLevel = function() {
        return this._level;
    };

    this.setParent = function(root, parent) {
        this.root = root;
        this.parent = parent;
        this._level = parent.getLevel() + 1;

        if (this._menuGroup !== undefined)
            this._menuGroup.setParent(root, this);
    };

    this.setEnabled = function(enabled) {
        if (enabled === false) {
            this.$el.addClass('jmv-toolbar-disabled');
            this.$el.attr('aria-disabled', true);
        }
        else {
            this.$el.removeClass('jmv-toolbar-disabled');
            this.$el.removeAttr('aria-disabled');
        }

        this._enabled = enabled;
    };

    this._clicked = function(event) {

        if (this._enabled === false)
            return;

        let menuWasVisible = this.menuVisible;
        this.root._buttonClicked(this);

        if (this._menuGroup !== undefined) {
            if (menuWasVisible === false)
                this.showMenu(event.detail > 0);
        }

        event.preventDefault();
    };

    this.addItem = function(item) {
        if (this._menuGroup === undefined) {
            this.menu = new Menu(this.$el[0], 1);

            let $menugroup = $('<div></div>');
            this._menuGroup = new RibbonGroup({ orientation: 'vertical', $el: $menugroup });
            this.menu.$el.append(this._menuGroup.$el);
            if (this.hasMenuArrow)
                $('<div class="jmv-toolbar-menu-arrow"></div>').appendTo(this.$el);
            this.$el.addClass("jmv-toolbar-dropdown");
        }

        this._menuGroup.addItem(item);

        if (item.getMenus) {
            let subMenus = item.getMenus();
            for (let subMenu of subMenus){
                if ( ! subMenu.connected)
                    subMenu.connect(this.menu);
            }
        }
    };

    this.getMenus = function() {
        if (this.menu)
            return [ this.menu ];
        return [];
    };

    this._render = function() {
        let html = '';
        if (this.hasIcon)
            html += '   <div class="jmv-toolbar-button-icon"></div>';
        if (this.size === 'medium' || this.size === 'large')
            html += '   <div class="jmv-toolbar-button-label">' + this.title + '</div>';

        this.$el.html(html);
    };

    this.hideMenu = function(fromMouse) {
        if ( ! this.menu)
            return;

        this.menu.hide(fromMouse);
    };

    this.showMenu = function(fromMouse) {
        if ( ! this.menu)
            return;

        this.positionMenu(fromMouse);
    };

    this._toggleMenu = function(fromMouse) {
        if (this.menu.isVisible())
            this.hideMenu(fromMouse);
        else
            this.showMenu(fromMouse);
    };

    this.positionMenu = function(fromMouse) {
        let anchor = 'left';
        let x = this.$el.offset().left + 5;
        let y = this.$el.offset().top + this.$el.outerHeight(false);
        if (this.inMenu) {
            x += this.menu.$el.outerWidth(true) - 10;
            y -= this.$el.outerHeight() + 10;
        }

        this.menu.show(x, y, { withMouse: fromMouse });
    };

    this.initialize(params);
};

module.exports = ToolbarButton;
