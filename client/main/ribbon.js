
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const RibbonMenu = require('./ribbon/ribbonmenu');
const AppMenu = require('./ribbon/appmenu');
const Modules = require('./modules');
const tarp = require('./utils/tarp');
const DataTab = require('./ribbon/datatab');
const VariablesTab = require('./ribbon/variablestab');
const AnnotationTab = require('./ribbon/annotationtab');
const AnalyseTab = require('./ribbon/analysetab');
const Notifs = require('./ribbon/notifs');
const focusLoop = require('../common/focusloop');
const selectionLoop = require('../common/selectionloop');

const RibbonModel = Backbone.Model.extend({

    initialize(args) {
        this._modules = args.modules;
        this._settings = args.settings;

        this.set('tabs', [
            new VariablesTab(),
            new DataTab(),
            new AnalyseTab(this._modules, this),
            new AnnotationTab()
        ]);
    },
    defaults : {
        tabs : [ ],
        selectedTab : 'analyses'
    },
    modules() {
        return this._modules;
    },
    settings() {
        return this._settings;
    },
    getTabName(index) {
        let tabs = this.get('tabs');
        return tabs[index].name;
    },
    getSelectedTab() {
        let currentTabName = this.get('selectedTab');
        return this.getTab(currentTabName);
    },
    getTab(index) {
        let tabs = this.get('tabs');
        if (typeof index === 'number')
            return tabs[index];

        for (let i = 0; i < tabs.length; i++) {
            let tab = tabs[i];
            if (tab.name === index)
                return tab;
        }

        return null;
    },
});

const RibbonView = Backbone.View.extend({
    initialize() {
        if (this.model === undefined)
            this.model = new RibbonModel();

        this.model.settings().on('change:mode', (events) => {
            let mode = this.model.settings().getSetting('mode', 'normal');
            this.$el.attr('mode', mode);
            let $checkboxes = this.$el.find('.display-in-menu > input');
            if (mode === 'cloud')
                $checkboxes.attr("disabled", true);
            else
                $checkboxes.removeAttr("disabled");
        });

        this.model.modules().on('change:modules', () => {
            let modules = this.model.modules();
            let tab = this.model.getSelectedTab();
            if (tab.needsRefresh && tab.needsRefresh(modules)) {
                tab.update();
            }
        } , this);

        this.model.on('change:selectedTab', async () => {
            await this._refresh();
            if (this.selectedTab) {
                this.selectedTab.$el.removeClass('selected');
                this.selectedTab.$el.attr('aria-selected', false);
            }

            let tab = this.model.getSelectedTab();
            let changed = tab !== this.selectedTab;
            this.selectedTab = tab;

            if (this.tabSelection.selectedElement != this.selectedTab.$el[0])
                this.tabSelection.selectElement(this.selectedTab.$el[0], false, true);

            if (this.selectedTab) {
                this.selectedTab.$el.addClass('selected');
                this.selectedTab.$el.attr('aria-selected', true);
                this.$fullScreen.attr('data-tabname', this.selectedTab.name);
            }

            if (changed)
                this.trigger('tabSelected', tab.name, true);
        }, this);

        this.$el.addClass('jmv-ribbon app-dragable');
        this.$el.attr('role', 'region');
        this.$el.attr('aria-label', 'Top ribbon');

        this.$el.append(`
            <div class="jmv-ribbon-header">
                <button class="jmv-ribbon-tab file-tab" data-tabname="file"  aria-description="File Menu" aria-haspopup="true" aria-expanded="false"><span style="font-size: 150%; pointer-events: none;" class="mif-menu"></span></button>
                <div class="ribbon-tabs" role="tablist"></div>
                <div id="jmv-user-widget"></div>
                <button class="jmv-ribbon-fullscreen"></button>
                <button class="jmv-ribbon-appmenu" aria-haspopup="true" aria-expanded="false"></button>
            </div>
            <div id="ribbon-body" class="
                jmv-ribbon-body
                jmv-ribbon-group-body-horizontal" hloop="true" role="tabpanel">
            </div>
            <div id="jmv-ribbon-notifs"></div>
        `);


        focusLoop.addFocusLoop(this.$el[0]);

        this.$header = this.$el.find('.jmv-ribbon-header');
        this.$ribbonTabs = this.$el.find('.ribbon-tabs');
        this.tabSelection = new selectionLoop('ribbon-tabs', this.$ribbonTabs[0], true);
        this.$ribbonTabs.addClass('block-focus-left block-focus-right');

        this.$body   = this.$el.find('.jmv-ribbon-body');
        this.$fileButton = this.$el.find('.jmv-ribbon-tab[data-tabname="file"]');
        this.$appMenu = this.$el.find('.jmv-ribbon-appmenu');
        this.$fullScreen = this.$el.find('.jmv-ribbon-fullscreen');

        let $notifs = this.$el.find('#jmv-ribbon-notifs');

        this.$fileButton.on('click', (event) => {
            this.trigger('tabSelected', 'file', event.detail > 0);
        });

        this.$fileButton.on('keydown', (event) => {
            switch (event.code) {
                case "ArrowDown":
                    this.trigger('tabSelected', 'file', false);
                    event.stopPropagation();
                    event.preventDefault();
                    break;
            }
        });

        focusLoop.applyShortcutOptions(this.$fileButton[0], {
            key: 'F',
            position: { x: '50%', y: '75%' },
            action: (event) => {
                    this.trigger('tabSelected', 'file', false);
                }
            }
        );

        this.tabSelection.on('selected-index-changed', (data) => {
            let index = this.$tabs.index(data.target);
            let tab = this.model.getTab(index);

            this.$body.attr('aria-labeledby', `tab-${tab.name.toLowerCase()}`);

            if (tab.getRibbonItems)
                this.model.set('selectedTab', tab.name);
            else
                this.trigger('tabSelected', tab.name, data.withMouse);
        });

        this.$fullScreen.on('click', () => {
            this.trigger('toggle-screen-state');
        });
        focusLoop.applyShortcutOptions(this.$fullScreen[0], {
            key: 'S',
            position: { x: '50%', y: '75%' },
            action: (event) => {
                    this.trigger('toggle-screen-state');
                }
            }
        );

        let tabShortcutAction = (event) => {
            this.tabSelection.selectElement(event.target);
        };

        this.notifs = new Notifs({ el : $notifs });

        let currentTabName = this.model.get('selectedTab');
        let tabs = this.model.get('tabs');
        for (let i = 0; i < tabs.length; i++) {
            let tab = tabs[i];
            tab.on('notification', note => {
                this.trigger('notification', note);
            });
            let isSelected = tab.name === currentTabName;
            let classes = 'jmv-ribbon-tab focus-loop-ignore ribbon-tabs-list-item ribbon-tabs-auto-select';
            if (isSelected) {
                classes += ' selected';
                this.selectedTab = tab;
                this.$body.attr('aria-labeledby', `tab-${tab.name.toLowerCase()}`);
            }

            let $tab = $(`<div class="${ classes }" data-tabname="${ tab.name.toLowerCase() }" tabindex="${ isSelected ? 0 : -1 }" role="tab" aria-selected="${ isSelected ? true : false }" aria-controls="ribbon-body" id="tab-${tab.name.toLowerCase()}">${ tab.title }</div>`);

            if (tab.shortcutPath) {
                focusLoop.applyShortcutOptions($tab[0], {
                    key: tab.shortcutPath.toUpperCase(),
                    position: { x: '50%', y: '75%' },
                    action: tabShortcutAction
                    }
                );
            }

            this.$ribbonTabs.append($tab);
            tab.$el = $tab;
        }

        this.$tabs = this.$header.find('.jmv-ribbon-tab:not(.file-tab)');

        focusLoop.applyShortcutOptions(this.$appMenu[0], {
            key: 'M',
            position: { x: '50%', y: '75%' },
            action: (event) => {
                    this.appMenu.toggleMenu(false);
                }
            }
        );

        this.appMenu = new AppMenu({ el: this.$appMenu, model: this.model });

        this._refresh();
    },
    notify(options) {
        return this.notifs.notify(options);
    },
    async _refresh() {

        if (this.selectedTab)
            this.selectedTab.detachItems();

        let tab = this.model.getSelectedTab();

        if (tab.$ribbon) {
            tab.$ribbon.appendTo(this.$body);
            focusLoop.updateShortcuts({ silent: true});
        }
    },

    _menuClosed() {
        this.$el.css('z-index', '');

        this.appMenu.hide();

        this.$el[0].focus();
    },
    _buttonClicked : function(action) {
        this._menuClosed();
        this.model._actionRequest(action);
    }
});

module.exports = { View : RibbonView, Model : RibbonModel };
