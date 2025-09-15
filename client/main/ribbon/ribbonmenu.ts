'use strict';

import focusLoop, { IShortcutTokenOptions } from '../../common/focusloop';
import Menu from '../../common/menu';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import { RibbonItem } from './ribbontab';
import AnalyseTab from './analysetab';

class RibbonMenu extends HTMLElement implements RibbonItem {
    focusId: string;
    title: string;
    name: string;
    containsNew: boolean;
    dock: 'right' | 'left';
    shortcutKey: string;
    labelId: string;
    items: any;
    menu: Menu;
    parent: AnalyseTab;
    hidden: boolean = false;

    constructor(title:string, name:string, shortcutKey:string, items: any[], right: boolean, containsNew: boolean) {
        super();
        this.classList.add('jmv-ribbon-button');
        this.classList.add('jmv-analyses-button');
        this.setAttribute('tabindex', '0');
        //this.focusId = focusLoop.getNextFocusId();
        //this.setAttribute('data-focus-id', this.focusId);
        this.setAttribute('role', 'menuitem');

        this.title = title;
        this.name = name;
        this.items = items;
        this.containsNew = containsNew;
        this.dock = right ? 'right' : 'left';
        this.shortcutKey = shortcutKey;

        this.labelId = focusLoop.getNextAriaElementId('label');
        this.setAttribute('aria-labelledby', this.labelId);

        if (shortcutKey) {
            let keySplit = shortcutKey.split('-');
            let stcOptions: IShortcutTokenOptions = { key: keySplit[0].toUpperCase(), action: event => this._clicked(event, false) };
            focusLoop.applyShortcutOptions(this, stcOptions);
        }

        this.setAttribute('data-name', this.name.toLowerCase());
        if (containsNew)
            this.classList.add('contains-new');
        if (right)
            this.classList.add('right');

        this.addEventListener('mousedown', event => {
            if (this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.addEventListener('mouseup', event => {
            if ( ! this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.addEventListener('keydown', (event) => {
            if ((event.altKey && event.code == 'ArrowDown') || event.code === 'Enter' || event.code === 'Space')
                this._clicked(event, false);
        });

        this._refresh();
    }

    setParent(parent: AnalyseTab, parentShortcutPath) {
        this.parent = parent;

        if (this.shortcutKey)
            focusLoop.applyShortcutOptions(this, { path: parentShortcutPath });
    }

    setEnabled(enabled:boolean) {
        this.setAttribute('aria-disabled', (! enabled).toString());
    }

    _notifySelected(name: string, ns: string, title: string, checked: boolean) {
        let analysis = { name, ns, title, checked };
        this.parent._analysisSelected(analysis);
        if (checked === undefined)
            this.hideMenu();
    }

    hideMenu(fromMouse: boolean=false) {
        this.menu.hide(fromMouse);
    }

    showMenu(fromMouse=false) {
        this.positionMenu(fromMouse);
    }

    hideModule(name:string, item?) {
        if (item === undefined)
            item = this;

        let changed = false;
        if (item.moduleName === name)
            changed = true;

        if (item.type === 'module' && item.name === name) {
            let menuId = item.el.getAttribute('aria-controls');
            document.querySelector<HTMLInputElement>(`#${menuId} input`).checked = false;
        }

        if (item.items && item.items.length > 0) {
            let allHidden = true;
            for (let child of item.items) {
                this.hideModule(name, child);
                if ( ! child.hidden)
                    allHidden = false;
            }
            if (allHidden)
                changed = true;
        }

        if (changed) {
            item.hidden = true;
            let el: HTMLElement;
            if (item instanceof HTMLElement)
                el = item;
            else
                el = item.el;
            if (el)
                el.classList.add('menu-item-hiding');
        }
    }

    showModule(name:string, item?) {
        if (item === undefined)
            item = this;

        let changed = false;
        if (item.moduleName === name)
            changed = true;

        if (item.type === 'module' && item.name === name) {
            let menuId = item.el.getAttribute('aria-controls');
            document.querySelector<HTMLInputElement>(`#${menuId} input`).checked = true;
        }

        if (item.items) {
            let allHidden = true;
            for (let child of item.items) {
                this.showModule(name, child);
                if ( ! child.hidden)
                    allHidden = false;
            }
            if (allHidden === false)
                changed = true;
        }

        if (changed) {
            item.hidden = false;
            if (item.hidden === false) {
                let el: HTMLElement;
                if (item instanceof HTMLElement)
                    el = item;
                else
                    el = item.el;
                if (el)
                    el.classList.remove('menu-item-hiding');
            }
        }
    }

    _toggleMenu(fromMouse=false) {
        if (this.menu.isVisible())
            this.hideMenu(fromMouse);
        else
            this.showMenu(fromMouse);
    }

    _clicked(event, fromMouse=false) {
        if (this.menu.contains(event.target))
            return;

        this._toggleMenu(fromMouse);
        event.preventDefault();
    }

    _itemClicked(event) {
        let source = event.currentTarget;
        let input = source.querySelector('input');
        if (input && event.target !== input)
            input.checked = !input.checked;

        let checked = input ? input.checked : undefined;
        this._notifySelected(
            source.dataset.name,
            source.dataset.ns,
            source.dataset.rtitle,
            checked);
        source.classList.remove('new');
        event.stopPropagation();
    }

    showSidePanel(item, fromMouse=false) {
        // Get bounding rectangle
        let rect = item.el.getBoundingClientRect();
        let y = rect.top + window.scrollY;
        let x = rect.left + window.scrollX;

        // Get side panel width including margins
        let sidePanelStyle = window.getComputedStyle(item.sidePanel);
        let sidePanelMarginLeft = parseFloat(sidePanelStyle.marginLeft);
        let sidePanelMarginRight = parseFloat(sidePanelStyle.marginRight);
        let sidePanelWidth = item.sidePanel.offsetWidth + sidePanelMarginLeft + sidePanelMarginRight;

        x = x - sidePanelWidth;

        // Show the panel
        item.sidePanel.show(x, y, { withMouse: fromMouse });
    }

    _moduleDisplayClicked(event) {
        let source = event.currentTarget ;

        let checked = source ? source.checked : undefined;
        this._notifySelected(source.dataset.name, source.dataset.ns, source.dataset.title, checked);
        event.stopPropagation();
    }

    _moduleListScroll(event) {
        this.querySelectorAll('.side-panel-visible').forEach(el => {
            el.classList.remove('side-panel-visible');
        });
        this.querySelectorAll('.jmv-ribbon-menu-item.open').forEach(el => {
            el.classList.remove('open');
        });
    }

    _createMenuItem(item, level:number) {
        if (item.type === 'module')
            return this._createModuleItem(item, level);

        let classes = 'jmv-ribbon-menu-item';
        if (item.new)
            classes += ' new';
        if (item.hidden)
            classes += ' menu-item-hiding';

        let labelId1 = focusLoop.getNextAriaElementId('label');
        let labelId2 = '';
        if (item.subtitle && item.subtitle !== item.title)
            labelId2 = focusLoop.getNextAriaElementId('label');

        let html = `<button role="menuitem" aria-labelledby="${labelId1} ${labelId2}" data-name="${ item.name }" data-ns="${ item.ns }" data-title="${ item.title }" data-rtitle="${ item.resultsTitle }" class="${ classes }" tabindex="0">`;
        html += '<div class="description">';
        html += `<div id="${labelId1}">${item.title}</div>`;
        if (item.subtitle)
            html += `<div id="${labelId2}" class="jmv-ribbon-menu-item-sub">${item.subtitle}</div>`;

        html += '</div>';
        html += '</button>';

        item.el = HTML.parse(html);

        focusLoop.createHoverItem(item.el);

        return item.el;
    }

    _createModuleItem(item, level:number) {
        let classes = 'jmv-ribbon-menu-item module';

        let titleId = focusLoop.getNextAriaElementId('label');
        let subTitleId = '';
        if (item.subtitle && item.subtitle !== item.title)
            subTitleId = focusLoop.getNextAriaElementId('label');

        let html = `<button role="menuitem" aria-labelledby="${titleId}${subTitleId}" data-name="${ item.name }" data-ns="${  item.ns }" data-title="${ item.title }" class="${ classes }" tabindex="0">`;
        html += '<div class="to-analyses-arrow"></div>';
        html += '<div class="description">';
        html += `<div id="${titleId}">${item.title}</div>`;
        if (item.subtitle)
            html += `<div id="${subTitleId}" class="jmv-ribbon-menu-item-sub">${ item.subtitle }</div>`;
        html += '</div>';
        html += '</button>';
        item.el = HTML.parse(html);
        if (item.analyses !== undefined) {

            let labelId = focusLoop.getNextAriaElementId('label');
            item.sidePanel = new Menu(item.el, level + 1, { exitKeys:['ArrowRight'] });
            item.sidePanel.setAttribute('aria-laeblledby', labelId);
            item.sidePanel.classList.add('side-panel');
            item.sidePanel.append(HTML.create('div', { class: 'side-panel-heading', id: labelId }, `Module - ${ item.name }`));
            item.sidePanel.append(
                                        HTML.create('label', { class: 'display-in-menu' }, 
                                            HTML.create('input', { type:'checkbox', role: 'menuitemcheckbox', 'data-name': item.name, 'data-ns': item.ns, checked: item.checked ? 'true' : undefined }), _('Show in main menu'))
                                    ); 

            let sidePanel = item.sidePanel;
            let analysesGroup = this._createMenuGroup(item.analyses, level + 1);
            analysesGroup.classList.add('module-analysis-list');
            sidePanel.append(analysesGroup);
            item.sidePanel.connect(this.menu);

            item.el.addEventListener('mousedown', (event) => {
                this.showSidePanel(item, event.detail > 0);
                event.preventDefault();
            });
            item.el.addEventListener('keydown', (event) => {
                if (event.code == 'ArrowLeft' || event.code === 'Enter' || event.code === 'Space')
                    this.showSidePanel(item, false);
            });

            let moduleItemCheck = sidePanel.querySelectorAll('input');
            moduleItemCheck.forEach(input => {
                input.addEventListener('change', event => this._moduleDisplayClicked(event));
            });
        }
        focusLoop.createHoverItem(item.el, () => {
            if (item.analyses) {
                this.showSidePanel(item, true);
            }
            else
                item.el.focus({preventScroll:true});
        });
        return item.el;
    }

    _createMenuGroup(group, level:number) {
        let labelId = focusLoop.getNextAriaElementId('label');
        let groupElement = HTML.create('div', { class: 'jmv-ribbon-menu-group',  role: 'group', 'aria-labelledby': labelId }, 
                                HTML.create('label', { class: 'jmv-ribbon-menu-heading', id: labelId }, group.title)
                            );

        let itemsElement = HTML.create('div', { class: 'jmv-group-items', role: 'presentation' });

        let allHidden = true;
        for (let i = 0; i < group.items.length; i++) {
            itemsElement.append(this._createMenuItem(group.items[i], level));
            if ( ! group.items[i].hidden)
                allHidden = false;
        }

        if (allHidden) {
            group.hidden = true;
            groupElement.classList.add('menu-item-hiding');
        }
        groupElement.append(itemsElement);

        group.el = groupElement;
        return groupElement;
    }

    _refresh() {

        let html = '';

        let iconElement = HTML.create('div', { class: 'jmv-ribbon-button-icon' });
        let labelElement = HTML.create('div', { class: 'jmv-ribbon-button-label', id: this.labelId}, this.title);

        if ( ! this.menu) {
            this.menu = new Menu(this, 1, { className: 'analysis-menu', exitKeys: [ 'Alt+ArrowUp' ] });
            this.menu.addEventListener('menu-hidden', (event: CustomEvent) => {
                this.querySelectorAll('.jmv-ribbon-menu-item.open').forEach(el => {
                    el.classList.remove('open');
                });
            });
            this.menu.addEventListener('menu-shown', (event) => {
                this.classList.remove('contains-new');
            });
        }

        let menuElement = this.menu;

        menuElement.innerHTML = '';
        let allHidden = true;
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (item.type === 'group')
                menuElement.append(this._createMenuGroup(item, 1));
            else
                menuElement.append(this._createMenuItem(item, 1));
            if ( ! item.hidden)
                allHidden = false;

            if (item.getMenus) {
                let subMenus = item.getMenus();
                for (let subMenu of subMenus){
                    if (!subMenu.connected)
                        subMenu.connect(this.menu);
                }
            }
        }

        while (this.firstChild)
            this.removeChild(this.firstChild);
        this.append(iconElement);
        this.append(labelElement);
        this.append(HTML.create('div', { class: 'jmv-ribbon-menu-arrow', style: 'margin: 7px 0 0 0;' }));

        if (allHidden) {
            this.classList.add('menu-item-hiding');
            this.hidden = true;
        }


        const menuItems = menuElement.querySelectorAll('.jmv-ribbon-menu-item:not(.module)');
        //const moduleItems = menuElement.querySelectorAll('.jmv-ribbon-menu-item.module');
        const groupItemLists = menuElement.querySelectorAll('.jmv-group-items:not(.side-panel .jmv-group-items)');

        // Add click event listeners
        menuItems.forEach(item => {
            item.addEventListener('click', (event: MouseEvent) => this._itemClicked(event));
        });

        // Add scroll event listeners
        groupItemLists.forEach(list => {
            list.addEventListener('scroll', event => this._moduleListScroll(event));
        });

    }

    getMenus() {
        if (this.menu)
            return [ this.menu ];
        return [];
    }

    positionMenu(fromMouse=false) {
        let anchor = 'left';
        let rect = this.getBoundingClientRect();
        let x = rect.left + window.scrollX;
        let y = rect.top + window.scrollY + this.offsetHeight;

        this.menu.show(x, y, { withMouse: fromMouse });
    }
}

customElements.define('jmv-ribbon-modulemenu', RibbonMenu);

export default RibbonMenu;
