
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const RibbonMenu = require('./ribbon/ribbonmenu');
const AppMenu = require('./ribbon/appmenu');
const Store = require('./store');
const Modules = require('./modules');
const tarp = require('./utils/tarp');
const DataTab = require('./ribbon/datatab');
const VariablesTab = require('./ribbon/variablestab');
const AnnotationTab = require('./ribbon/annotationtab');
const AnalyseTab = require('./ribbon/analysetab');
const Notifs = require('./ribbon/notifs');

const RibbonModel = Backbone.Model.extend({

    initialize(args) {
        this._modules = args.modules;
        this._settings = args.settings;

        this.set('tabs', [
            { name: 'file', title: '<span style="font-size: 150%; pointer-events: none;" class="mif-menu"></span>' },
            new VariablesTab(),
            new DataTab(),
            new AnalyseTab(this._modules),
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
    events : {
        'click .jmv-ribbon-tab': '_ribbonClicked',
        'click .jmv-ribbon-body': '_closeMenus',
    },
    initialize() {

        this.buttons = [ ];

        if (this.model === undefined)
            this.model = new RibbonModel();

        this.model.settings().on('change:mode', (events) => {
            let mode = this.model.settings().getSetting('mode', 'normal');
            this.$el.attr('mode', mode);
            let $checkboxes = this.$el.find('.display-in-menu > input');
            if (mode === 'demo')
                $checkboxes.attr("disabled", true);
            else
                $checkboxes.removeAttr("disabled");
        });

        this.model.modules().on('change:modules', () => {
            let modules = this.model.modules();
            let tab = this.model.getSelectedTab();
            if (tab.needsRefresh === undefined)
                return;

            if (tab.needsRefresh(modules))
                this._refresh();
        } , this);
        this.model.modules().on('moduleVisibilityChanged', this._onModuleVisibilityChanged, this);
        this.model.on('change:selectedTab', async () => {
            await this._refresh();
            if (this.selectedTab)
                this.selectedTab.$el.removeClass('selected');

            let tab = this.model.getSelectedTab();
            let changed = tab !== this.selectedTab;
            this.selectedTab = tab;

            if (this.selectedTab) {
                this.selectedTab.$el.addClass('selected');
                this.$fullScreen.attr('data-tabname', this.selectedTab.name);
            }

            if (changed)
                this.trigger('tabSelected', tab.name);
        }, this);

        this.$el.addClass('jmv-ribbon app-dragable');

        this.$el.on('menuActioned', () => { this._closeMenus(); });

        this.$el.append(`
            <div class="jmv-ribbon-header">
                <div class="jmv-ribbon-fullscreen"></div>
                <div class="jmv-ribbon-appmenu"></div>
            </div>
            <div class="
                jmv-ribbon-body
                jmv-ribbon-group-body-horizontal">
            </div>
            <div id="jmv-ribbon-notifs"></div>
            <div class="jmv-store"></div>
        `);

        this.$header = this.$el.find('.jmv-ribbon-header');
        this.$body   = this.$el.find('.jmv-ribbon-body');
        this.$appMenu = this.$el.find('.jmv-ribbon-appmenu');
        this.$fullScreen = this.$el.find('.jmv-ribbon-fullscreen');
        this.$store = this.$el.find('.jmv-store');
        let $notifs = this.$el.find('#jmv-ribbon-notifs');

        this.$fullScreen.on('click', () => {
            this.trigger('toggle-screen-state');
        });

        this.notifs = new Notifs({ el : $notifs });

        let currentTabName = this.model.get('selectedTab');
        let tabs = this.model.get('tabs');
        for (let i = 0; i < tabs.length; i++) {
            let tab = tabs[i];
            let isSelected = tab.name === currentTabName;
            let classes = 'jmv-ribbon-tab';
            if (isSelected) {
                classes += ' selected';
                this.selectedTab = tab;
            }

            let $tab = $('<div class="' + classes + '" data-tabname="' + tab.name.toLowerCase() + '">' + tab.title + '</div>');
            this.$header.append($tab);
            tab.$el = $tab;
        }

        this.$tabs = this.$header.find('.jmv-ribbon-tab');

        this.appMenu = new AppMenu({ el: this.$appMenu, model: this.model });
        this.appMenu.on('shown', event => this._menuShown(event));
        this.appMenu.on('hidden', event => this._closeMenus());

        this.$header.on('click', event => this._closeMenus());

        this._refresh();

        this.store = new Store({ el : this.$store, model : this.model });
        this.store.on('notification', note => this.trigger('notification', note));
    },
    notify(options) {
        return this.notifs.notify(options);
    },
    _onModuleVisibilityChanged(module) {
        if (module.visible)
            this._showModule(module.name);
        else
            this._hideModule(module.name);
    },
    _hideModule(name) {
        for (let i = 0; i < this.buttons.length; i++) {
            let button = this.buttons[i];
            if (button.hideModule)
                button.hideModule(name);
        }
    },
    _showModule(name) {
        for (let i = 0; i < this.buttons.length; i++) {
            let button = this.buttons[i];
            if (button.showModule)
                button.showModule(name);
        }
    },
    async _refresh() {

        this.buttons = [ ];
        let menuShown = (menu) => this._menuShown(menu);

        if (this.selectedTab && this.selectedTab.detachItems)
            this.selectedTab.detachItems();

        this.$body.empty();

        this.$separator = $('<div class="jmv-ribbon-button-separator"></div>').appendTo(this.$body);

        let tab = this.model.getSelectedTab();
        if (tab.getRibbonItems === undefined)
            return;

        let items = await tab.getRibbonItems();
        for (let i = 0; i < items.length; i++) {
            let item = items[i];
            if (item.setParent)
                item.setParent(this);
            if (item.setTabName)
                item.setTabName(tab.name);

            if (item.dock === 'right')
                item.$el.insertAfter(this.$separator);
            else
                item.$el.insertBefore(this.$separator);
            item.on('shown', menuShown);
            this.buttons.push(item);
        }
    },
    _menuShown(source) {
        if (this.appMenu !== source)
            this.appMenu.hide();
        for (let button of this.buttons) {
            if (button !== source && button.hideMenu)
                button.hideMenu();
        }

        if ( ! this._tarpVisible) {
            tarp.show('ribbon', true, 0, 40)
                .then(() => this._menuClosed(), () => this._menuClosed());
            this.$el.css('z-index', '50');
            this._tarpVisible = true;
        }
    },
    _closeMenus() {
        tarp.hide('ribbon');
    },
    _menuClosed() {
        if (this._tarpVisible === false)
            return;
        this.$el.css('z-index', '');
        this._tarpVisible = false;
        for (let button of this.buttons) {
            if (button.hideMenu)
                button.hideMenu();
        }
        this.appMenu.hide();

        this.$el[0].focus();
    },
    _ribbonClicked : function(event) {
        this._closeMenus();
        let index = this.$tabs.index(event.target);
        let tab = this.model.getTab(index);
        if (tab.getRibbonItems)
            this.model.set('selectedTab', tab.name);
        else
            this.trigger('tabSelected', tab.name);
    },
    _buttonClicked : function(action) {
        this._menuClosed();
        this.model._actionRequest(action);
    },
    _analysisSelected : function(analysis) {
        if (analysis.checked === undefined)
            this._closeMenus();
        if (analysis.name === 'modules' && analysis.ns === 'app')
            this.store.show(1);
        else if (analysis.name === 'manageMods' && analysis.ns === 'app')
            this.store.show(0);
        else if (analysis.ns === 'installed')
            this.model.modules().setModuleVisibility(analysis.name, analysis.checked);
        else
            this.trigger('analysisSelected', analysis);
    },
});

module.exports = { View : RibbonView, Model : RibbonModel };
