
'use strict';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import RibbonGroup from '../ribbon/ribbongroup';
import focusLoop from '../../common/focusloop';
import Menu from '../../common/menu';

import ActionHub from '../actionhub';
import { RibbonItem } from '../ribbon/ribbontab';

export interface ContextMenuButtonOptions {
    title?: string;
    name: string;
    right?: boolean;
    level?: number;
    useActionHub?: boolean;
    enabled?: boolean;
    iconId?: string;
    tabName?: string;
    size?: 'medium' | 'small';
    eventData?: any;
    subItems?: any[];
}
import ButtonElement from '../utils/buttonelement';
import { s6e } from '../../common/utils';

export class ContextMenuButton extends ButtonElement implements RibbonItem {
    eventData: any;
    menu: Menu
    _menuGroup: RibbonGroup;
    dock: 'left' | 'right';
    useActionHub: boolean;
    _enabled: boolean;
    _iconId: string;
    tabName: string;
    size: string;
    level: number;
    _definedTabName: boolean;
    name: string;
    labelId: string;


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
    }
    */

    constructor(options: ContextMenuButtonOptions) {
        super();

        let title = options.title === undefined ? null : options.title;
        let name = options.name;
        let size = options.size === undefined ? 'medium' : options.size;
        let right = options.right === undefined ? false : options.right;
        let level = options.level === undefined ? 0 : options.level;
        this.eventData = options.eventData  === undefined ? null : options.eventData;
        this.useActionHub = options.useActionHub  === undefined ? true : options.useActionHub;
        this._enabled = options.enabled === undefined ? true : options.enabled;
        this._iconId = options.iconId === undefined ? null : options.iconId;

        this.classList.add('jmv-ribbon-button', 'jmv-context-menu-button');
        this.classList.add('jmv-ribbon-button-size-' + size);
        this.setAttribute('tabindex', '0');
        this.setAttribute('role', 'menuitem');
        this.id = focusLoop.getNextAriaElementId('menu-btn');
        this.setAttribute('id', this.id);

        this.labelId = focusLoop.getNextAriaElementId('label');

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

        if (this.size === 'small' && this.title !== null)
            this.setAttribute('title', this.title);

        this.setAttribute('data-name', this.name.toLowerCase());
        if (this._iconId !== null)
            this.setAttribute('data-icon', this._iconId.toLowerCase());
        if (this._enabled === false)
            this.setAttribute('aria-disabled', 'true');
        if (right)
            this.classList.add('right');

        focusLoop.createHoverItem(this, () => {
            if (this.menu)
                this.showMenu(true);
            else
                this.focus({preventScroll:true});
        });

        this.addEventListener('mousedown', event => {
            if (this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.addEventListener('mouseup', event => {
            if ( ! this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space')
                this._clicked(event, false);
            else {
                if (event.code == (document.body.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight') && this._menuGroup !== undefined)
                    this._clicked(event, false);
            }
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
    }

    setTabName(name) {
        if (this._definedTabName === false)
            this.tabName = name;

        if (this._menuGroup !== undefined)
            this._menuGroup.setTabName(name);
    }

    setEnabled(enabled) {
        this._enabled = enabled;
        if (enabled)
            this.removeAttribute('aria-disabled');
        else
            this.setAttribute('aria-disabled', 'true');
    }

    _clicked(event, fromMouse) {

        if (this.menu && this.menu.contains(event.target))
            return;

        this.dispatchEvent(new CustomEvent<ContextMenuButton>('menuClicked', { bubbles: true, detail: this }));

        let action = null;
        if (this.useActionHub)
            action = ActionHub.get(this.name);

        if (this._enabled) {
            if (this._menuGroup !== undefined)
                this.showMenu(fromMouse);
            else {
                if (action !== null)
                    action.do();

                const event = new CustomEvent('menuActioned', { bubbles: true });
                this.dispatchEvent(event);
            }
        }

        event.preventDefault();
    }

    addItem(item: RibbonItem) {
        if (this._menuGroup === undefined) {
            this.menu = new Menu(this, this.level + 1, { exitKeys: ['InlineArrowLeft'] });

            this.append(HTML.create('div', { class: 'jmv-context-menu-arrow' }));

            this._menuGroup = new RibbonGroup({ orientation: 'vertical' });
            this.menu.append(this._menuGroup);
            this.menu.setAttribute('aria-labelledby', this.id);
        }

        this._menuGroup.addItem(item);

        if (item.getMenus) {
            let subMenus = item.getMenus();
            for (let subMenu of subMenus){
                if (!subMenu.connected)
                    subMenu.connect(this.menu);
            }
        }
    }

    getMenus() {
        if (this.menu)
            return [ this.menu ];
        return [];
    }

    _refresh() {
        let html = '';
        html += '   <div class="jmv-ribbon-button-icon"></div>';
        if (this.size === 'medium' || this.size === 'large') {
            html += `   <div id="${this.labelId}" class="jmv-ribbon-button-label">${s6e(this.title)}</div>`;
            if ( ! this.ariaLabel)
                this.setAttribute('aria-labelledby', this.labelId);
        }
        else
            this.setAttribute('aria-label', this.ariaLabel || this.title);
        this.innerHTML = html;
    }

    hideMenu(fromMouse?: boolean) {
        if ( ! this.menu)
            return;

        this.menu.hide(fromMouse);
    }

    showMenu(fromMouse?: boolean) {
        if ( ! this.menu)
            return;

        const rect = this.getBoundingClientRect();
        const style = getComputedStyle(this);

        let x = rect.left + window.scrollX + this.offsetWidth +
                parseFloat(style.marginLeft) + parseFloat(style.marginRight);

        if (style.direction === 'rtl')
            x -= rect.width;

        const y = rect.top + window.scrollY;

        this.menu.show(x, y, { withMouse: fromMouse });
    }

    getEntryButton(openPath: string[], open: boolean, fromMouse?: boolean) {
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
    }

    _toggleMenu(fromMouse?: boolean) {
        if (this.menu.isVisible())
            this.hideMenu(fromMouse);
        else
            this.showMenu(fromMouse);
    }
}

customElements.define('jmv-context-menu-button', ContextMenuButton, { extends: 'button' });

export default ContextMenuButton;
