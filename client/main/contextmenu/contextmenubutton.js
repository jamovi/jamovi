
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const RibbonGroup = require('../ribbon/ribbongroup');

const ActionHub = require('../actionhub');

const ContextMenuButton = Backbone.View.extend({

    /*
    options
    {
        title:      //Title to be displayed
        name:       //Button Id used in action event  REQUIRED!
        tabName:    //Tab in which the button lives (namespace). Will add if not specified.
        iconId:     //id of the icon to use. If null no icon will be used.
        right:      //Is the button docked to the right? [default: false]
        eventData:  //Data shared on events
        useActionHub: //Should actionHub be called using the menu item name
        enabled:    //initial enabled state
        $el:        //jquery element. Will create if not defined.
    }
    */

    initialize(options) {

        let title = options.title === undefined ? null : options.title;
        let name = options.name;
        let size = 'medium';
        let right = options.right === undefined ? false : options.right;
        let $el = options.$el === undefined ? $('<div></div>') : options.$el;

        this.eventData = options.eventData  === undefined ? null : options.eventData;
        this.useActionHub = options.useActionHub  === undefined ? true : options.useActionHub;
        this._enabled = options.enabled === undefined ? true : options.enabled;
        this._iconId = options.iconId === undefined ? null : options.iconId;

        this.$el = $el;
        this.$el.addClass('jmv-ribbon-button jmv-context-menu-button');
        this.$el.addClass('jmv-ribbon-button-size-' + size);

        this.tabName = null;
        this._definedTabName = false;
        if (options.tabName !== undefined) {
            this.tabName = options.tabName;
            this._definedTabName = true;
        }

        this.size = size;
        this.title = title;
        this.name = name;
        this.dock = right ? 'right' : 'left';

        this.$el.attr('data-name', this.name.toLowerCase());
        if (this._iconId !== null)
            this.$el.attr('data-icon', this._iconId.toLowerCase());
        this.$el.attr('disabled');
        if (right)
            this.$el.addClass('right');

        this.$el.on('click', event => {
            this._clicked(event);
        });

        this._refresh();

        if (options.subItems !== undefined) {
            for (let i = 0; i < options.subItems.length; i++)
                this.addItem(options.subItems[i]);
        }

        if (this.useActionHub) {
            let action = ActionHub.get(name);
            this.setEnabled(action.get('enabled'));
            action.on('change:enabled', (event) => {
                if ('enabled' in event.changed)
                    this.setEnabled(event.changed.enabled);
            });
        }
    },
    setParent(parent) {
        this.parent = parent;

        if (this._menuGroup !== undefined)
            this._menuGroup.setParent(parent);
    },
    setTabName(name) {
        if (this._definedTabName === false)
            this.tabName = name;

        if (this._menuGroup !== undefined)
            this._menuGroup.setTabName(name);
    },
    setEnabled(enabled) {
        this._enabled = enabled;
        if (enabled)
            this.$el.removeAttr('disabled');
        else
            this.$el.attr('disabled', '');
    },
    _clicked(event) {

        let $target = $(event.target);
        if ($target.closest(this.$menu).length !== 0)
            return;

        this.$el.trigger('menuClicked', this);

        let action = null;
        if (this.useActionHub)
            action = ActionHub.get(this.name);

        if (this._enabled) {
            if (this._menuGroup !== undefined)
                this._toggleMenu();
            else {
                if (action !== null)
                    action.do();
                this.$el.trigger('menuActioned');
            }
        }

        event.stopPropagation();
        event.preventDefault();
    },

    addItem(item) {
        if (this._menuGroup === undefined) {
            let $menugroup = $('<div></div>');
            this._menuGroup = new RibbonGroup({ orientation: 'vertical', $el: $menugroup });
            this.$menu.append(this._menuGroup.$el);
            $('<div class="jmv-context-menu-arrow"></div>').insertBefore(this.$menu);
        }

        this._menuGroup.addItem(item);
    },

    _refresh() {
        let html = '';
        html += '   <div class="jmv-ribbon-button-icon"></div>';
        html += '   <div class="jmv-ribbon-button-label">' + this.title + '</div>';
        html += '   <div class="jmv-ribbon-button-menu context-menu jmv-context-menu-hidden">';
        html += '   </div>';

        this.$el.html(html);

        this.$menu   = this.$el.find('.jmv-ribbon-button-menu');
    },


    hideMenu() {
        this.menuVisible = false;
        this.$el.removeClass('active');
        this.$menu.addClass('jmv-context-menu-hidden');
    },
    showMenu() {
        this.trigger('shown', this);
        this.$el.removeClass('contains-new');
        this.$el.addClass('active');
        this.menuVisible = true;

        this.$menu.removeClass('jmv-context-menu-hidden');
        let x = this.$el.offset().left + this.$el.outerWidth(true);
        let y = this.$el.offset().top;

        this.$menu.removeClass('up');
        this.$menu.removeClass('down');
        if (y + this.$menu.outerHeight(true) > window.innerHeight)
            this.$menu.addClass('up');
        else
            this.$menu.addClass('down');

        this.$menu.removeClass('left');
        this.$menu.removeClass('right');
        if (x + this.$menu.outerWidth(true) > window.innerWidth)
            this.$menu.addClass('left');
        else
            this.$menu.addClass('right');
    },
    getEntryButton(openPath, open) {
        if (this.name === openPath[0]) {
            if (open)
                this.showMenu();
            openPath = openPath.slice(1);
            if (openPath.length > 0) {
                for (let item of this._menuGroup.items) {
                    if (item.getEntryButton && item.getEntryButton(openPath, open) !== null)
                        break;
                }
            }
            return this;
        }
        return null;
    },
    _toggleMenu() {
        if (this.menuVisible)
            this.hideMenu();
        else
            this.showMenu();
    },
});

module.exports = ContextMenuButton;
