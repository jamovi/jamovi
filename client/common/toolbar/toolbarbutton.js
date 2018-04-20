
'use strict';

const $ = require('jquery');
const RibbonGroup = require('./toolbargroup');
const Backbone = require('backbone');

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
        let $el = params.$el === undefined ? $('<div></div>') : params.$el;
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
        this.$el.attr('disabled');
        if (right)
            this.$el.addClass('right');

        this.$el.on('click', event => this._clicked(event));

        this._render();

        if (params.items !== undefined) {
            for (let i = 0; i < params.items.length; i++)
                this.addItem(params.items[i]);
        }

        if (params.items !== undefined)
            this.items = params.items;
    };

    this.setParent = function(parent) {
        this.parent = parent;

        if (this._menuGroup !== undefined)
            this._menuGroup.setParent(parent);
    };

    this.setEnabled = function(enabled) {
        if (enabled === false)
            this.$el.addClass('jmv-toolbar-disabled');
        else
            this.$el.removeClass('jmv-toolbar-disabled');

        this._enabled = enabled;
    };

    this._clicked = function(event) {

        if (this._enabled === false)
            return;

        let menuWasVisible = this.menuVisible;
        this.parent._buttonClicked(this);

        if (this._menuGroup !== undefined) {
            if (menuWasVisible === false)
                this._toggleMenu();
        }

        event.stopPropagation();
    };

    this.addItem = function(item) {
        if (this._menuGroup === undefined) {
            let $menugroup = $('<div></div>');
            this._menuGroup = new RibbonGroup({ orientation: 'vertical', $el: $menugroup });
            this.$menu.append(this._menuGroup.$el);
            if (this.hasMenuArrow)
                $('<div class="jmv-toolbar-menu-arrow"></div>').insertBefore(this.$menu);
            this.$el.addClass("jmv-toolbar-dropdown");
        }

        this._menuGroup.addItem(item);
    };

    this._render = function() {
        let html = '';
        if (this.hasIcon)
            html += '   <div class="jmv-toolbar-button-icon"></div>';
        if (this.size === 'medium' || this.size === 'large')
            html += '   <div class="jmv-toolbar-button-label">' + this.title + '</div>';

        html += '   <div class="jmv-toolbar-button-menu" style="display: none ;">';
        html += '   </div>';

        this.$el.html(html);

        this.$menu   = this.$el.find('.jmv-toolbar-button-menu');
    };

    this.hideMenu = function() {
        this.$menu.hide();
        this.menuVisible = false;
    };

    this.showMenu = function(zIndex) {
        this.trigger('shown', this);
        this.$el.removeClass('contains-new');
        //this.$menu.css('z-index', 100);
        this.$menu.show();
        this.menuVisible = true;
    };

    this._toggleMenu = function() {
        if (this.menuVisible)
            this.hideMenu();
        else
            this.showMenu();
    };

    this.initialize(params);
};

module.exports = ToolbarButton;
