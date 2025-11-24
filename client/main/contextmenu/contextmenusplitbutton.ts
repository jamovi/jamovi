import { RibbonItem } from "../ribbon/ribbontab";
import ActionHub from '../actionhub';
import Menu from "../../common/menu";
import RibbonGroup from "../ribbon/ribbongroup";
import ContextMenuButton from "./contextmenubutton";
import focusLoop from '../../common/focusloop';

export interface SplitButtonOption {
    label: string;
    name: string;
}

export interface MenuSplitButtonOptions {
    title?: string;
    name: string;
    right?: boolean;
    level?: number;
    useActionHub?: boolean;
    enabled?: boolean;
    iconId?: string;
    tabName?: string;
    eventData?: any;
    subItems?: SplitButtonOption[];
}

export class SplitButton extends HTMLElement implements RibbonItem {
    private mainButton: HTMLButtonElement;
    private arrowButton: HTMLButtonElement;
    private icon: HTMLElement;
    private mainLabel: HTMLElement;
    _menuGroup: RibbonGroup;
    level: number;
     _iconId: string;
    menu: Menu
    private isOpen = false;
    dock: 'left' | 'right';
    eventData: any;

    constructor(
        public options: MenuSplitButtonOptions
    ) {
        super();

        this.classList.add('split-button', 'jmv-ribbon-button-size-medium');

        this.eventData = options.eventData  === undefined ? null : options.eventData;
        this.level = options.level === undefined ? 0 : options.level;
        this._iconId = options.iconId === undefined ? null : options.iconId;

        this.mainButton = document.createElement("button");
        this.mainButton.className = "split-button-main jmv-context-menu-button";

        this.mainLabel = document.createElement("span");
        this.mainLabel.className = "main-label jmv-ribbon-button-label";
        this.mainLabel.textContent = options.title;

        this.icon = document.createElement('div');
        this.icon.classList.add('jmv-ribbon-button-icon');
        this.mainButton.prepend(this.icon, this.mainLabel);

        this.arrowButton = document.createElement("button");
        this.arrowButton.className = "split-button-arrow";

        if (this._iconId !== null)
            this.mainButton.setAttribute('data-icon', this._iconId.toLowerCase());

        for (const o of options.subItems) {
            let cloneEventData = structuredClone(this.eventData);
            cloneEventData.target.op = o.name;
            cloneEventData.op = o.name;
            this.addItem( new ContextMenuButton({ title: o.label, name: o.name,  eventData: cloneEventData }));
        }

        focusLoop.createHoverItem(this.arrowButton, () => {
            this.showMenu(true);
        });

        this.arrowButton.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space')
                this.showMenu(false);
            else {
                if (event.code == (document.body.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight') && this._menuGroup !== undefined)
                    this.showMenu(false);
            }
        });

        this.mainButton.addEventListener("click", (event) => this._clicked(event, event.detail > 0));
        this.arrowButton.addEventListener("click", (event) => this.showMenu(event.detail > 0));

        this.append(this.mainButton, this.arrowButton, this.menu);
    }

    addItem(item: RibbonItem) {
        if (this._menuGroup === undefined) {
            this.menu = new Menu(this, this.level + 1, { exitKeys: ['InlineArrowLeft'] });

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

    _clicked(event, fromMouse) {

        if (this.menu && this.menu.contains(event.target))
            return;

        this.dispatchEvent(new CustomEvent<SplitButton>('menuClicked', { bubbles: true, detail: this }));

        let action = ActionHub.get(this.options.name);

        if (action !== null)
            action.do();

        this.dispatchEvent( new CustomEvent('menuActioned', { bubbles: true }));
    

        event.preventDefault();
    }

    private toggleMenu() {
        this.isOpen ? this.closeMenu() : this.openMenu();
    }

    private openMenu() {
        this.isOpen = true;
        this.menu.hidden = false;
    }

    private closeMenu() {
        this.isOpen = false;
        this.menu.hidden = true;
    }

    private focusFirstOption() {
        const first = this.menu.querySelector("li > button") as HTMLButtonElement;
        if (first) 
            first.focus();
    }
}


customElements.define('jmv-menu-splitbutton', SplitButton)