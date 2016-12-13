
'use strict';

const $ = require('jquery');
const _ = require('underscore');

const RibbonMenu = function($el, parent, title, name, items, right) {

    this.$el = $el;
    this.$el.addClass('jmv-ribbon-button');

    this.parent = parent;
    this.title = title;
    this.name = name;
    this.items = items;

    this.$el.attr('data-name', this.name.toLowerCase());
    this.$el.attr('disabled');
    if (right)
        this.$el.addClass('right');

    this.$el.on('click', event => this._clicked(event));

    this.menuVisible = false;

    $('html').click(event => {
        if (this.menuVisible === false)
            return;
        let $target = $(event.target);
        if ($target.closest(this.$el).length === 0 &&
            $target.is(this.$menu) === false &&
            $target.is(this.$el) === false)
                this._hideMenu();
    });

    this._refresh();
};

RibbonMenu.prototype.setEnabled = function(enabled) {
    this.$el.prop('disabled', ! enabled);
};

RibbonMenu.prototype._notifySelected = function(name, ns) {
    let analysis = { name: name, ns: ns };
    this.parent._analysisSelected(analysis);
    this._hideMenu();
};

RibbonMenu.prototype._hideMenu = function() {
    this.$menu.hide();
    this.menuVisible = false;
};

RibbonMenu.prototype._showMenu = function() {
    this.$menu.show();
    this.menuVisible = true;
};

RibbonMenu.prototype._toggleMenu = function() {
    if (this.menuVisible)
        this._hideMenu();
    else
        this._showMenu();
};

RibbonMenu.prototype._clicked = function(event) {
    let $target = $(event.target);
    if ($target.closest(this.$menu).length !== 0)
        return;
    this._toggleMenu();
};

RibbonMenu.prototype._itemClicked = function(event) {
    let source = event.target;
    this._notifySelected(source.dataset.name, source.dataset.ns);
};

RibbonMenu.prototype._createMenuItem = function(item) {
    if (item.subtitle)
        return '<div data-name="' + item.name + '" data-ns="' + item.ns + '" class="jmv-ribbon-menu-item">' + item.title + '<div class="jmv-ribbon-menu-item-sub">' + item.subtitle + '</div></div>';
    return '<div data-name="' + item.name + '" data-ns="' + item.ns + '" class="jmv-ribbon-menu-item">' + item.title + '</div>';
};

RibbonMenu.prototype._createMenuGroup = function(group) {

    let html = '';

    html += '<div class="jmv-ribbon-menu-group">';
    html += '<div class="jmv-ribbon-menu-heading">' + group.title + '</div>';

    for (let i = 0; i < group.items.length; i++)
        html += this._createMenuItem(group.items[i]);

    html += '</div>';

    return html;
};

RibbonMenu.prototype._refresh = function() {

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
};

module.exports = RibbonMenu;
