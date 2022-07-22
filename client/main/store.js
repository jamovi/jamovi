//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const util = require('util');

const PageModules = require('./store/pagemodules');
const PageSideload  = require('./store/pagesideload');
const tarp = require('./utils/tarp');
const focusLoop = require('../common/focusloop');
const selectionLoop = require('../common/selectionloop');

const Store = Backbone.View.extend({
    className: 'Store',
    initialize: function() {

        this.$el.addClass('jmv-store');
        this.$el.attr('tabindex', '-1');

        focusLoop.addFocusLoop(this.$el[0], { level: 2, closeHandler: this.hide.bind(this) });

        this.$header = $('<div class="jmv-store-header"></div>').appendTo(this.$el);

        this.$close = $(`<div class="jmv-store-button-close" title="${_('Hide library')}"><span class="mif-arrow-up"></span></div>`).appendTo(this.$header);

        this.$close.on('click', event => {
            this.hide();
        });

        this.$tabContainer = $('<div class="jmv-store-tab-container"></div>').appendTo(this.$el);
        //this.$tabContainer.on('click', event => this._tabClicked(event));

        this.tabSelection = new selectionLoop('store-tabs', this.$tabContainer[0], true);

        this.tabSelection.on('selected-index-changed', (data) => {
            let $target = $(data.target);
            let $tab = $target.closest(this.$tabs);
            if ($tab.length === 0)
                return;
            let index = this.$tabs.index($tab);
            this._setSelected(index);
        });

        for (let tab of [
            { name: 'installed', title: _('Installed') },
            { name: 'store', title: _('Available') },
            { name: 'sideload', title: _('Sideload')} ]) {

            let $tab = $(util.format('<div class="jmv-store-tab store-tabs-list-item store-tabs-auto-select" data-tab="%s" tabindex="-1"><div class="jmv-store-tab-inner">%s</div></div>', tab.name, tab.title));
            $tab.appendTo(this.$tabContainer);
        }

        this.$tabs = this.$tabContainer.children();

        this.$highlight = $('<div class="jmv-store-tab-highlight"></div>').appendTo(this.$tabContainer);

        let $pageContainer = $('<div class="jmv-store-page-container"></div>').appendTo(this.$el);

        this.$pageInst  = $('<div class="jmv-store-page jmv-store-page-installed left"></div>').appendTo($pageContainer);
        this.$pageStore = $('<div class="jmv-store-page jmv-store-page-store"></div>').appendTo($pageContainer);
        this.$pageSideload = $('<div class="jmv-store-page jmv-store-page-sideload right"></div>').appendTo($pageContainer);

        let settings = this.model.settings();
        let mode = settings.getSetting('mode', 'normal');

        settings.on('change:mode',
            (event) => {

                this.pageInst  = new PageModules({ el: this.$pageInst, model: { settings: settings, modules: this.model.modules() } });
                this.pageInst.on('notification', note => this.trigger('notification', note));

                let mode = settings.getSetting('mode', 'normal');
                if (mode === 'cloud') {
                    this.$pageStore.append($(`<div class="mode-msg">${_('The jamovi library is not avaliable on this plan.')}</div>`));
                    this.$pageSideload.append($(`<div class="mode-msg">${_('Side loading modules is not avaliable on this plan.')}</div>`));
                }
                else {
                    this.pageSideload = new PageSideload({ el: this.$pageSideload, model: this.model.modules() } );
                    this.pageSideload.on('notification', note => this.trigger('notification', note));
                    this.pageSideload.on('close', () => this.hide());

                    this.pageStore = new PageModules({ el: this.$pageStore, model: { settings: settings, modules: this.model.modules().available() } });
                    this.pageStore.on('notification', note => this.trigger('notification', note));
                }


                this.$pages = $pageContainer.children();
            });

        this._selectedIndex = null;
    },
    _setSelected: function(index) {

        this._selectedIndex = index;
        this.$tabs.removeClass('selected');
        let $selected = $(this.$tabs[index]);
        $selected.addClass('selected');
        $selected.focus();

        let css = $selected.position();
        css.width = $selected.width();
        css.height = $selected.height();

        this.$highlight.css(css);

        let $selectedPage = $(this.$pages[index]);
        for (let i = 0; i < this.$pages.length; i++) {
            let $page = $(this.$pages[i]);
            if (i < index) {
                $page.removeClass('right');
                $page.addClass('left');
                $page.css('visibility', 'hidden');
            }
            else if (i > index) {
                $page.removeClass('left');
                $page.addClass('right');
                $page.css('visibility', 'hidden');
            }
            else {
                $page.removeClass('right');
                $page.removeClass('left');
                $page.css('visibility', 'visible');
            }
        }
    },

    visible: function() {
        return this.$el.hasClass('visible');
    },
    show: function(tab) {
        this.$el.addClass('visible');
        if (tab !== undefined)
            setTimeout(() => this._setSelected(tab), 100);
        else if (this._selectedIndex === null)
            setTimeout(() => this._setSelected(1), 100);
        tarp.show('store', false, 0.3);
        let modules = this.model.modules();
        modules.available().retrieve();

        setTimeout(() => {
            focusLoop.enterFocusLoop(this.$el[0], { withMouse: false });
        }, 200);

    },
    hide: function() {
        this.$el.removeClass('visible');
        tarp.hide('store');
    }
});

module.exports = Store;
