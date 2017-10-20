
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const RibbonGroup = require('../ribbon/ribbongroup');

const ActionHub = require('../actionhub');

const ContextMenuButton = Backbone.View.extend({

    /*
    params
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

    initialize(params) {

        let title = params.title === undefined ? null : params.title;
        let name = params.name;
        let size = 'medium';
        let right = params.right === undefined ? false : params.right;
        let $el = params.$el === undefined ? $('<div></div>') : params.$el;

        this.eventData = params.eventData  === undefined ? null : params.eventData;
        this.useActionHub = params.useActionHub  === undefined ? true : params.useActionHub;
        this._enabled = params.enabled === undefined ? true : params.enabled;
        this._iconId = params.iconId === undefined ? null : params.iconId;

        this.$el = $el;
        this.$el.addClass('jmv-ribbon-button jmv-context-menu-button');
        this.$el.addClass('jmv-ribbon-button-size-' + size);

        this.tabName = null;
        this._definedTabName = false;
        if (params.tabName !== undefined) {
            this.tabName = params.tabName;
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

        if (params.subItems !== undefined) {
            for (let i = 0; i < params.subItems.length; i++)
                this.addItem(params.subItems[i]);
        }

        if (this.useActionHub) {
            let action = ActionHub.get(name);
            this.setEnabled(action.get('enabled'));
            action.on('change:enabled', (event) => {
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
        html += '   <div class="jmv-ribbon-button-menu context-menu" style="display: none ;">';
        html += '   </div>';

        this.$el.html(html);

        this.$menu   = this.$el.find('.jmv-ribbon-button-menu');
    },


    hideMenu() {
        this.$menu.hide();
        this.menuVisible = false;
        this.$el.removeClass('active');
    },
    showMenu() {
        this.trigger('shown', this);
        this.$el.removeClass('contains-new');
        this.$el.addClass('active');
        this.$menu.show();
        this.menuVisible = true;
    },
    openPath(openPath) {
        if (this.name === openPath[0]) {
            this.showMenu();
            openPath = openPath.slice(1);
            if (openPath.length > 0) {
                for (let item of this._menuGroup.items) {
                    if (item.openPath && item.openPath(openPath) !== null)
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
