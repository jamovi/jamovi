
'use strict';

const $ = require('jquery');
const tarp = require('./utils/tarp');

const Menu = function($el, parent) {
    this.$el = $el;
    this.parent = parent;

    this.$el.addClass('silky-menu');
    this.$el.hide();

    this.pos = null;
    this.entries = null;
    this.$entries = [ ];

    this.active = null;
    this.$submenu = null;
    this.submenu = null;

    this.listeners = [ ];
};

Menu.prototype._entryClicked = function(event) {

    let entry  = event.data.entry;
    let $entry = event.data.$entry;

    let nextEvent;
    if (entry.op) {
        nextEvent = { type: 'selected', address: entry.address, op: entry.op, target: entry };
        tarp.hide('menu');
    }
    else {
        nextEvent = { type: 'activated', address: entry.address };
    }

    if (this.parent) {
        this._notifyMenuEvent(nextEvent);
    }
    else {
        this._notifyMenuEvent(nextEvent);
        this.$entries.removeClass('active');
        $entry.addClass('active');
        this.active = entry;
        this._showSubMenu();
    }
};

Menu.prototype._notifyMenuEvent = function(event) {
    if (this.parent) {
        this.parent._notifyMenuEvent(event);
    }
    else {
        for (let listener of this.listeners)
            listener(event);
        if (event.type === 'selected')
            this.hide();
    }
};

Menu.prototype.onMenuEvent = function(listener) {
    this.listeners.push(listener);
};

Menu.prototype.show = function(pos) {

    let finalPos = { };

    if (pos.clickPos) {
        let height = this.$el.height();
        let width = this.$el.width();
        let entryHeight = height / this.entries.length;

        finalPos.top = pos.clickPos.top - height + (entryHeight / 3);
        finalPos.left = pos.clickPos.left - width / 2;
    }
    else {
        finalPos = pos.topLeft;
    }

    if (finalPos.left < 10)
        finalPos.left = 10;
    this.pos = finalPos;
    this.$el.css(finalPos);
    this.$el.show();

    if ( ! this.parent)
        tarp.show('menu').then(() => {}, () => this.hide());

    this._showSubMenu();
};

Menu.prototype.hide = function() {
    this.$el.hide();

    for (let listener of this.listeners)
        listener({ type: 'activated', address: null });
};

Menu.prototype.setup = function(entries) {

    this.active = null;
    this.entries = entries;

    this.$el.empty();

    let $list = $('<ul></ul>');
    this.$el.append($list);

    for (let entry of this.entries) {
        if (entry.active)
            this.active = entry;

        let html = '';

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

        let $entry = $(html);
        $entry.appendTo($list);

        $entry.on('click', null, { entry, $entry }, event => this._entryClicked(event));
    }

    this.$entries = this.$el.find('.silky-menu-entry');

    this._createSubMenu();
};

Menu.prototype._createSubMenu = function() {
    this.$submenu = $('<div></div>');
    this.submenu = new Menu(this.$submenu, this);
    this.$el.append(this.$submenu);
};

Menu.prototype._showSubMenu = function() {
    if (this.active === null)
        return;

    let ops = [
        {
            label  : _('Copy'),
            op     : 'copy',
            address: this.active.address,
            type   : this.active.type,
            title  : this.active.title,
        },
        {
            label  : _('Save'),
            op     : 'save',
            address: this.active.address,
            type   : this.active.type,
            title  : this.active.title,
        },
    ];

    if (this.active.address.length === 0)  // the analysis
        ops.push({ label: _('Remove'), op: 'remove', address: this.active.address, type: 'Analysis' });

    this.submenu.setup(ops);

    let borderTopWidth = parseInt(this.$el.css('borderTopWidth'));
    let borderRightWidth = parseInt(this.$el.css('borderRightWidth'));
    let subPos = { left: this.$el.width() + 3, top: 0 - borderTopWidth };
    this.submenu.show({ topLeft: subPos });
};

module.exports = Menu;
