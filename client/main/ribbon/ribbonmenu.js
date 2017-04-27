
'use strict';

const $ = require('jquery');
const _ = require('underscore');
const tarp = require('../utils/tarp');
const Backbone = require('backbone');

const RibbonMenu = Backbone.View.extend({

    initialize($el, parent, title, name, items, right, containsNew) {

        this.$el = $el;
        this.$el.addClass('jmv-ribbon-button');

        this.parent = parent;
        this.title = title;
        this.name = name;
        this.items = items;
        this.containsNew = containsNew;
        this.menuVisible = false;

        this.$el.attr('data-name', this.name.toLowerCase());
        this.$el.attr('disabled');
        if (containsNew)
            this.$el.addClass('contains-new');
        if (right)
            this.$el.addClass('right');

        this.$el.on('click', event => this._clicked(event));

        this._refresh();
    },
    setEnabled(enabled) {
        this.$el.prop('disabled', ! enabled);
    },
    _notifySelected(name, ns) {
        let analysis = { name: name, ns: ns };
        this.parent._analysisSelected(analysis);
        this.hideMenu();
    },
    hideMenu() {
        this.$menu.hide();
        this.menuVisible = false;
    },
    showMenu() {
        this.trigger('shown', this);
        this.$el.removeClass('contains-new');
        this.$menu.show();
        this.menuVisible = true;
    },
    _toggleMenu() {
        if (this.menuVisible)
            this.hideMenu();
        else
            this.showMenu();
    },
    _clicked(event) {
        let $target = $(event.target);
        if ($target.closest(this.$menu).length !== 0)
            return;
        this._toggleMenu();
        event.stopPropagation();
    },
    _itemClicked(event) {
        let source = event.target;
        this._notifySelected(source.dataset.name, source.dataset.ns);
        $(source).removeClass('new');
        event.stopPropagation();
    },
    _createMenuItem(item) {
        if (item.subtitle)
            return '<div data-name="' + item.name + '" data-ns="' + item.ns + '" class="jmv-ribbon-menu-item ' + (item.new ? 'new':'') + '">' + item.title + '<div class="jmv-ribbon-menu-item-sub">' + item.subtitle + '</div></div>';
        return '<div data-name="' + item.name + '" data-ns="' + item.ns + '" class="jmv-ribbon-menu-item ' + (item.new ? 'new':'') + '">' + item.title + '</div>';
    },
    _createMenuGroup(group) {

        let html = '';

        html += '<div class="jmv-ribbon-menu-group">';
        html += '<div class="jmv-ribbon-menu-heading">' + group.title + '</div>';

        for (let i = 0; i < group.items.length; i++)
            html += this._createMenuItem(group.items[i]);

        html += '</div>';

        return html;
    },
    _refresh() {

        let html = '';
        html += '   <div class="jmv-ribbon-button-icon"></div>';
        html += '   <div class="jmv-ribbon-button-label">' + this.title + '</div>';

        html += '   <div class="jmv-ribbon-button-menu" style="display: none ;">';

        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (item.type === 'group')
                html += this._createMenuGroup(item);
            else
                html += this._createMenuItem(item);
        }

        html += '   </div>';

        this.$el.html(html);

        this.$menu   = this.$el.find('.jmv-ribbon-button-menu');
        this.$menuItems = this.$el.find('.jmv-ribbon-menu-item');

        this.$menuItems.click(event => this._itemClicked(event));
    }
});

module.exports = RibbonMenu;
