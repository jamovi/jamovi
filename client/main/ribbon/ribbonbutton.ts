
'use strict';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

import RibbonGroup from './ribbongroup';

import ActionHub from '../actionhub';
import focusLoop, { IShortcutTokenOptions } from '../../common/focusloop';
import Menu from '../../common/menu';
import EventEmitter from 'events';
import { s6e } from '../../common/utils';

export class RibbonButton extends EventEmitter {
    el: HTMLElement;
    value: any;

    /*
    params
    {
        title:      //Title to be displayed
        name:       //Button Id used in action event  REQUIRED!
        tabName:    //Tab in which the button lives (namespace). Will add if not specified.
        size:       //'small', 'medium', 'large', 'huge' [default: medium]
        right:      //Is the button docked to the right? [default: false]
        icon:       //svg to have as an icon
        el:        //jquery element. Will create if not defined.
        class:       //define a type so styling can be customised. It will be added as class attribute.
    }
    */

    constructor(params) {
        super();

        let title = params.title === undefined ? null : params.title;
        let icon = params.icon === undefined ? null : params.icon;
        let name = params.name;
        let size = params.size === undefined ? 'medium' : params.size;
        let right = params.right === undefined ? false : params.right;
        let margin =  params.margin === undefined ? 'normal' : params.margin;
        let classes =  params.class === undefined ? null : params.class;
        let el = params.el === undefined ? HTML.create('button') : params.el;
        let level = params.level === undefined ? 0 : params.level;
        let shortcutKey = params.shortcutKey === undefined ? null : params.shortcutKey.toUpperCase();

        this.el = el;
        this.el.classList.add('jmv-ribbon-button');
        this.el.classList.add('jmv-ribbon-button-size-' + size);
        this.el.classList.add('jmv-ribbon-button-margin-' + margin);
        this.el.setAttribute('tabindex', '0');
        if (params.ariaLabel)
            this.el.setAttribute('aria-label', params.ariaLabel);

        this.labelId = focusLoop.getNextAriaElementId('label');

        if (shortcutKey) {
            this.shortcutKey = shortcutKey.toUpperCase();
            let stcOptions: IShortcutTokenOptions = { key: this.shortcutKey, action: event => this._clicked(event, false), label: params.ariaLabel || title };
            if (params.shortcutPosition)
                stcOptions.position = params.shortcutPosition;
            focusLoop.applyShortcutOptions(this.el, stcOptions);
        }

        if (classes !== null)
            this.el.classList.add(...classes.split(' '));

        this.tabName = null;
        this._definedTabName = false;
        if (params.tabName !== undefined) {
            this.tabName = params.tabName;
            this._definedTabName = true;
        }

        this.icon = icon;
        this.size = size;
        this.title = title;
        this.name = name;
        this.dock = right ? 'right' : 'left';
        this.level = level;
        this.ariaLabel = params.ariaLabel;

        if (icon !== null)
            this.el.classList.add('has-icon');

        this.el.setAttribute('data-name', this.name.toLowerCase());
        this.focusId = focusLoop.getNextFocusId();
        this.el.setAttribute('data-focus-id', this.focusId);
        this.el.setAttribute('aria-disabled', 'true');
        if (right)
            this.el.classList.add('right');

        this.el.addEventListener('mousedown', event => {
            if (this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.el.addEventListener('mouseup', event => {
            if ( ! this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.el.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space')
                this._clicked(event, false);
            else if (event.altKey && event.code == 'ArrowDown' && this._menuGroup !== undefined)
                this._clicked(event, false);
        });

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
            this.el.setAttribute('title', this.title);

        this.value = false;
    }

    render_xml(id, xml_string){
        var doc = new DOMParser().parseFromString(xml_string, 'application/xml');
        var el = document.getElementById(id);
        el.appendChild(
            el.ownerDocument.importNode(doc.documentElement, true)
        );
    }

    setValue(value) {
        this.value = value;
        if (value)
            this.el.classList.add('checked');
        else
            this.el.classList.remove('checked');
    }

    setParent(parent, parentShortcutPath, inMenu) {
        this.parent = parent;

        let shortcutPath = parentShortcutPath;
        if (this.shortcutKey)
            focusLoop.applyShortcutOptions(this.el, { path: parentShortcutPath });

        if (inMenu) {
            this.el.setAttribute('role', 'menuitem');
            this.inMenu = inMenu;

            focusLoop.createHoverItem(this, () => {
                if (this.menu)
                    this.showMenu(true);
                else
                    this.el.focus({preventScroll:true});
            });
        }

        if (this._menuGroup !== undefined)
            this._menuGroup.setParent(parent, shortcutPath + this.shortcutKey, true);
    }

    setTabName(name) {
        if (this._definedTabName === false)
            this.tabName = name;

        if (this._menuGroup !== undefined)
            this._menuGroup.setTabName(name);
    }

    setEnabled(enabled) {
        if (enabled)
            this.el.removeAttribute('aria-disabled');
        else
            this.el.setAttribute('aria-disabled', 'true');
    }

    _clicked(event, fromMouse=false) {
        if (this.menu && this.menu.contains(event.target))
            return;

        let action = ActionHub.get(this.name);

        if ( ! action.attributes.enabled) {

        } // do nothing
        else if (this._menuGroup !== undefined) {
            this._toggleMenu(fromMouse);
            action.do(this);
        }
        else {
            action.do(this);
            this.emit('menuActioned', this);
        }

        event.preventDefault();
    }

    addItem(item) {
        if (this._menuGroup === undefined) {
            this.menu = new Menu(this.el, this.level + 1, { exitKeys: [ 'Alt+ArrowUp'] });

            this.el.setAttribute('role', 'menu');
            this.el.classList.add('has-children');
            let menugroup = HTML.create('div');
            this._menuGroup = new RibbonGroup({ orientation: 'vertical', el: menugroup });

            this.menu.append(this._menuGroup.el);
            this.el.append(HTML.create('div', { class: 'jmv-ribbon-menu-arrow' }));

            this._menuGroup.on('menuActioned', (item) => {
                let action = ActionHub.get(this.name);
                action.do(item);
                this.emit('menuActioned', item);
                this.hideMenu();
            });
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
        html += '   <div class="jmv-ribbon-button-icon" role="none">' + (this.icon === null ? '' : this.icon) + '</div>';
        if (this.size === 'medium' || this.size === 'large') {
            html += `   <div id="${this.labelId}" class="jmv-ribbon-button-label">${s6e(this.title)}</div>`;
            if ( ! this.ariaLabel)
                this.el.setAttribute('aria-labelledby', this.labelId);
        }
        else
            this.el.setAttribute('aria-label', this.ariaLabel || this.title);

        this.el.innerHTML = html;
    }

    hideMenu(fromMouse) {
        if ( ! this.menu)
            return;

        this.menu.hide(fromMouse);
    }

    showMenu(fromMouse) {
        if ( ! this.menu || this.menu.isVisible())
            return;

        this.positionMenu(fromMouse);
        //focusLoop.updateShortcuts();
    }

    _toggleMenu(fromMouse) {
        if (this.menu.isVisible())
            this.hideMenu(fromMouse);
        else 
            this.showMenu(fromMouse);
    }

    positionMenu(fromMouse=false) {
        let rect = this.el.getBoundingClientRect();
        let x = rect.left + window.scrollX + 5;
        let y = rect.top + window.scrollY + this.el.offsetHeight;
        if (this.inMenu) {
            const menuStyle = window.getComputedStyle(this.menu);
            const menuMarginLeft = parseFloat(menuStyle.marginLeft);
            const menuMarginRight = parseFloat(menuStyle.marginRight);
            x += this.menu.offsetWidth + menuMarginLeft + menuMarginRight - 10;
            y -= rect.height + 10;
        }
        this.menu.show(x, y, { withMouse: fromMouse });
    }
}

export default RibbonButton;
