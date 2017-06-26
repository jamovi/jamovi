
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
const AnalyseTab = require('./ribbon/analysetab');

const RibbonModel = Backbone.Model.extend({

    initialize(args) {
        this._modules = args.modules;
        this._settings = args.settings;
        this.set('tabs', [ { name: 'file', title: '<span style="font-size: 150%; padding: 0; pointer-events: none;" class="mif-menu"></span>' },  /* new DataTab(),*/ new AnalyseTab(this._modules) ]);
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
    defaults : {
        tabs : [ ],
        selectedTab : "analyse"
    },
    _actionRequest(action) {
        this.trigger('actionRequest', action );
    },
    _activateAnalysis(ns, name) {
        this.trigger('analysisSelected', { name : name, ns : ns } );
    }
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

        this.model.modules().on('change:modules', this._refresh, this);
        this.model.on('change:selectedTab', () => {
            this._refresh();
            if (this.selectedTab)
                this.selectedTab.$el.removeClass('selected');

            this.selectedTab = this.model.getSelectedTab();

            if (this.selectedTab)
                this.selectedTab.$el.addClass('selected');
        }, this);

        this.$el.addClass('jmv-ribbon app-dragable');

        let html = '';
        html += '<div class="jmv-ribbon-header">';
        html += '    <div class="jmv-ribbon-appmenu"></div>';
        html += '</div>';
        html += '<div class="jmv-ribbon-body">';
        html += '</div>';
        html += '<div class="jmv-store">';
        html += '</div>';

        this.$el.append(html);

        this.$header = this.$el.find('.jmv-ribbon-header');
        this.$body   = this.$el.find('.jmv-ribbon-body');
        this.$appMenu = this.$el.find('.jmv-ribbon-appmenu');
        this.$store = this.$el.find('.jmv-store');

        let currentTabName = this.model.get('selectedTab');
        let tabs = this.model.get('tabs');
        for (let i = 0; i < tabs.length; i++) {
            let tab = tabs[i];
            let isSelected = tab.name === currentTabName;
            let classes = "jmv-ribbon-tab";
            if (isSelected) {
                classes += " selected";
                this.selectedTab = tab;
            }

            let $tab = $('<div class="' + classes + '">' + tab.title + '</div>');
            this.$header.append($tab);
            tab.$el = $tab;
        }

        this.$tabs = this.$header.find('.jmv-ribbon-tab');

        this.appMenu = new AppMenu({ el: this.$appMenu, model: this.model });
        this.appMenu.on('shown', event => this._menuShown(event));

        this.$header.on('click', event => this._closeMenus());

        this._refresh();

        this.store = new Store({ el : this.$store, model : this.model.modules() });
        this.store.on('notification', note => this.trigger('notification', note));
    },
    _refresh() {

        this.buttons = [ ];
        let menuShown = (menu) => this._menuShown(menu);

        this.$body.empty();
        this.$separator = $('<div class="jmv-ribbon-button-separator"></div>').appendTo(this.$body);

        let tab = this.model.getSelectedTab();
        if (tab.getRibbonItems === undefined)
            return;

        let items = tab.getRibbonItems();
        for (let i = 0; i < items.length; i++) {
            let button = items[i];
            if (button.setParent)
                button.setParent(this);
            if (button.setTabName)
                button.setTabName(tab.name);

            if (button.dock === 'right')
                button.$el.insertAfter(this.$separator);
            else
                button.$el.insertBefore(this.$separator);
            button.on('shown', menuShown);
            this.buttons.push(button);
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
            tarp.show(true, 0, 40)
                .then(() => this._menuClosed(), () => this._menuClosed());
            this.$el.css('z-index', '50');
            this._tarpVisible = true;
        }
    },
    _closeMenus() {
        tarp.hide();
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
        this.model.set('selectedTab', this.model.getTabName(index));
    },
    _buttonClicked : function(action) {
        this._menuClosed();
        this.model._actionRequest(action);
    },
    _analysisSelected : function(analysis) {
        this._closeMenus();
        if (analysis.name === 'modules' && analysis.ns === 'app')
            this._storeSelected();
        else
            this.model._activateAnalysis(analysis.ns, analysis.name);
    },
    _storeSelected() {
        this.store.show();
    },
});

module.exports = { View : RibbonView, Model : RibbonModel };
