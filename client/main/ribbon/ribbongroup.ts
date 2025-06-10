
'use strict';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
const ActionHub = require('../actionhub');
const focusLoop = require('../../common/focusloop');
import { EventEmitter } from 'events';

export class RibbonGroup extends EventEmitter {
    el: HTMLElement;
    name: string;
    title: string;
    dock: 'right' | 'left';

    /*
    params
    {
        title:          //Title to be displayed by the group. Make '' for not title but leave space or null for no title and no space.
        orientation:    //How are the contents displayed 'vertical' or 'horizontal' (default)
        titlePosition:  //Title at the 'top' or 'bottom' (default)
        right:          //Is the button docked to the right? [default: false]
        margin:         //defines the size of the left right magins [default: normal]
        el:            //HTML element. Will create if missing.
        items:          //Array of menu items. Not needed, can use 'addItem'.
        align-contents: // [default: stretch]
    }
    */

    constructor(params) {
        super();
        let title = params.title === undefined ? null : params.title;
        let orientation = params.orientation === undefined ? 'horizontal' : params.orientation;
        let right = params.right === undefined ? false : params.right;
        let el = params.el === undefined ? HTML.create('div') : params.el;
        let titlePosition =  params.titlePosition === undefined ? 'bottom' : params.titlePosition;
        let margin =  params.margin === undefined ? 'normal' : params.margin;
        let align = params.alignContents === undefined ? (orientation === 'horizontal' ? 'center' : 'stretch') : params.alignContents;
        let name = params.name === undefined ? null : params.name;

        let labelId = focusLoop.getNextAriaElementId('label');

        this.el = el;
        this.el.classList.add('jmv-ribbon-group');
        this.el.classList.add('jmv-ribbon-group-margin-' + margin);
        if (title !== null) {
            this.el.setAttribute('data-position', titlePosition);
            this.el.setAttribute('aria-labelledby', labelId);
            this.el.setAttribute('role', 'group');
        }
        else
            this.el.setAttribute('role', 'group');
        this.el.setAttribute('aria-orientation', orientation);

        if (name !== null)
            this.el.setAttribute('data-name', this.name.toLowerCase());

        this.name = name;
        this.title = title;
        this.dock = right ? 'right' : 'left';

        //this.el.setAttribute('aria-disabled', true);
        if (right)
            this.el.classList.add('right');

        this.items = [];

        this.body = HTML.create('div', { class: `jmv-ribbon-group-body jmv-ribbon-group-body-${orientation}`, style: `style="align-items:${align};"`, role: 'none'});
        this.el.append(this.body);
        if (title !== null)
            this.el.append(HTML.create('div', { class: 'jmv-ribbon-group-label', id: labelId }, title));

        if (params.items !== undefined) {
            for (let i = 0; i < params.items.length; i++)
                this.addItem(params.items[i]);
        }
    }
    
    setParent(parent, parentShortcutPath, inMenu) {
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (item.setParent)
                item.setParent(parent, parentShortcutPath, inMenu);
        }
    }

    setTabName(name) {
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (item.setTabName)
                item.setTabName(name);
        }
    }

    getEntryButton(openPath, open, fromMouse) {
        if (openPath.length > 0) {
            for (let item of this.items) {
                if (item.getEntryButton) {
                    let openedItem = item.getEntryButton(openPath, open, fromMouse);
                    if (openedItem !== null)
                        return openedItem;
                }
            }
        }
        return null;
    }

    addItem(item) {
        this.items.push(item);

        if (this.separator === undefined && item.dock === 'right') {
            this.separator = HTML.create('div', { class: 'jmv-ribbon-button-separator' });
            this.body.append(this.separator)
        }

        if (item.dock === 'right')
            this.separator.after(item.el);
        else {
            if (this.separator === undefined)
                this.body.append(item.el);
            else
                this.separator.before(item.el);
        }

        item.on('menuActioned', (item) => {
            if (this.name !== null) {
                let action = ActionHub.get(this.name);
                action.do(item);
            }
            this.emit('menuActioned', item);
        });
    }

    hideMenu() {
        for (let item of this.items) {
            if (item.hideMenu)
                item.hideMenu();
        }
    }

    setEnabled(enabled) {
        this.el.setAttribute('aria-disabled', (! enabled).toString());
    }

    getMenus() {
        let menus = [];
        for (let item of this.items) {
            if (item.getMenus)
                menus = menus.concat(item.getMenus());
        }
        return menus;
    }
}

export default RibbonGroup;
