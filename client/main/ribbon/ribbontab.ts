
'use strict';

import { EventEmitter } from 'events';
import { TabTypes } from '../ribbon';
import Menu from '../../common/menu';


export interface RibbonItem extends HTMLElement {
    setParent?: (parent: RibbonTab, shortcut: string, inMenu?: boolean) => void;
    setTabName?: (name:string) => void;
    getMenus?: () => Menu[];
    hideMenu?: (usedMouse?: boolean) => void;
    dock: 'right' | 'left';
    getEntryButton?: (openPath: string[], open: boolean, fromMouse?: boolean) => RibbonItem;
}

export abstract class RibbonTab extends EventEmitter {
    _name: keyof TabTypes;
    _shortcutPath: string;
    _title: string;
    _ribbon: HTMLElement;
    _separator: HTMLElement;
    el: HTMLElement; 

    constructor(name: keyof TabTypes, shortcutPath: string, title: string) {
        super();

        this._name = name;
        this._shortcutPath = shortcutPath;
        this._title = title;

        this._ribbon = document.createElement('div');
        this._ribbon.classList.add('jmv-ribbon-menu');

        this._separator = document.createElement('div');
        this._separator.classList.add('jmv-ribbon-button-separator');

        this._ribbon.appendChild(this._separator);

        //this.populate();
    }

    public needsRefresh?(): void;

    public get name() {
        return this._name;
    }

    public get shortcutPath() {
        return this._shortcutPath;
    }

    public get title() {
        return this._title;
    }

    public get ribbon() {
        return this._ribbon;
    }

    public update() {
        this.populate();
    }

    public detachItems() {
        if (this._ribbon.parentNode !== null)
            this._ribbon.parentNode.removeChild(this._ribbon)
    }

    protected abstract getRibbonItems(): RibbonItem[] | Promise<RibbonItem[]>;

    protected async populate() {
        let items = this.getRibbonItems();
        if (Array.isArray(items))
            this.populateFromList(items);
        else {
            items.then((items) => {
                this.populateFromList(items);
            });
        }
    }

    private populateFromList(items: RibbonItem[]) {

        const childNodes = Array.from(this._ribbon.childNodes);
        for (const child of childNodes) {
            if (child !== this._separator)
                this._ribbon.removeChild(child);
        }

        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            if (item.setParent)
                item.setParent(this, this.shortcutPath.toUpperCase());
            if (item.setTabName)
                item.setTabName(this.name);

            let el = item;

            if (item.dock === 'right')
                this._separator.after(el);
            else
                this._separator.before(el);

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

export default RibbonTab;
