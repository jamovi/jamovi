
'use strict';

var $ = require('jquery');
var _ = require('underscore');

var RibbonButton = function($el, analysis) {

    this.$el = $el;
    this.$el.prop('disabled', true);

    if (_.has(analysis, 'title'))
        this.title = analysis.title;

    if (_.has(analysis, 'name'))
        this.name = analysis.name;

    if (_.has(analysis, 'items')) {
        this.items = analysis.items;
        this.isMenu = true;
        this.menuVisible = false;

        var self = this;
        $('html').click(function(event) {
            if (this.menuVisible === false)
                return;
            var $target = $(event.target);
            if ($target.closest(self.$el).length === 0 &&
                $target.is(self.$menu) === false &&
                $target.is(self.$el) === false)
                    self._hideMenu();
        });

    } else {
        this.analysis = analysis;
        this.isAnalysis = true;
    }

    this.analysisListeners = [ ];

    this.refresh();
};

RibbonButton.prototype.setEnabled = function(enabled) {
    this.$el.prop('disabled', ! enabled);
    this.$button.prop('disabled', ! enabled);
};

RibbonButton.prototype.onAnalysisSelected = function(callback) {
    this.analysisListeners.push(callback);
};

RibbonButton.prototype._notifySelected = function(name, ns) {
    var self = this;
    var analysis = { name: name, ns: ns };
    this.analysisListeners.forEach(function(listener) {
        listener(analysis);
    });
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

RibbonButton.prototype._clicked = function() {
    if (this.isAnalysis)
        this._notifySelected(this.analysis.name, this.analysis.ns);
    else
        this._showMenu();
};

RibbonButton.prototype._itemClicked = function(event) {
    var source = event.target;
    this._notifySelected(source.dataset.name, source.dataset.ns);
};

RibbonButton.prototype._createMenuItem = function(item) {
    if (item.subtitle)
        return '<div data-name="' + item.name + '" data-ns="' + item.ns + '" class="silky-ribbon-menu-item">' + item.title + '<div class="silky-ribbon-menu-item-sub">' + item.subtitle + '</div></div>';
    return '<div data-name="' + item.name + '" data-ns="' + item.ns + '" class="silky-ribbon-menu-item">' + item.title + '</div>';
};

RibbonButton.prototype._createMenuGroup = function(group) {

    var html = '';

    html += '<div class="silky-ribbon-menu-group">';
    html += '<div class="silky-ribbon-menu-heading">' + group.title + '</div>';

    for (var i = 0; i < group.items.length; i++)
        html += this._createMenuItem(group.items[i]);

    html += '</div>';

    return html;
};

RibbonButton.prototype.refresh = function() {

    var html = '';

    html += '   <button class="silky-ribbon-button" data-name="' + this.name.toLowerCase() + '" disabled>';
    html += '       <div class="silky-ribbon-button-icon"></div>';
    html += '       <div class="silky-ribbon-button-label">' + this.title + '</div>';
    html += '   </button>';

    if (this.isMenu) {

        html += '   <div class="silky-ribbon-button-menu" style="display: none ;">';

        for (var i = 0; i < this.items.length; i++) {
            var item = this.items[i];
            if (item.type === 'group')
                html += this._createMenuGroup(item);
            else
                html += this._createMenuItem(item);
        }

        html += '   </div>';
    }

    this.$el.html(html);

    this.$button = this.$el.find('button');
    this.$menu   = this.$el.find('.silky-ribbon-button-menu');
    this.$menuItems = this.$el.find('.silky-ribbon-menu-item');

    var self = this;
    this.$button.click(function() { self._clicked(); });
    this.$menuItems.click(function(event) { self._itemClicked(event); });
};

module.exports = RibbonButton;
