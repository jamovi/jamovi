
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const RibbonGroup = require('../ribbon/ribbongroup');
const focusLoop = require('../../common/focusloop');
const Menu = require('../../common/menu');

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
        let level = options.level === undefined ? 0 : options.level;
        let $el = options.$el === undefined ? $('<button></button>') : options.$el;

        this.eventData = options.eventData  === undefined ? null : options.eventData;
        this.useActionHub = options.useActionHub  === undefined ? true : options.useActionHub;
        this._enabled = options.enabled === undefined ? true : options.enabled;
        this._iconId = options.iconId === undefined ? null : options.iconId;

        this.$el = $el;
        this.$el.addClass('jmv-ribbon-button jmv-context-menu-button');
        this.$el.addClass('jmv-ribbon-button-size-' + size);
        this.$el.attr('tabindex', '0');
        this.$el.attr('role', 'menuitem');

        this.tabName = null;
        this._definedTabName = false;
        if (options.tabName !== undefined) {
            this.tabName = options.tabName;
            this._definedTabName = true;
        }

        this.size = size;
        this.title = title;
        this.name = name;
        this.level = level;
        this.dock = right ? 'right' : 'left';

        this.$el.attr('data-name', this.name.toLowerCase());
        if (this._iconId !== null)
            this.$el.attr('data-icon', this._iconId.toLowerCase());
        this.$el.attr('aria-disabled');
        if (right)
            this.$el.addClass('right');

        focusLoop.createHoverItem(this, () => {
            if (this.menu)
                this.showMenu(true);
            else
                this.$el[0].focus({preventScroll:true});
        });

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
            else if (event.code == 'ArrowRight' && this._menuGroup !== undefined)
                this._clicked(event, false);
            else if (event.code == 'ArrowLeft' && this.parent)
                this.parent.hideMenu(event, false);
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
            this.$el.removeAttr('aria-disabled');
        else
            this.$el.attr('aria-disabled', true);
    },
    _clicked(event, fromMouse) {

        let $target = $(event.target);
        if (this.menu && $target.closest(this.menu.$el).length !== 0)
            return;

        this.$el.trigger('menuClicked', this);

        let action = null;
        if (this.useActionHub)
            action = ActionHub.get(this.name);

        if (this._enabled) {
            if (this._menuGroup !== undefined)
                this.showMenu(fromMouse);
            else {
                if (action !== null)
                    action.do();
                this.$el.trigger('menuActioned');
            }
        }

        event.preventDefault();
    },

    addItem(item) {
        if (this._menuGroup === undefined) {
            this.menu = new Menu(this.$el[0], this.level + 1, { exitKeys: ['ArrowLeft'] });

            $('<div class="jmv-context-menu-arrow"></div>').appendTo(this.$el);

            let $menugroup = $('<div></div>');
            this._menuGroup = new RibbonGroup({ orientation: 'vertical', $el: $menugroup });
            this.menu.$el.append(this._menuGroup.$el);
        }

        this._menuGroup.addItem(item);

        if (item.getMenus) {
            let subMenus = item.getMenus();
            for (let subMenu of subMenus){
                if (!subMenu.connected)
                    subMenu.connect(this.menu);
            }
        }
    },

    getMenus() {
        if (this.menu)
            return [ this.menu ];
        return [];
    },

    _refresh() {
        let html = '';
        html += '   <div class="jmv-ribbon-button-icon"></div>';
        html += '   <div class="jmv-ribbon-button-label">' + this.title + '</div>';

        this.$el.html(html);
    },

    hideMenu(fromMouse) {
        if ( ! this.menu)
            return;

        this.menu.hide(fromMouse);
    },

    showMenu(fromMouse) {
        if ( ! this.menu)
            return;

        let x = this.$el.offset().left + this.$el.outerWidth(true);
        let y = this.$el.offset().top;

        this.menu.show(x, y, { withMouse: fromMouse });
    },
    getEntryButton(openPath, open, fromMouse) {
        if (this.name === openPath[0]) {
            if (open)
                this.showMenu(fromMouse);
            openPath = openPath.slice(1);
            if (openPath.length > 0) {
                for (let item of this._menuGroup.items) {
                    if (item.getEntryButton && item.getEntryButton(openPath, open, fromMouse) !== null)
                        break;
                }
            }
            return this;
        }
        return null;
    },
    _toggleMenu(fromMouse) {
        if (this.menu.isVisible())
            this.hideMenu(fromMouse);
        else
            this.showMenu(fromMouse);
    },
});

module.exports = ContextMenuButton;
