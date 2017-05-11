
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const RibbonMenu = require('./ribbon/ribbonmenu');
const AppMenu = require('./ribbon/appmenu');
const Store = require('./store');
const Modules = require('./modules');
const tarp = require('./utils/tarp');

const RibbonModel = Backbone.Model.extend({

    initialize(args) {
        this._modules = args.modules;
    },
    modules() {
        return this._modules;
    },
    toggleResultsMode() {
        this.trigger('toggleResultsMode');
    },
    toggleDevMode() {
        this.trigger('toggleDevMode');
    },
    changeTheme(name) {
        this.trigger('themeChanged', name);
    },
    defaults : {
        tabs : [
            { title : "File" },
            { title : "Analyse" },
        ],
        selectedIndex : 1
    },
    _activateAnalysis(ns, name) {
        this.trigger('analysisSelected', { name : name, ns : ns } );
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

        this.model.modules().on('change:modules', this._refresh, this);

        this.$el.addClass('jmv-ribbon');

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

        let currentTabIndex = this.model.get('selectedIndex');
        let currentTab = this.model.get('tabs')[currentTabIndex];

        let tabs = this.model.get('tabs');

        for (let i = 0; i < tabs.length; i++) {
            let tab = tabs[i];
            this.$header.append('<div class="jmv-ribbon-tab">' + tab.title + '</div>');
        }

        this.$tabs = this.$header.find('.jmv-ribbon-tab');
        $(this.$tabs[1]).addClass('selected');

        this.appMenu = new AppMenu({ el: this.$appMenu, model: this.model });
        this.appMenu.on('shown', event => this._menuShown(event));
        this.appMenu.on('themeChanged', name => this.model.changeTheme(name));

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

        let $button = $('<div></div>').insertAfter(this.$separator);
        let  button = new RibbonMenu($button, this, 'Modules', 'modules', [
            { name : 'modules', title : 'jamovi store', ns : 'app' }
        ], true, false);
        button.on('shown', menuShown);
        this.buttons.push(button);

        let menus = { };
        let lastSub = null;

        for (let module of this.model.modules()) {
            let isNew = module.new;
            for (let analysis of module.analyses) {
                let group = analysis.menuGroup;
                let subgroup = analysis.menuSubgroup;
                let menu = group in menus ? menus[group] : { };
                menu._new = isNew;
                let submenu = { name };
                if (subgroup in menu)
                    submenu = menu[subgroup];
                else
                    submenu = { name: subgroup, title: subgroup, items: [ ] };
                let item = {
                    name: analysis.name,
                    ns: analysis.ns,
                    title: analysis.menuTitle,
                    subtitle: analysis.menuSubtitle,
                    new: isNew,
                };
                submenu.items.push(item);
                menu[subgroup] = submenu;
                menus[group] = menu;
            }
        }

        for (let group in menus) {
            let menu = menus[group];
            let flattened = [ ];
            let containsNew = menu._new;
            for (let subgroup in menu) {
                if (subgroup === '_new')
                    continue;
                flattened.push({
                    name: subgroup,
                    title: subgroup,
                    type: 'group',
                    items: menu[subgroup].items });
            }

            if (flattened.length > 0 && flattened[0].name === '') {
                let items = flattened.shift().items;
                flattened = items.concat(flattened);
            }

            let $button = $('<div></div>').insertBefore(this.$separator);
            let  button = new RibbonMenu($button, this, group, group, flattened, false, containsNew);
            this.buttons.push(button);
            button.on('shown', menuShown);
        }
    },
    _menuShown(source) {
        if (this.appMenu !== source)
            this.appMenu.hide();
        for (let button of this.buttons) {
            if (button !== source)
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
        for (let button of this.buttons)
            button.hideMenu();
        this.appMenu.hide();
    },
    _ribbonClicked : function(event) {
        this._closeMenus();
        let index = this.$tabs.index(event.target);
        this.model.set('selectedIndex', index);
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
