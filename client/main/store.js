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
import focusLoop from '../common/focusloop';
const selectionLoop = require('../common/selectionloop');

const Store = Backbone.View.extend({
    className: 'Store',
    initialize: function() {

        this.$el.addClass('jmv-store');
        this.$el.attr('tabindex', '-1');

        focusLoop.addFocusLoop(this.$el[0], { level: 2, closeHandler: this.hide.bind(this), modal: true, exitKeys: ['Escape'] });

        this.$header = $('<div class="jmv-store-header"></div>').appendTo(this.$el);

        this.$close = $(`<button class="jmv-store-button-close" aria-label="${_('Hide library')}"><span class="mif-arrow-up"></span></button>`).appendTo(this.$header);

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

            let $tab = $(util.format('<div class="jmv-store-tab store-tabs-list-item store-tabs-auto-select" data-tab="%s" tabindex="-1" role="tab"><div class="jmv-store-tab-inner">%s</div></div>', tab.name, tab.title));
            $tab.appendTo(this.$tabContainer);
        }

        this.$tabs = this.$tabContainer.children();

        this.$highlight = $('<div class="jmv-store-tab-highlight"></div>').appendTo(this.$tabContainer);

        this.$pageContainer = $('<div class="jmv-store-page-container"></div>').appendTo(this.$el);

        this.$pageInst  = $('<div class="jmv-store-page jmv-store-page-installed left" aria-hidden="true"></div>').appendTo(this.$pageContainer);
        this.$pageStore = $('<div class="jmv-store-page jmv-store-page-store" aria-hidden="true"></div>').appendTo(this.$pageContainer);
        this.$pageSideload = $('<div class="jmv-store-page jmv-store-page-sideload right" aria-hidden="true"></div>').appendTo(this.$pageContainer);

        let settings = this.model.settings();

        this.pageInst = new PageModules({ el: this.$pageInst, model: { settings: settings, modules: this.model.modules() } });
        this.pageInst.on('notification', note => this.trigger('notification', note));

        settings.on('change:permissions_library_browseable', () => {
            let browseable = settings.getSetting('permissions_library_browseable', true);
            if (browseable) {
                this.pageStore = new PageModules({ el: this.$pageStore, model: { settings: settings, modules: this.model.modules().available() } });
                this.pageStore.on('notification', note => this.trigger('notification', note));
            }
            else {
                this.$pageStore.append($(`<div class="mode-msg">${_('The jamovi library is not available to your session.')}</div>`));
            }
            this.$pages = this.$pageContainer.children();
        });

        settings.on('change:permissions_library_side_load', () => {
            let sideLoad = settings.getSetting('permissions_library_side_load', false);
            if (sideLoad) {
                this.pageSideload = new PageSideload({ el: this.$pageSideload, model: this.model.modules() } );
                this.pageSideload.on('notification', note => this.trigger('notification', note));
                this.pageSideload.on('close', () => this.hide());
            }
            else {
                this.$pageSideload.append($(`<div class="mode-msg">${_('Side-loading modules is not available.')}</div>`));
            }
            this.$pages = this.$pageContainer.children();
        });

        this._selectedIndex = null;
    },
    _setSelected: function(index) {

        this._selectedIndex = index;
        this.$tabs.removeClass('selected');
        this.$tabs.attr('aria-selected', false);
        let $selected = $(this.$tabs[index]);
        $selected.addClass('selected');
        $selected.attr('aria-selected', true);
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
                $page.attr('aria-hidden', 'true');
            }
            else if (i > index) {
                $page.removeClass('left');
                $page.addClass('right');
                $page.css('visibility', 'hidden');
                $page.attr('aria-hidden', 'true');
            }
            else {
                $page.removeClass('right');
                $page.removeClass('left');
                $page.css('visibility', 'visible');
                $page.attr('aria-hidden', 'false');
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
        focusLoop.enterFocusLoop(this.$el[0]);
    },
    hide: function() {
        focusLoop.leaveFocusLoop(this.$el[0]);
        this.$el.removeClass('visible');
        tarp.hide('store');
    }
});

module.exports = Store;
