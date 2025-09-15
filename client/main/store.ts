//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import PageModules from './store/pagemodules';
import PageSideload  from './store/pagesideload';
import tarp from './utils/tarp';
import focusLoop from '../common/focusloop';
import selectionLoop from '../common/selectionloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { RibbonModel } from './ribbon';

class Store extends HTMLElement {

    $highlight: HTMLElement;
    model: RibbonModel;
    _selectedIndex: number;
    $tabs: NodeListOf<HTMLElement>;
    $pages: NodeListOf<HTMLElement>;

    constructor(model: RibbonModel) {
        super();

        this.model = model;
        this.classList.add('Store');
        this.classList.add('jmv-store');
        this.setAttribute('tabindex', '-1');

        focusLoop.addFocusLoop(this, { level: 2, closeHandler: this.hide.bind(this), modal: true, exitKeys: ['Escape'] });

        const $header = HTML.parse('<div class="jmv-store-header"></div>');
        this.append($header);

        const $close = HTML.parse(`<button class="jmv-store-button-close" aria-label="${_('Hide library')}"><span class="mif-arrow-up"></span></button>`);
        $header.append($close);

        $close.addEventListener('click', event => {
            this.hide();
        });

        const $tabContainer = HTML.parse('<div class="jmv-store-tab-container"></div>');
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

            let $tab = HTML.parse(`<div class="jmv-store-tab store-tabs-list-item store-tabs-auto-select" data-tab="${tab.name}" data-index="${i++}" tabindex="-1" role="tab"><div class="jmv-store-tab-inner">${tab.title}</div></div>`);
            $tabContainer.append($tab);
        }

        this.$tabs = $tabContainer.querySelectorAll<HTMLElement>(".jmv-store-tab");

        this.$highlight = HTML.parse('<div class="jmv-store-tab-highlight"></div>');
        $tabContainer.append(this.$highlight);

        const $pageContainer = HTML.parse('<div class="jmv-store-page-container"></div>');
        this.append($pageContainer)

        let settings = this.model.settings();

        const pageInst = new PageModules({ settings: settings, modules: this.model.modules() });
        pageInst.classList.add('jmv-store-page', 'jmv-store-page-installed', 'right');
        pageInst.setAttribute('aria-hidden', 'true');
        $pageContainer.append(pageInst);

        settings.on('change:permissions_library_browseable', () => {
            let browseable = settings.getSetting('permissions_library_browseable', true);
            if (browseable) {
                const pageStore = new PageModules({ settings: settings, modules: this.model.modules().available() });
                pageStore.classList.add('jmv-store-page', 'jmv-store-page-store', 'right');
                pageStore.setAttribute('aria-hidden', 'true');
                $pageContainer.append(pageStore);
            }
            else {
                const $pageStore = HTML.parse('<div class="jmv-store-page jmv-store-page-store" aria-hidden="true"></div>');
                $pageContainer.append($pageStore);
                $pageStore.append(HTML.parse(`<div class="mode-msg">${_('The jamovi library is not available to your session.')}</div>`));
            }
            this.$pages = $pageContainer.querySelectorAll<HTMLElement>('.jmv-store-page');
        });

        settings.on('change:permissions_library_side_load', () => {
            let sideLoad = settings.getSetting('permissions_library_side_load', false);
            if (sideLoad) {
                const pageSideload = new PageSideload( this.model.modules());
                pageSideload.classList.add('jmv-store-page', 'jmv-store-page-sideload', 'right');
                pageSideload.setAttribute('aria-hidden', 'true');
                $pageContainer.append(pageSideload);
                pageSideload.addEventListener('close', () => this.hide());
            }
            else {
                const $pageSideload = HTML.parse('<div class="jmv-store-page jmv-store-page-sideload right" aria-hidden="true"></div>');
                $pageContainer.append($pageSideload);
                $pageSideload.append(HTML.parse(`<div class="mode-msg">${_('Side-loading modules is not available.')}</div>`));
            }
            this.$pages = $pageContainer.querySelectorAll<HTMLElement>('.jmv-store-page');
        });

        this._selectedIndex = null;
    }

    _setSelected(index) {

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
            let $page = this.$pages[i] as HTMLElement;
            if (i < index) {
                $page.classList.remove('right');
                $page.classList.add('left');
                $page.style.visibility = 'hidden';
                $page.setAttribute('aria-hidden', 'true');
            }
            else if (i > index) {
                $page.classList.remove('left');
                $page.classList.add('right');
                $page.style.visibility = 'hidden';
                $page.setAttribute('aria-hidden', 'true');
            }
            else {
                $page.classList.remove('right');
                $page.classList.remove('left');
                $page.style.visibility = 'visible';
                $page.setAttribute('aria-hidden', 'false');
            }
        }
    }

    visible() {
        return this.classList.contains('visible');
    }

    show(tab) {
        this.classList.add('visible');
        if (tab !== undefined)
            setTimeout(() => this._setSelected(tab), 100);
        else if (this._selectedIndex === null)
            setTimeout(() => this._setSelected(1), 100);
        tarp.show('store', false, 0.3);
        let modules = this.model.modules();
        modules.available().retrieve();
        focusLoop.enterFocusLoop(this);
    }

    hide() {
        focusLoop.leaveFocusLoop(this);
        this.classList.remove('visible');
        tarp.hide('store');
    }
}

customElements.define('jmv-store', Store);

export default Store;
