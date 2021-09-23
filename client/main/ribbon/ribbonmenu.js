
'use strict';

const $ = require('jquery');
const tarp = require('../utils/tarp');
const Backbone = require('backbone');
const keyboardJS = require('keyboardjs');

const RibbonMenu = Backbone.View.extend({

    initialize($el, title, name, items, right, containsNew) {

        this.$el = $el;
        this.$el.addClass('jmv-ribbon-button jmv-analyses-button');

        this.title = title;
        this.name = name;
        this.items = items;
        this.containsNew = containsNew;
        this.menuVisible = false;
        this.dock = right ? 'right' : 'left';

        this.$el.attr('data-name', this.name.toLowerCase());
        this.$el.attr('disabled');
        if (containsNew)
            this.$el.addClass('contains-new');
        if (right)
            this.$el.addClass('right');

        this.$el.on('click', event => this._clicked(event));

        this._refresh();
    },
    setParent(parent) {
        this.parent = parent;
    },
    setEnabled(enabled) {
        this.$el.prop('disabled', ! enabled);
    },
    _notifySelected(name, ns, title, checked) {
        let analysis = { name, ns, title, checked };
        this.parent._analysisSelected(analysis);
        if (checked === undefined)
            this.hideMenu();
    },
    hideMenu() {
        this.$menu.hide();
        this.menuVisible = false;
        this.$el.find('.side-panel-visible').removeClass('side-panel-visible');
        this.$el.find('.jmv-ribbon-menu-item.open').removeClass('open');
        keyboardJS.resume('ribbon');
    },
    showMenu() {
        this.trigger('shown', this);
        this.$el.removeClass('contains-new');
        this.$menu.show();
        this.menuVisible = true;
        keyboardJS.pause('ribbon');
    },
    hideModule(name, item) {
        if (item === undefined)
            item = this;

        let changed = false;
        if (item.moduleName === name)
            changed = true;

        if (item.type === 'module' && item.name === name)
            item.$el.find('input')[0].checked = false;

        if (item.items && item.items.length > 0) {
            let allHidden = true;
            for (let child of item.items) {
                this.hideModule(name, child);
                if ( ! child.hidden)
                    allHidden = false;
            }
            if (allHidden)
                changed = true;
        }

        if (changed) {
            item.hidden = true;
            item.$el.addClass('menu-item-hiding');
        }
    },
    showModule(name, item) {
        if (item === undefined)
            item = this;

        let changed = false;
        if (item.moduleName === name)
            changed = true;

        if (item.type === 'module' && item.name === name)
            item.$el.find('input')[0].checked = true;

        if (item.items) {
            let allHidden = true;
            for (let child of item.items) {
                this.showModule(name, child);
                if ( ! child.hidden)
                    allHidden = false;
            }
            if (allHidden === false)
                changed = true;
        }

        if (changed) {
            item.hidden = false;
            if (item.hidden === false)
                item.$el.removeClass('menu-item-hiding');
        }
    },
    _toggleMenu() {
        if (this.menuVisible)
            this.hideMenu();
        else
            this.showMenu();
    },
    _clicked(event) {
        let $target = $(event.target);
        if ($target.closest(this.$menu).length !== 0)
            return;
        this._toggleMenu();
        event.stopPropagation();
    },
    _itemClicked(event) {
        let source = event.delegateTarget;
        let input = source.querySelector('input');
        if (input && event.target !== input)
            input.checked = !input.checked;

        let checked = input ? input.checked : undefined;
        this._notifySelected(
            source.dataset.name,
            source.dataset.ns,
            source.dataset.rtitle,
            checked);
        $(source).removeClass('new');
        event.stopPropagation();
    },
    _moduleClicked(event) {
        let $source = $(event.delegateTarget);
        let $panel = $source.find('.side-panel');
        this.$el.find('.jmv-ribbon-menu-item.open').removeClass('open');
        $source.addClass('open');
        this.$el.find('.side-panel-visible').removeClass('side-panel-visible');
        let top = $source.position().top - 35;
        let pheight = $panel.outerHeight();
        let mHeight = this.$el.find('.jmv-ribbon-button-menu').outerHeight(true);
        if (top + pheight > mHeight)
            top -= top + pheight - mHeight + 1;
        if (top < -1)
            top = -1;

        $panel.css('top', top);
        $panel.addClass('side-panel-visible');

        event.stopPropagation();
    },
    _moduleDisplayClicked(event) {
        let source = event.delegateTarget;

        let checked = source ? source.checked : undefined;
        this._notifySelected(source.dataset.name, source.dataset.ns, source.dataset.title, checked);
        event.stopPropagation();
    },
    _moduleListScroll(event) {
        this.$el.find('.side-panel-visible').removeClass('side-panel-visible');
        this.$el.find('.jmv-ribbon-menu-item.open').removeClass('open');
    },
    _createMenuItem(item) {
        if (item.type === 'module')
            return this._createModuleItem(item);

        let classes = 'jmv-ribbon-menu-item';
        if (item.new)
            classes += ' new';
        if (item.hidden)
            classes += ' menu-item-hiding';

        let html = `<div data-name="${ item.name }" data-ns="${ item.ns }" data-title="${ item.title }" data-rtitle="${ item.resultsTitle }" class="${ classes }">`;
        html += '<div class="description">';
        html += '<div>' + item.title + '</div>';
        if (item.subtitle)
            html += '<div class="jmv-ribbon-menu-item-sub">' + item.subtitle + '</div>';
        html += '</div>';
        html += '</div>';

        item.$el = $(html);
        return item.$el;
    },
    _createModuleItem(item) {
        let classes = 'jmv-ribbon-menu-item module';
        let html = `<div data-name="${ item.name }" data-ns="${  item.ns }" data-title="${ item.title }" class="${ classes }">`;
        html += '<div class="to-analyses-arrow"></div>';
        html += '<div class="description">';
        html += '<div>' + item.title + '</div>';
        if (item.subtitle)
            html += `<div class="jmv-ribbon-menu-item-sub">${ item.subtitle }</div>`;
        html += '</div>';
        html += '</div>';
        item.$el = $(html);
        if (item.analyses !== undefined) {
            let panelHtml = `<div class="side-panel">
                                <div class="side-panel-heading">Module - ${ item.name }</div>
                                <label class="display-in-menu"><input type="checkbox"  data-name="${ item.name }" data-ns="${ item.ns }" ${ (item.checked ? 'checked' : '') }>Show in main menu</label>
                            </div>`;
            let $sidePanel = $(panelHtml);
            let $analysesGroup = this._createMenuGroup(item.analyses);
            $analysesGroup.addClass('module-analysis-list');
            $sidePanel.append($analysesGroup);
            item.$el.append($sidePanel);
        }
        return item.$el;
    },
    _createMenuGroup(group) {
        let $group = $('<div class="jmv-ribbon-menu-group"></div>');
        let $heading = $('<div class="jmv-ribbon-menu-heading">' + group.title + '</div>');
        $group.append($heading);
        let $items = $('<div class="jmv-group-items"></div>');
        let allHidden = true;
        for (let i = 0; i < group.items.length; i++) {
            $items.append(this._createMenuItem(group.items[i]));
            if ( ! group.items[i].hidden)
                allHidden = false;
        }
        if (allHidden) {
            group.hidden = true;
            $group.addClass('menu-item-hiding');
        }
        $group.append($items);

        group.$el = $group;
        return $group;
    },
    _refresh() {

        let html = '';
        let $icon = $('<div class="jmv-ribbon-button-icon"></div>');
        let $label = $('<div class="jmv-ribbon-button-label">' + this.title + '</div>');
        let $menu = $('<div class="jmv-ribbon-button-menu" style="display: none ;"></div>');

        let allHidden = true;
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (item.type === 'group')
                $menu.append(this._createMenuGroup(item));
            else
                $menu.append(this._createMenuItem(item));
            if ( ! item.hidden)
                allHidden = false;
        }

        this.$el.empty();
        this.$el.append($icon);
        this.$el.append($label);
        this.$el.append($menu);
        if (allHidden) {
            this.$el.addClass('menu-item-hiding');
            this.hidden = true;
        }

        this.$menu   = $menu;
        this.$menuItems = this.$el.find('.jmv-ribbon-menu-item:not(.module)');
        this.$moduleItems = this.$el.find('.jmv-ribbon-menu-item.module');
        this.$moduleItemCheck = this.$el.find('.jmv-ribbon-menu-item.module input');
        this.$groupItemLists = this.$el.find('.jmv-group-items:not(.side-panel .jmv-group-items)');

        this.$menuItems.click(event => this._itemClicked(event));
        this.$moduleItems.click(event => this._moduleClicked(event));
        this.$moduleItemCheck.change(event => this._moduleDisplayClicked(event));
        this.$groupItemLists.scroll(event => this._moduleListScroll(event));
    }
});

module.exports = RibbonMenu;
