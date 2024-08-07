
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');

const ToolbarGroup = function(params) {

    Object.assign(this, Backbone.Events);

    /*
    params
    {
        title:          //Title to be displayed by the group. Make '' for not title but leave space or null for no title and no space.
        orientation:    //How are the contents displayed 'vertical' or 'horizontal' (default)
        right:          //Is the button docked to the right? [default: false]
        $el:            //jquery element. Will create if missing.
        items:          //Array of menu items. Not needed, can use 'addItem'.
    }
    */
    this.params = params;

    this._render = function(params) {

        let title = params.title === undefined ? null : params.title;
        let orientation = params.orientation === undefined ? 'horizontal' : params.orientation;
        let right = params.right === undefined ? false : params.right;
        let $el = params.$el === undefined ? $('<div></div>') : params.$el;
        let classes = params.classes === undefined ? '' : params.classes;

        this.$el = $el;
        this.$el.addClass('jmv-toolbar-group');
        this.$el.addClass(classes);
        if (title !== null)
            this.$el.addClass('titled');

        this.title = title;
        this.dock = right ? 'right' : 'left';

        this.$el.attr('aria-disabled', true);
        if (right)
            this.$el.addClass('right');

        this.items = [];

        let html = '';
        html += '<div class="jmv-toolbar-group-body jmv-toolbar-group-body-' + orientation + '">';
        html += '</div>';
        if (title !== null)
            html += '<div class="jmv-toolbar-group-label">' + title + '</div>';

        this.$el.append(html);

        this.$label = this.$el.find('.jmv-toolbar-group-label');
        this.$body   = this.$el.find('.jmv-toolbar-group-body');

        this.$separator = $('<div class="jmv-toolbar-button-separator"></div>').appendTo(this.$body);

        if (params.items !== undefined) {
            for (let i = 0; i < params.items.length; i++)
                this.addItem(params.items[i]);
        }
    };

    this.setParent = function(root, parent) {
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (item.setParent)
                item.setParent(root, parent);
        }
    };

    this.addItem = function(item) {
        this.items.push(item);

        if (item.dock === 'right')
            item.$el.insertAfter(this.$separator);
        else
            item.$el.insertBefore(this.$separator);
    };

    this.hideMenu = function() {
        for (let item of this.items) {
            if (item.hideMenu)
                item.hideMenu();
        }
    };

    this.setEnabled = function(enabled) {
        this.$el.attr('aria-disabled', ! enabled);
    };

    this.getMenus = function() {
        let menus = [];
        for (let item of this.items) {
            if (item.getMenus)
                menus = menus.concat(item.getMenus());
        }
        return menus;
    };

    this._render(params);
};

module.exports = ToolbarGroup;
