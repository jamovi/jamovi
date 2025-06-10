
'use strict';

import { HTMLElementCreator as HTML }  from '../htmlelementcreator';
import { EventEmitter } from 'events';
import ToolbarButton from './toolbarbutton';

export class Toolbar extends EventEmitter {
    el: HTMLElement;
    separator: HTMLElement;

    constructor(items) {
        super();

        this.items = items;

        this.el = HTML.create('div');

        this.el.classList.add('jmv-toolbar');

        this.el.addEventListener('buttonClicked', (event: CustomEvent<ToolbarButton>) => {
            this._buttonClicked(event.detail);
        } );

        this._rendered = false;

        this.render(items);
    }

    getLevel() {
        return 0;
    }

    getParent(level) {
        if (level === 0)
            return this;
    }

    render(items) {

        if (this._rendered)
            return;

        this.el.innerHTML = '';
        this.separator = HTML.create('div', { class: 'mv-toolbar-button-separator' });
        this.el.append(this.separator);

        for (let i = 0; i < items.length; i++) {
            let button = items[i];

            if (button.getMenus) {
                let subMenus = button.getMenus();
                for (let subMenu of subMenus) {
                    if (!subMenu.connected)
                        subMenu.connect(this.menu);
                }
            }

            if (button.setParent)
                button.setParent(this, this);

            if (button.dock === 'right')
                this.separator.after(button.el);
            else
                this.separator.before(button.el);
        }

        this._rendered = true;
    }

    _menuClosed() {
        this.el.style.zIndex = '';
        this._tarpVisible = false;
        for (let button of this.items) {
            if (button.hideMenu)
                button.hideMenu();
        }
        this.el.focus();
    };

    _buttonClicked(action) {
        console.log(action);
        if (action._menuGroup === undefined)
            this._menuClosed();
        else {
            let child = action;
            let parent = child.getParent();
            while (parent) {
                for (let button of parent.items) {
                    if (button !== child && button.hideMenu && button.getLevel)
                        button.hideMenu();
                }
                child = parent;
                parent = parent.getParent();
            }
        }
        this.emit("buttonClicked", action);
    }
}

export default Toolbar;
