//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import PageModules from './store/pagemodules';
import PageSideload  from './store/pagesideload';
import tarp from './utils/tarp';
import interactionManager, { type FocusLoop } from '../common/interactionmanager';
import selectionLoop from '../common/selectionloop';
import { h }  from '../common/htmlelementcreator';
import { RibbonModel } from './ribbon';
import Settings from './settings';
import { Modules } from './modules';

class Store extends HTMLElement {

    $highlight: HTMLElement;
    _selectedIndex: number;
    $tabs: NodeListOf<HTMLElement>;
    $pages: NodeListOf<HTMLElement>;
    private loop: FocusLoop;

    constructor(public settings: Settings, public modules: Modules) {
        super();

        this.classList.add('Store');
        this.classList.add('jmv-store');
        this.setAttribute('tabindex', '-1');

        this.loop = interactionManager.registerLoop(this, { level: 2, modal: true, exitKeys: ['Escape'], closeFocusMode: 'default' });
        this.loop.on('deactivate', () => {
            this._hide();
        });

        const $header = h('div', { class: 'jmv-store-header' });
        this.append($header);

        const $logo = h('div', { class: 'jmv-store-header-logo' });
        $header.append($logo);
        const $close = h('button', { class: 'jmv-store-button-close', 'aria-label': _('Hide library') }, h('span', { class: 'mif-arrow-up' }));
        $header.append($close);

        $close.addEventListener('click', event => {
            this.hide();
        });

        const $tabContainer = h('div', { class: 'jmv-store-tab-container' });
        this.append($tabContainer);

        const tabSelection = new selectionLoop('store-tabs', $tabContainer);

        tabSelection.on('selected-index-changed', (data) => {
            let $target = data.target as HTMLElement;
            let $tab = $target.closest(".jmv-store-tab");
            if ($tab === undefined)
                return;
            this._setSelected(parseInt($tab.getAttribute('data-index')));
        });

        let i = 0;
        for (let tab of [
            { name: 'installed', title: _('Installed') },
            { name: 'store', title: _('Available') },
            { name: 'sideload', title: _('Sideload')} ]) {

            let $tab = h('div', { class: 'jmv-store-tab store-tabs-list-item store-tabs-auto-select', 'data-tab': tab.name, 'data-index': String(i++), tabindex: '-1', role: 'tab' },
                h('div', { class: 'jmv-store-tab-inner' }, tab.title));
            $tabContainer.append($tab);
        }

        this.$tabs = $tabContainer.querySelectorAll<HTMLElement>(".jmv-store-tab");

        this.$highlight = h('div', { class: 'jmv-store-tab-highlight' });
        $tabContainer.append(this.$highlight);

        const $pageContainer = h('div', { class: 'jmv-store-page-container' });
        this.append($pageContainer)

        const pageInst = new PageModules({ settings, modules });
        pageInst.classList.add('jmv-store-page', 'jmv-store-page-installed', 'right');
        pageInst.setAttribute('aria-hidden', 'true');
        $pageContainer.append(pageInst);

        settings.on('change:permissions_library_browseable', () => {
            let browseable = settings.getSetting('permissions_library_browseable', true);
            if (browseable) {
                const pageStore = new PageModules({ settings, modules: modules.available() });
                pageStore.classList.add('jmv-store-page', 'jmv-store-page-store', 'right');
                pageStore.setAttribute('aria-hidden', 'true');
                $pageContainer.append(pageStore);
            }
            else {
                const $pageStore = h('div', { class: 'jmv-store-page jmv-store-page-store', 'aria-hidden': 'true' });
                $pageContainer.append($pageStore);
                $pageStore.append(h('div', { class: 'mode-msg' }, _('The jamovi library is not available to your session.')));
            }
            this.$pages = $pageContainer.querySelectorAll<HTMLElement>('.jmv-store-page');
        });

        settings.on('change:permissions_library_side_load', () => {
            let sideLoad = settings.getSetting('permissions_library_side_load', false);
            if (sideLoad) {
                const pageSideload = new PageSideload( modules);
                pageSideload.classList.add('jmv-store-page', 'jmv-store-page-sideload', 'right');
                pageSideload.setAttribute('aria-hidden', 'true');
                $pageContainer.append(pageSideload);
                pageSideload.addEventListener('close', () => this.hide());
            }
            else {
                const $pageSideload = h('div', { class: 'jmv-store-page jmv-store-page-sideload right', 'aria-hidden': 'true' });
                $pageContainer.append($pageSideload);
                $pageSideload.append(h('div', { class: 'mode-msg' }, _('Side-loading modules is not available.')));
            }
            this.$pages = $pageContainer.querySelectorAll<HTMLElement>('.jmv-store-page');
        });

        this._selectedIndex = null;
    }

    _setSelected(index: number, searchTerm: string = '') {

        this._selectedIndex = index;
        this.$tabs.forEach(el => el.classList.remove('selected'));
        this.$tabs.forEach(el => el.setAttribute('aria-selected', 'false'));
        let $selected = this.$tabs[index];
        $selected.classList.add('selected');
        $selected.setAttribute('aria-selected', 'true');
        $selected.focus();

        const css = {
            left: $selected.offsetLeft + "px",
            top: $selected.offsetTop + "px",
            width: $selected.offsetWidth + "px",
            height: $selected.offsetHeight + "px",
        }

        Object.assign(this.$highlight.style, css);

        for (let i = 0; i < this.$pages.length; i++) {
            let $page = this.$pages[i] as PageModules;
            if (i < index) {
                $page.classList.remove('right');
                $page.classList.add('left');
                $page.style.visibility = 'hidden';
                $page.setAttribute('aria-hidden', 'true');
                if ($page.search)
                    $page.search('');
            }
            else if (i > index) {
                $page.classList.remove('left');
                $page.classList.add('right');
                $page.style.visibility = 'hidden';
                $page.setAttribute('aria-hidden', 'true');
                if ($page.search)
                    $page.search('');
            }
            else {
                $page.classList.remove('right');
                $page.classList.remove('left');
                $page.style.visibility = 'visible';
                $page.setAttribute('aria-hidden', 'false');
                if ($page.$search)
                    $page.search(searchTerm);
            }
        }
    }

    visible() {
        return this.classList.contains('visible');
    }

    show(tab: number, searchTerm: string = '') {
        this.classList.add('visible');
        if (tab !== undefined)
            setTimeout(() => this._setSelected(tab, searchTerm), 100);
        else if (this._selectedIndex === null)
            setTimeout(() => this._setSelected(1, searchTerm), 100);
        tarp.show('store', false, 0.3);
        let modules = this.modules;
        modules.available().retrieve();
        this.loop.activate();
    }

    hide() {
        this.loop.deactivate({ source: 'programmatic' });
        this._hide();
    }

    private _hide() {
        this.classList.remove('visible');
        tarp.hide('store');
    }
}

customElements.define('jmv-store', Store);

export default Store;
