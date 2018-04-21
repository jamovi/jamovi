
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
const RibbonGroup = require('./ribbongroup');

const ActionHub = require('../actionhub');

const RibbonButton = Backbone.View.extend({

    /*
    params
    {
        title:      //Title to be displayed
        name:       //Button Id used in action event  REQUIRED!
        tabName:    //Tab in which the button lives (namespace). Will add if not specified.
        size:       //'small', 'medium', 'large', 'huge' [default: medium]
        right:      //Is the button docked to the right? [default: false]
        $el:        //jquery element. Will create if not defined.
    }
    */

    initialize(params) {

        let title = params.title === undefined ? null : params.title;
        let name = params.name;
        let size = params.size === undefined ? 'medium' : params.size;
        let right = params.right === undefined ? false : params.right;
        let margin =  params.margin === undefined ? 'normal' : params.margin;
        let $el = params.$el === undefined ? $('<div></div>') : params.$el;

        this.$el = $el;
        this.$el.addClass('jmv-ribbon-button');
        this.$el.addClass('jmv-ribbon-button-size-' + size);
        this.$el.addClass('jmv-ribbon-button-margin-' + margin);

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
        this.$el.attr('disabled');
        if (right)
            this.$el.addClass('right');

        this.$el.on('click', event => this._clicked(event));

        this._refresh();

        if (params.subItems !== undefined) {
            for (let i = 0; i < params.subItems.length; i++)
                this.addItem(params.subItems[i]);
        }

        let action = ActionHub.get(name);
        this.setEnabled(action.get('enabled'));
        action.on('change:enabled', (event) => {
            this.setEnabled(event.changed.enabled);
        });

        if (this.size === 'small' && this.title !== null)
            this.$el.attr('title', this.title);
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
        if (enabled)
            this.$el.removeAttr('disabled');
        else
            this.$el.attr('disabled', '');
    },
    _clicked(event) {

        let $target = $(event.target);
        if ($target.closest(this.$menu).length !== 0)
            return;

        let action = ActionHub.get(this.name);

        if ( ! action.attributes.enabled)
            ; // do nothing
        else if (this._menuGroup !== undefined)
            this._toggleMenu();
        else {
            action.do();
            this.$el.trigger('menuActioned');
        }

        event.stopPropagation();
    },

    addItem(item) {
        if (this._menuGroup === undefined) {
            let $menugroup = $('<div></div>');
            this._menuGroup = new RibbonGroup({ orientation: 'vertical', $el: $menugroup });
            this.$menu.append(this._menuGroup.$el);
            $('<div class="jmv-ribbon-menu-arrow"></div>').insertBefore(this.$menu);
        }

        this._menuGroup.addItem(item);
    },

    _refresh() {
        let html = '';
        html += '   <div class="jmv-ribbon-button-icon"></div>';
        if (this.size === 'medium' || this.size === 'large')
            html += '   <div class="jmv-ribbon-button-label">' + this.title + '</div>';

        html += '   <div class="jmv-ribbon-button-menu" style="display: none ;">';
        html += '   </div>';

        this.$el.html(html);

        this.$menu   = this.$el.find('.jmv-ribbon-button-menu');
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
});

module.exports = RibbonButton;
