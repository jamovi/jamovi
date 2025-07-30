
'use strict';

import AppMenu from './ribbon/appmenu';
import DataTab from './ribbon/datatab';
import VariablesTab from './ribbon/variablestab';
import AnnotationTab from './ribbon/annotationtab';
import AnalyseTab from './ribbon/analysetab';
import { EventDistributor, EventMap } from '../common/eventmap';
import PlotsTab from './ribbon/plotstab';
import RibbonTab from './ribbon/ribbontab';
import SelectionLoop from '../common/selectionloop';
import Notifs, { NotifData } from './ribbon/notifs';
import focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
 

type AnyTab = DataTab | VariablesTab | AnnotationTab | AnalyseTab | PlotsTab;
export type TabTypes = {
  analyses: AnalyseTab;
  annotation: AnnotationTab;
  data: DataTab;
  plots: PlotsTab;
  variables: VariablesTab;
  file: null;
};

interface IRibbonModelData {
    tabs : AnyTab[ ];
    selectedTab: keyof TabTypes;
}

export class RibbonModel extends EventMap<IRibbonModelData>{

    _variablesTab: VariablesTab;
    _dataTab: DataTab;
    _analysesTab: AnalyseTab;
    _plotsTab: PlotsTab;
    _editTab: AnnotationTab;
    appMenu: AppMenu;

    constructor(modules, settings) {
        super({
            tabs: [],
            selectedTab: 'analyses'
        });
        this._modules = modules;
        this._settings = settings;

        this._variablesTab = new VariablesTab();
        this._dataTab = new DataTab();
        this._analysesTab = new AnalyseTab(this._modules, this);
        this._plotsTab = new PlotsTab(this._modules, this);
        this._editTab = new AnnotationTab();
        

        this.set('tabs', [
            this._variablesTab,
            this._dataTab,
            this._analysesTab,
            this._plotsTab,
            this._editTab,
        ]);

        this.onAnalysisSelected = this.onAnalysisSelected.bind(this);

        this._analysesTab.on('analysisSelected', this.onAnalysisSelected);
        this._dataTab.on('analysisSelected', this.onAnalysisSelected);
        this._plotsTab.on('analysisSelected', this.onAnalysisSelected);
    };

    onAnalysisSelected(analysis) {
        this.trigger('analysisSelected', analysis);
    }

    modules() {
        return this._modules;
    }

    settings() {
        return this._settings;
    }

    getTabName(index: number): string {
        let tabs = this.get('tabs');
        return tabs[index].name;
    }

    getSelectedTab() {
        let currentTabName = this.get('selectedTab');
        return this.getTab(currentTabName);
    }

    getTab<T extends keyof TabTypes>(key: T): TabTypes[T];
    getTab(index: number): AnyTab;
    getTab(index: number | string): RibbonTab | null {
        let tabs = this.get('tabs');
        if (typeof index === 'number')
            return tabs[index];

        for (let i = 0; i < tabs.length; i++) {
            let tab = tabs[i];
            if (tab.name === index)
                return tab;
        }

        return null;
    }
}

export class RibbonView extends EventDistributor {
    model: RibbonModel;
    selectedTab: RibbonTab;

    $header: HTMLElement;
    $ribbonTabs: HTMLElement;
    $body: HTMLElement;
    $fileButton: HTMLElement;
    $fullScreen: HTMLElement;
    tabSelection: SelectionLoop;
    $tabs: NodeListOf<HTMLElement>;
    appMenu: AppMenu;
    notifs: Notifs;

    constructor(model: RibbonModel) {
        super();

        this.model = model;

        this.model.settings().on('change:mode', (events) => {
            let mode = this.model.settings().getSetting('mode', 'normal');
            this.setAttribute('mode', mode);
            let $checkboxes = this.querySelectorAll<HTMLElement>('.display-in-menu > input');
            $checkboxes.forEach(el => {
                if (mode === 'cloud')
                    el.setAttribute("disabled", 'true');
                else
                    el.removeAttribute("disabled");
            });
            
        });

        this.model.modules().on('change:modules', () => {
            //let modules = this.model.modules();
            for (let tab of this.model.attributes.tabs) {
                if (tab.needsRefresh && tab.needsRefresh()) {
                    tab.update();
                }
            }
        } , this);

        this.model.on('change:selectedTab', async () => {
            await this._refresh();
            if (this.selectedTab) {
                this.selectedTab.el.classList.remove('selected');
                this.selectedTab.el.setAttribute('aria-selected', 'false');
            }

            let tab = this.model.getSelectedTab();
            let changed = tab !== this.selectedTab;
            this.selectedTab = tab;

            if (this.tabSelection.selectedElement != this.selectedTab.el)
                this.tabSelection.selectElement(this.selectedTab.el, false, true);

            if (this.selectedTab) {
                this.selectedTab.el.classList.add('selected');
                this.selectedTab.el.setAttribute('aria-selected', 'true');
                this.$fullScreen.setAttribute('data-tabname', this.selectedTab.name);
            }

            if (changed) {
                let newEvent = new CustomEvent<{tabName: keyof TabTypes, withMouse: boolean}>('tabSelected', { detail: { tabName: tab.name, withMouse: true }});
                this.dispatchEvent(newEvent);
            }
        }, this);

        this.classList.add('jmv-ribbon');
        this.appMenu = new AppMenu(this.model);

        this.append(HTML.parse(`
            <div class="jmv-ribbon-header app-dragable" role="group" aria-orientation="horizontal">
                <button class="jmv-ribbon-tab file-tab" data-tabname="file" role="toolbaritem"  aria-label="${_('File')}" aria-haspopup="true" aria-expanded="false"><span style="font-size: 150%; pointer-events: none;" class="mif-menu"></span></button>
                <div class="ribbon-tabs" role="tablist"></div>
                <div id="jmv-user-button"></div>
                <button class="jmv-ribbon-fullscreen" aria-label="${_('Enable/disable full screen mode')}"></button>
            </div>`));
        this.append(HTML.parse(`<div id="ribbon-body" class="
                jmv-ribbon-body
                jmv-ribbon-group-body-horizontal" hloop="true" role="tabpanel" aria-roledescription="">
            </div>`));

        this.notifs = new Notifs();
        this.append(this.notifs);

        focusLoop.addFocusLoop(this);

        this.$header = this.querySelector<HTMLElement>('.jmv-ribbon-header');
        this.$header.append(this.appMenu);
        this.$ribbonTabs = this.querySelector<HTMLElement>('.ribbon-tabs');
        this.tabSelection = new SelectionLoop('ribbon-tabs', this.$ribbonTabs);
        this.$ribbonTabs.classList.add('block-focus-left', 'block-focus-right');

        this.$body   = this.querySelector<HTMLElement>('.jmv-ribbon-body');
        this.$fileButton = this.querySelector<HTMLElement>('.jmv-ribbon-tab[data-tabname="file"]');
        this.$fullScreen = this.querySelector<HTMLElement>('.jmv-ribbon-fullscreen');

        this.$fileButton.addEventListener('click', (event) => {
            let newEvent = new CustomEvent<{tabName: keyof TabTypes, withMouse: boolean}>('tabSelected', { detail: { tabName: 'file', withMouse: event.detail > 0 }});
            this.dispatchEvent(newEvent);
            //this.trigger('tabSelected', 'file', event.detail > 0);
        });

        this.$fileButton.addEventListener('keydown', (event) => {
            switch (event.code) {
                case "ArrowDown":
                    let newEvent = new CustomEvent<{tabName: keyof TabTypes, withMouse: boolean}>('tabSelected', { detail: { tabName: 'file', withMouse: false }});
                    this.dispatchEvent(newEvent);
                    //this.trigger('tabSelected', 'file', false);
                    event.stopPropagation();
                    event.preventDefault();
                    break;
            }
        });

        focusLoop.applyShortcutOptions(this.$fileButton, {
                key: 'F',
                position: { x: '50%', y: '75%' },
                action: (event) => {
                    let newEvent = new CustomEvent<{tabName: keyof TabTypes, withMouse: boolean}>('tabSelected', { detail: { tabName: 'file', withMouse: false }});
                    this.dispatchEvent(newEvent);
                    //this.trigger('tabSelected', 'file', false);
                },
                label: _('File menu')
            } 
        );

        this.tabSelection.on('selected-index-changed', (data) => {
            let tabs = Array.from(this.$tabs); // Convert NodeList or jQuery object to array
            let index = tabs.indexOf(data.target);
            //let index = this.$tabs.index(data.target);
            let tab = this.model.getTab(index);

            this.$body.setAttribute('aria-labeledby', `tab-${tab.name.toLowerCase()}`);

            if (tab.getRibbonItems)
                this.model.set('selectedTab', tab.name);
            else {
                let newEvent = new CustomEvent<{tabName: keyof TabTypes, withMouse: boolean}>('tabSelected', { detail: { tabName: tab.name, withMouse: data.withMouse }});
                this.dispatchEvent(newEvent);
            }
        });

        this.$fullScreen.addEventListener('click', () => {
            let event = new CustomEvent('toggle-screen-state');
            this.dispatchEvent(event);
            //this.trigger('toggle-screen-state');
        });
        focusLoop.applyShortcutOptions(this.$fullScreen, {
                key: 'S',
                position: { x: '50%', y: '75%' },
                action: (event) => {
                    let newEvent = new CustomEvent('toggle-screen-state');
                    this.dispatchEvent(newEvent);
                        //this.trigger('toggle-screen-state');
                },
                label: _('Toggle screen state')
            }
        );

        let tabShortcutAction = (event) => {
            this.tabSelection.selectElement(event.target);
        };

        

        let currentTabName = this.model.get('selectedTab');
        let tabs = this.model.get('tabs');
        for (let i = 0; i < tabs.length; i++) {
            let tab = tabs[i];
            tab.on('notification', note => {
                let newEvent = new CustomEvent('notification', {detail: note });
                this.dispatchEvent(newEvent);
                //this.trigger('notification', note);
            });
            let isSelected = tab.name === currentTabName;
            let classes = 'jmv-ribbon-tab focus-loop-ignore ribbon-tabs-list-item ribbon-tabs-auto-select';
            if (isSelected) {
                classes += ' selected';
                this.selectedTab = tab;
                this.$body.setAttribute('aria-labeledby', `tab-${tab.name.toLowerCase()}`);
            }

            let $tab = HTML.parse(`<div class="${ classes }" data-tabname="${ tab.name.toLowerCase() }" tabindex="${ isSelected ? 0 : -1 }" role="tab" aria-selected="${ isSelected ? true : false }" aria-controls="ribbon-body" id="tab-${tab.name.toLowerCase()}">${ tab.title }</div>`);

            if (tab.shortcutPath) {
                focusLoop.applyShortcutOptions($tab, {
                    key: tab.shortcutPath.toUpperCase(),
                    position: { x: '50%', y: '75%' },
                    action: tabShortcutAction,
                    label: tab.title
                    }
                );
            }

            this.$ribbonTabs.append($tab);
            tab.el = $tab;
        }

        this.$tabs = this.$header.querySelectorAll<HTMLElement>('.jmv-ribbon-tab:not(.file-tab)');

        focusLoop.applyShortcutOptions(this.appMenu, {
            key: 'M',
            position: { x: '50%', y: '75%' },
            action: (event) => {
                    this.appMenu.toggleMenu(false);
                }
            }
        );

        

        this._refresh();
    }

    openFileMenu(usingMouse) {
        let newEvent = new CustomEvent<{tabName: keyof TabTypes, withMouse: boolean}>('tabSelected', { detail: { tabName: 'file', withMouse: usingMouse }});
        this.dispatchEvent(newEvent);
        //this.trigger('tabSelected', 'file', usingMouse);
    }

    notify(options: Partial<NotifData>) {
        return this.notifs.notify(options);
    }

    async _refresh() {

        if (this.selectedTab)
            this.selectedTab.detachItems();

        let tab = this.model.getSelectedTab();

        if (tab.ribbon) {
            this.$body.append(tab.ribbon);
            focusLoop.updateShortcuts({ silent: true});
        }
    }

    _menuClosed() {
        this.style.zIndex = '';

        this.appMenu.hide();

        this.focus();
    }

    _buttonClicked(action) {
        this._menuClosed();
        this.model._actionRequest(action);
    }
}

customElements.define('jmv-ribbon', RibbonView);
