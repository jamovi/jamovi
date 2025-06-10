
'use strict';

import { HTMLElementCreator as HTML }  from '../htmlelementcreator';
import { EventEmitter } from 'events';

export class ToolbarGroup extends EventEmitter {
    el: HTMLElement;
    separator: HTMLElement;

    constructor(params) {
        super();

        this.params = params;

        this._render(params);
    }

    /*
    params
    {
        title:          //Title to be displayed by the group. Make '' for not title but leave space or null for no title and no space.
        orientation:    //How are the contents displayed 'vertical' or 'horizontal' (default)
        right:          //Is the button docked to the right? [default: false]
        el:            //jquery element. Will create if missing.
        items:          //Array of menu items. Not needed, can use 'addItem'.
    }
    */
    

    _render(params) {

        let title = params.title === undefined ? null : params.title;
        let orientation = params.orientation === undefined ? 'horizontal' : params.orientation;
        let right = params.right === undefined ? false : params.right;
        let el = params.el === undefined ? HTML.create('div') : params.el;
        let classes = params.classes === undefined ? '' : params.classes;

        this.el = el;
        this.el.classList.add('jmv-toolbar-group');
        if (classes.trim() !== '')
            this.el.classList.add(...classes.split(' '));
        if (title !== null)
            this.el.classList.add('titled');

        this.title = title;
        this.dock = right ? 'right' : 'left';

        this.el.setAttribute('aria-disabled', 'true');
        if (right)
            this.el.classList.add('right');

        this.items = [];

        let body = HTML.create('div', { class: `jmv-toolbar-group-body jmv-toolbar-group-body-${orientation}` });
        this.el.append(body);
        if (title !== null) {
            let label = HTML.create('div', { class: 'jmv-toolbar-group-label' }, title);
            this.el.append(label);
        }

        this.separator = HTML.create('div', { class: 'jmv-toolbar-button-separator' });
        body.append(this.separator);

        if (params.items !== undefined) {
            for (let i = 0; i < params.items.length; i++)
                this.addItem(params.items[i]);
        }
    }

    setParent(root, parent) {
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (item.setParent)
                item.setParent(root, parent);
        }
    };

    addItem(item) {
        this.items.push(item);

        if (item.dock === 'right')
            this.separator.after(item.el);
        else
            this.separator.before(item.el);
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

export default ToolbarGroup;
