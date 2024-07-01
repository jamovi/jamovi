
'use strict';

const RibbonButton = require('./ribbonbutton');
const RibbonSeparator = require('./ribbonseparator');
const RibbonGroup = require('./ribbongroup');
const EventEmitter = require('events');

const $ = require('jquery');

class RibbonTab extends EventEmitter {
    constructor(name, shortcutPath, title) {
        super();

        this.name = name;
        this.shortcutPath = shortcutPath;
        this.title = title;

        this.$ribbon = $(`<div class="jmv-ribbon-menu"></div>`);
        this.$separator = $('<div class="jmv-ribbon-button-separator"></div>').appendTo(this.$ribbon);

        this.populate();
    }

    update() {
        this.populate();
    }

    detachItems() {
        this.$ribbon.detach();
    }

    async populate() {
        let items = this.getRibbonItems();
        if (Array.isArray(items))
            this.populateFromList(items);
        else {
            items.then((items) => {
                this.populateFromList(items);
            });
        }
    }

    populateFromList(items) {
        this.$ribbon.empty();
        this.$separator = $('<div class="jmv-ribbon-button-separator"></div>').appendTo(this.$ribbon);

        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            if (item.setParent)
                item.setParent(this, this.shortcutPath.toUpperCase());
            if (item.setTabName)
                item.setTabName(this.name);

            if (item.dock === 'right')
                item.$el.insertAfter(this.$separator);
            else
                item.$el.insertBefore(this.$separator);

            if (item.getMenus) {
                let subMenus = item.getMenus();
                for (let subMenu of subMenus){
                    if (!subMenu.connected)
                        subMenu.connect(null);
                }
            }
        }
    }
}

module.exports = RibbonTab;
