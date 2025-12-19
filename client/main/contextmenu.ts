
'use strict';

import ContextMenus from './contextmenu/contextmenus';
import focusLoop from '../common/focusloop';
import Menu from '../common/menu';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { EventEmitter } from 'events';
import { RibbonItem } from './ribbon/ribbontab';
import { ResultsContextMenuItem } from '../common/contextmenutypes';


export class ContextMenu extends EventEmitter { // this is constructed at the bottom
    el: HTMLElement;
    menu: Menu;
    _showing: boolean = false;
    buttons: any[];
    separator: HTMLElement;

    constructor() {
        super();

        this.menu = new Menu(null, 0, { exitKeys: ['InlineArrowLeft'] });
        this.el = this.menu;
        this.el.setAttribute('hloop', 'false');
    
        this.menu.addEventListener('menu-hidden', (event: CustomEvent) => {
            if (! this._showing && event.target === this.menu)
                this.emit('menu-hidden', event.detail);
        } );
        this.el.addEventListener('menuActioned', () => {
            this.menu.hide(true); 
        });
    }

 
    show(menuItems:RibbonItem[], x:number, y:number, anchor='left', openPath=[]) {

        this.buttons = [ ];

        this._showing = true;

        this.el.innerHTML = '';
        this.separator = HTML.create('div', { class: 'jmv-click-menu-separator' });
        this.el.append(this.separator);

        let openButton: RibbonItem = null;

        for (let i = 0; i < menuItems.length; i++) {
            let button = menuItems[i];

            if (button.getMenus) {
                let subMenus = button.getMenus();
                for (let subMenu of subMenus) {
                    if (!subMenu.connected)
                        subMenu.connect(this.menu);
                }
            }

            if (button.dock === 'right')
                this.separator.after(button);
            else
                this.separator.before(button);

            this.buttons.push(button);

            if (openButton === null && button.getEntryButton)
                openButton = button.getEntryButton(openPath, false);
        }

        setTimeout(() => {
            if (openButton !== null) {
                const style = getComputedStyle(this.el);
                const width = this.el.offsetWidth + parseFloat(style.marginLeft) + parseFloat(style.marginRight);
                if (style.direction === 'rtl')
                    x += width - 10;
                else
                    x -= width - 10;
                const top = openButton.offsetTop ;
                y -= top + 10;
            }

            this.menu.show(x, y, { withMouse: true });
            this._showing = false;

            if (openButton !== null)
                openButton.getEntryButton(openPath, true, true);
            else
                focusLoop.enterFocusLoop(this.el, { withMouse: true });
        }, 0);
    }

    showDataRowMenu(x:number, y:number, plural) {
        this.show(ContextMenus.createRowMenuItems(plural), x, y);
    }

    showFilterRowMenu(x:number, y:number) {
        this.show(ContextMenus.createFilterRowMenuItems(), x, y);
    }

    showVariableMenu(x:number, y:number, plural, noData?) {
        this.show(ContextMenus.createVariableMenuItems(plural, noData), x, y);
    }

    showAppendVariableMenu(x:number, y:number, anchor) {
        this.show(ContextMenus.createAppendVariableMenuItems(), x, y, anchor);
    }

    showFilterMenu(x:number, y:number, noData?) {
        this.show(ContextMenus.createFilterMenuItems(noData), x, y);
    }

    showResultsMenu(entries: ResultsContextMenuItem[], x:number, y:number) {
        let menu = ContextMenus.createResultsObjectMenuItems(entries);
        let openPath = [];
        if (menu[0].items.length > 0)
            openPath.push(menu[0].items[menu[0].items.length-1].name);

        this.show(menu, x, y, 'left', openPath);
    }

    isVisible() {
        return this.menu.isVisible();
    }
}

let _menu = new ContextMenu();
document.addEventListener('DOMContentLoaded', () => {
    _menu.menu.connect();
});

export default _menu;
