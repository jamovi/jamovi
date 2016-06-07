
'use strict';

var $ = require('jquery');
var _ = require('underscore');

var Menu = function($el, parent) {
    this.$el = $el;
    this.parent = parent;

    this.$el.addClass('silky-menu');
    this.$el.hide();

    this.pos = null;
    this.entries = null;
    this.$entries = [ ];

    this.active = -1; // index
    this.$submenu = null;
    this.submenu = null;

    if ( ! parent) {
        this.$cover = $('<div class="silky-menu-cover"></div>');
        $('body').append(this.$cover);
    }
    else {
        this.$cover = $();
    }

    var self = this;
    this.$cover.on('mousedown', function() {
        self.hide();
    });
};

Menu.prototype._entryClicked = function(entry, $entry) {
    if (_.isUndefined(this.listeners))
        return;

    this.$entries.removeClass('active');
    $entry.addClass('active');

    this.listeners.forEach(function(listener) {
        listener(entry);
    });
};

Menu.prototype.onActiveChanged = function(listener) {
    if (_.isUndefined(this.listeners))
        this.listeners = [ listener ];
    else
        this.listeners.push(listener);
};

Menu.prototype.show = function(pos) {

    var finalPos = { };

    if (pos.clickPos) {
        var height = this.$el.height();
        var width = this.$el.width();
        var entryHeight = height / this.entries.length;

        // if (this.active === -1) {
            finalPos.top = pos.clickPos.top - height + (entryHeight / 3);
            finalPos.left = pos.clickPos.left - width / 2;
        // }
        // else {
        //    var subWidth = this.$submenu.width();
        //    finalPos.top = pos.clickPos.top - height + (this.active * entryHeight) - (2 * entryHeight / 3);
        //    finalPos.left = pos.clickPos.left - width - (subWidth / 2);
        // }
    }
    else {
        finalPos = pos.topLeft;
    }

    if (finalPos.left < 10)
        finalPos.left = 10;
    this.pos = finalPos;
    this.$el.css(finalPos);
    this.$el.show();
    this.$cover.show();

    this._showSubMenu();
};

Menu.prototype.hide = function() {
    this.$el.hide();
    this.$cover.hide();

    this.listeners.forEach(function(listener) {
        listener(null);
    });
};

Menu.prototype.setup = function(entries) {

    this.active = -1;
    this.entries = entries;

    this.$el.empty();

    var $list = $('<ul></ul>');
    this.$el.append($list);

    var i = 0;
    var self = this;
    var entry;
    entries.forEach(function(entry) {
        entry = entries[i];
        if (entry.active)
            self.active = i;

        var html = '';

        if (entry.options) {  // has child menu
            html += '<li class="silky-menu-entry silky-menu-parent ' + (entry.active ? 'active' : '') + '">';
            html += entry.label;
            html += '<span class="silky-menu-arrow mif-chevron-right"></span>';
            html += '</li>';
        }
        else {
            html += '<li class="silky-menu-entry ' + (entry.active ? 'active' : '') + '">';
            html += entry.label;
            html += '</li>';
        }

        var $entry = $(html);
        $entry.appendTo($list);

        $entry.click(function() {
            self._entryClicked(entry, $entry);
        });

        i++;
    });

    this.$entries = this.$el.find('.silky-menu-entry');

    this._setupSubMenu();
};

Menu.prototype._setupSubMenu = function() {
    if (this.active === -1)
        return;

    this.$submenu = $('<div></div>');
    this.submenu = new Menu(this.$submenu, this);
    this.$el.append(this.$submenu);

    this.submenu.setup([ { label: "Copy" }, { label: "Save" } ]);
};

Menu.prototype._showSubMenu = function() {
    if (this.active === -1)
        return;

    var borderTopWidth = parseInt(this.$el.css('borderTopWidth'));
    var borderRightWidth = parseInt(this.$el.css('borderRightWidth'));
    var subPos = { left: this.$el.width() + 3, top: 0 - borderTopWidth };
    this.submenu.show({ topLeft: subPos });
};

module.exports = Menu;
