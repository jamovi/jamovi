
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const RibbonMenu = require('./ribbon/ribbonmenu');
const AppMenu = require('./ribbon/appmenu');
const Store = require('./store');
const Modules = require('./modules');

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
        'click .jmv-ribbon-tab': '_ribbonClicked'
    },
    initialize() {

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

        this._refresh();

        this.store = new Store({ el : this.$store, model : this.model.modules() });
        this.store.on('notification', note => this.trigger('notification', note));
    },
    _refresh() {

        this.$body.empty();
        this.$separator = $('<div class="jmv-ribbon-button-separator"></div>').appendTo(this.$body);

        let $button = $('<div></div>').insertAfter(this.$separator);
        let  button = new RibbonMenu($button, this, 'Modules', 'modules', [
            { name : 'modules', title : 'jamovi store', ns : 'app' }
        ], true);

        let menus = { };
        let lastSub = null;

        for (let module of this.model.modules()) {
            for (let analysis of module.analyses) {
                let group = analysis.menuGroup;
                let subgroup = analysis.menuSubgroup;
                let menu = group in menus ? menus[group] : { };
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
                };
                submenu.items.push(item);
                menu[subgroup] = submenu;
                menus[group] = menu;
            }
        }

        for (let group in menus) {
            let menu = menus[group];
            let flattened = [ ];
            for (let subgroup in menu)
                flattened.push({
                    name: subgroup,
                    title: subgroup,
                    type: 'group',
                    items: menu[subgroup].items });

            if (flattened.length > 0 && flattened[0].name === '') {
                let items = flattened.shift().items;
                flattened = items.concat(flattened);
            }

            let $button = $('<div></div>').insertBefore(this.$separator);
            let  button = new RibbonMenu($button, this, group, group, flattened);
        }
    },
    _ribbonClicked : function(event) {
        let index = this.$tabs.index(event.target);
        this.model.set('selectedIndex', index);
    },
    _analysisSelected : function(analysis) {
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
