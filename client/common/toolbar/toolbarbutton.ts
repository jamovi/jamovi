
'use strict';

import RibbonGroup from './toolbargroup';
import Menu from '../menu';
import { HTMLElementCreator as HTML }  from '../htmlelementcreator';
import { EventEmitter } from 'events';

export class ToolbarButton extends EventEmitter {
    el: HTMLElement;
    
    constructor(params) {
        super();

        this.params = params;

        let title = params.title === undefined ? null : params.title;
        let name = params.name;
        let size = params.size === undefined ? 'medium' : params.size;
        let right = params.right === undefined ? false : params.right;
        let el = params.el === undefined ? HTML.create('button') : params.el;
        let classes = params.classes === undefined ? '' : params.classes;
        let hasIcon = params.hasIcon === undefined ? true : params.hasIcon;
        let hasMenuArrow = params.hasMenuArrow === undefined ? true : params.hasMenuArrow;

        this.el = el;
        this.el.classList.add('jmv-toolbar-button');
        if (classes.trim() !== '') 
            this.el.classList.add(...classes.split(' '));
        this.el.classList.add('jmv-toolbar-button-size-' + size);

        this.size = size;
        this.title = title;
        this.name = name;
        this.dock = right ? 'right' : 'left';
        this.hasIcon = hasIcon || size === 'small';
        this.hasMenuArrow = hasMenuArrow;
        this._enabled = true;
        this.menuVisible = false;

        this.el.setAttribute('data-name', this.name.toLowerCase());
        if (this._enabled)
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
        });

        this._render();

        if (params.items !== undefined) {
            for (let i = 0; i < params.items.length; i++)
                this.addItem(params.items[i]);
        }

        if (params.items !== undefined)
            this.items = params.items;
    }

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

    getParent(level) {
        if (level === undefined)
            return this.parent;
        else if (level === this._level)
            return this;

        return this.parent.getParent(level);
    }

    getLevel() {
        return this._level;
    }

    setParent(root, parent) {
        this.root = root;
        this.parent = parent;
        this._level = parent.getLevel() + 1;

        if (this._menuGroup !== undefined)
            this._menuGroup.setParent(root, this);
    }

    setEnabled(enabled) {
        if (enabled === false) {
            this.el.classList.add('jmv-toolbar-disabled');
            this.el.setAttribute('aria-disabled', 'true');
        }
        else {
            this.el.classList.remove('jmv-toolbar-disabled');
            this.el.removeAttribute('aria-disabled');
        }

        this._enabled = enabled;
    }

    _clicked(event) {

        if (this._enabled === false)
            return;

        let menuWasVisible = this.menuVisible;
        let clickEvent = new CustomEvent<ToolbarButton>('buttonClicked', { detail: this, bubbles: true });
        this.el.dispatchEvent(clickEvent);

        if (this._menuGroup !== undefined) {
            if (menuWasVisible === false)
                this.showMenu(event.detail > 0);
        }

        event.preventDefault();
    }

    addItem(item) {
        if (this._menuGroup === undefined) {
            this.menu = new Menu(this.el, 1);
            this.menu.addEventListener('buttonClicked', (event) => {
                let clickEvent = new CustomEvent<ToolbarButton>('buttonClicked', { detail: event.detail, bubbles: true });
                this.el.dispatchEvent(clickEvent);
            });

            let menugroup = HTML.create('div');
            this._menuGroup = new RibbonGroup({ orientation: 'vertical', el: menugroup });
            this.menu.append(this._menuGroup.el);
            if (this.hasMenuArrow)
                this.el.append(HTML.create('div', { class: 'jmv-toolbar-menu-arrow' }));
            this.el.classList.add("jmv-toolbar-dropdown");
        }

        this._menuGroup.addItem(item);

        if (item.getMenus) {
            let subMenus = item.getMenus();
            for (let subMenu of subMenus){
                if ( ! subMenu.connected)
                    subMenu.connect(this.menu);
            }
        }
    }

    getMenus() {
        if (this.menu)
            return [ this.menu ];
        return [];
    }

    _render() {
        let html = '';
        if (this.hasIcon)
            html += '   <div class="jmv-toolbar-button-icon"></div>';
        if (this.size === 'medium' || this.size === 'large')
            html += '   <div class="jmv-toolbar-button-label">' + this.title + '</div>';

        this.el.innerHTML = html;
    }

    hideMenu(fromMouse) {
        if ( ! this.menu)
            return;

        this.menu.hide(fromMouse);
    }

    showMenu(fromMouse) {
        if ( ! this.menu)
            return;

        this.positionMenu(fromMouse);
    }

    _toggleMenu(fromMouse) {
        if (this.menu.isVisible())
            this.hideMenu(fromMouse);
        else
            this.showMenu(fromMouse);
    }

    positionMenu(fromMouse) {
        let anchor = 'left';

        const rect = this.el.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        let x = rect.left + scrollLeft + 5;
        let y = rect.top + scrollTop + this.el.offsetHeight;
        
        if (this.inMenu) {
            const style = window.getComputedStyle(this.menu);
            const marginLeft = parseFloat(style.marginLeft) || 0;
            const marginRight = parseFloat(style.marginRight) || 0;
            const menuWidth = this.menu.offsetWidth + marginLeft + marginRight;
            x += menuWidth - 10;
            y -= this.el.offsetHeight + 10;
        }

        this.menu.show(x, y, { withMouse: fromMouse });
    }
}

export default ToolbarButton;
