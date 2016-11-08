
'use strict';

const $ = require('jquery');
const _ = require('underscore');

const RibbonButton = function($el, parent, title, name, items, right) {

    this.$el = $el;
    this.$el.addClass('silky-ribbon-button');

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

RibbonButton.prototype.setEnabled = function(enabled) {
    this.$el.prop('disabled', ! enabled);
};

RibbonButton.prototype._notifySelected = function(name, ns) {
    let analysis = { name: name, ns: ns };
    this.parent._analysisSelected(analysis);
    this._hideMenu();
};

RibbonButton.prototype._hideMenu = function() {
    this.$menu.hide();
    this.menuVisible = false;
};

RibbonButton.prototype._showMenu = function() {
    this.$menu.show();
    this.menuVisible = true;
};

RibbonButton.prototype._toggleMenu = function() {
    if (this.menuVisible)
        this._hideMenu();
    else
        this._showMenu();
};

RibbonButton.prototype._clicked = function(event) {
    let $target = $(event.target);
    if ($target.closest(this.$menu).length !== 0)
        return;
    this._toggleMenu();
};

RibbonButton.prototype._itemClicked = function(event) {
    let source = event.target;
    this._notifySelected(source.dataset.name, source.dataset.ns);
};

RibbonButton.prototype._createMenuItem = function(item) {
    if (item.subtitle)
        return '<div data-name="' + item.name + '" data-ns="' + item.ns + '" class="silky-ribbon-menu-item">' + item.title + '<div class="silky-ribbon-menu-item-sub">' + item.subtitle + '</div></div>';
    return '<div data-name="' + item.name + '" data-ns="' + item.ns + '" class="silky-ribbon-menu-item">' + item.title + '</div>';
};

RibbonButton.prototype._createMenuGroup = function(group) {

    let html = '';

    html += '<div class="silky-ribbon-menu-group">';
    html += '<div class="silky-ribbon-menu-heading">' + group.title + '</div>';

    for (let i = 0; i < group.items.length; i++)
        html += this._createMenuItem(group.items[i]);

    html += '</div>';

    return html;
};

RibbonButton.prototype._refresh = function() {

    let html = '';
    html += '   <div class="silky-ribbon-button-icon"></div>';
    html += '   <div class="silky-ribbon-button-label">' + this.title + '</div>';

    html += '   <div class="silky-ribbon-button-menu" style="display: none ;">';

    for (let i = 0; i < this.items.length; i++) {
        let item = this.items[i];
        if (item.type === 'group')
            html += this._createMenuGroup(item);
        else
            html += this._createMenuItem(item);
    }

    html += '   </div>';

    this.$el.html(html);

    this.$menu   = this.$el.find('.silky-ribbon-button-menu');
    this.$menuItems = this.$el.find('.silky-ribbon-menu-item');

    this.$menuItems.click(event => this._itemClicked(event));
};

module.exports = RibbonButton;
