
'use strict';

const $ = require('jquery');
const tarp = require('../utils/tarp');
const focusLoop = require('../../common/focusloop');
const Backbone = require('backbone');
const Menu = require('../../common/menu');

const RibbonMenu = Backbone.View.extend({

    initialize($el, title, name, shortcutKey, items, right, containsNew) {

        this.$el = $el;
        this.$el.addClass('jmv-ribbon-button jmv-analyses-button');
        this.$el.attr('tabindex', '0');
        this.focusId = focusLoop.getNextFocusId();
        this.$el.attr('data-focus-id', this.focusId);
        this.$el.attr('role', 'menuitem');

        this.title = title;
        this.name = name;
        this.items = items;
        this.containsNew = containsNew;
        this.dock = right ? 'right' : 'left';
        this.shortcutKey = shortcutKey;

        if (shortcutKey) {
            let keySplit = shortcutKey.split('-');
            let stcOptions = { key: keySplit[0].toUpperCase(), action: event => this._clicked(event, false) };
            if (keySplit.length > 1)
                stcOptions.position = keySplit[1].toUpperCase();
            focusLoop.applyShortcutOptions(this.$el[0], stcOptions);
        }

        this.$el.attr('data-name', this.name.toLowerCase());
        //this.$el.attr('aria-disabled', true);
        if (containsNew)
            this.$el.addClass('contains-new');
        if (right)
            this.$el.addClass('right');

        this.$el.on('mousedown', event => {
            if (this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.$el.on('mouseup', event => {
            if ( ! this.menu)
                this._clicked(event, event.detail > 0);
        });
        this.$el.on('keydown', (event) => {
            if ((event.altKey && event.code == 'ArrowDown') || event.code === 'Enter' || event.code === 'Space')
                this._clicked(event, false);
        });

        this._refresh();
    },
    setParent(parent, parentShortcutPath) {
        this.parent = parent;

        if (this.shortcutKey)
            focusLoop.applyShortcutOptions(this.$el[0], { path: parentShortcutPath });
    },
    setEnabled(enabled) {
        this.$el.attr('aria-disabled', ! enabled);
    },
    _notifySelected(name, ns, title, checked) {
        let analysis = { name, ns, title, checked };
        this.parent._analysisSelected(analysis);
        if (checked === undefined)
            this.hideMenu();
    },
    hideMenu(fromMouse) {
        this.menu.hide(fromMouse);
    },
    showMenu(fromMouse) {
        this.positionMenu(fromMouse);
    },
    hideModule(name, item) {
        if (item === undefined)
            item = this;

        let changed = false;
        if (item.moduleName === name)
            changed = true;

        if (item.type === 'module' && item.name === name) {
            let menuId = item.$el[0].getAttribute('aria-controls');
            document.querySelector(`#${menuId} input`).checked = false;
        }

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

        if (item.type === 'module' && item.name === name) {
            let menuId = item.$el[0].getAttribute('aria-controls');
            document.querySelector(`#${menuId} input`).checked = true;
        }

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
    _toggleMenu(fromMouse) {
        if (this.menu.isVisible())
            this.hideMenu(fromMouse);
        else
            this.showMenu(fromMouse);
    },
    _clicked(event, fromMouse) {
        let $target = $(event.target);
        if ($target.closest(this.menu.$el).length !== 0)
            return;
        this._toggleMenu(fromMouse);
        event.preventDefault();
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
    showSidePanel(item, fromMouse) {
        let y = item.$el.offset().top;
        let x = item.$el.offset().left - item.sidePanel.$el.outerWidth(true);
        item.sidePanel.show(x, y, { withMouse: fromMouse });
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
    _createMenuItem(item, level) {
        if (item.type === 'module')
            return this._createModuleItem(item, level);

        let classes = 'jmv-ribbon-menu-item';
        if (item.new)
            classes += ' new';
        if (item.hidden)
            classes += ' menu-item-hiding';

        let html = `<button role="menuitem" data-name="${ item.name }" data-ns="${ item.ns }" data-title="${ item.title }" data-rtitle="${ item.resultsTitle }" class="${ classes }" tabindex="0">`;
        html += '<div class="description">';
        html += '<div>' + item.title + '</div>';
        if (item.subtitle)
            html += '<div class="jmv-ribbon-menu-item-sub">' + item.subtitle + '</div>';
        html += '</div>';
        html += '</button>';

        item.$el = $(html);

        focusLoop.createHoverItem(item);

        return item.$el;
    },
    _createModuleItem(item, level) {
        let classes = 'jmv-ribbon-menu-item module';
        let html = `<button role="menuitem" data-name="${ item.name }" data-ns="${  item.ns }" data-title="${ item.title }" class="${ classes }" tabindex="0">`;
        html += '<div class="to-analyses-arrow"></div>';
        html += '<div class="description">';
        html += '<div>' + item.title + '</div>';
        if (item.subtitle)
            html += `<div class="jmv-ribbon-menu-item-sub">${ item.subtitle }</div>`;
        html += '</div>';
        html += '</button>';
        item.$el = $(html);
        if (item.analyses !== undefined) {

            let labelId = focusLoop.getNextAriaElementId('label');
            item.sidePanel = new Menu(item.$el[0], level + 1, { exitKeys:['ArrowRight'] });
            item.sidePanel.$el.attr('aria-laeblledby', labelId);
            item.sidePanel.$el.addClass('side-panel');
            item.sidePanel.$el.append(`<div id="${labelId}" class="side-panel-heading">Module - ${ item.name }</div>`);
            item.sidePanel.$el.append(`<label class="display-in-menu"><input type="checkbox" role="menuitemcheckbox" data-name="${ item.name }" data-ns="${ item.ns }" ${ (item.checked ? 'checked' : '') }>${ _('Show in main menu') }</label>`);

            let $sidePanel = item.sidePanel.$el;
            let $analysesGroup = this._createMenuGroup(item.analyses, level + 1);
            $analysesGroup.addClass('module-analysis-list');
            $sidePanel.append($analysesGroup);
            item.sidePanel.connect(this.menu);

            item.$el.on('mousedown', (event) => {
                this.showSidePanel(item, event.detail > 0);
                event.preventDefault();
            });
            item.$el.on('keydown', (event) => {
                if (event.code == 'ArrowLeft' || event.code === 'Enter' || event.code === 'Space')
                    this.showSidePanel(item, false);
            });

            let $moduleItemCheck = $sidePanel.find('input');
            $moduleItemCheck.change(event => this._moduleDisplayClicked(event));
        }
        focusLoop.createHoverItem(item, () => {
            if (item.analyses) {
                this.showSidePanel(item, true);
            }
            else
                item.$el[0].focus({preventScroll:true});
        });
        return item.$el;
    },
    _createMenuGroup(group, level) {
        let labelId = focusLoop.getNextAriaElementId('label');
        let $group = $(`<div class="jmv-ribbon-menu-group" role="group" aria-labelledby="${labelId}"></div>`);
        let $heading = $(`<label id="${labelId}" class="jmv-ribbon-menu-heading">${group.title}</label>`);
        $group.append($heading);
        let $items = $('<div class="jmv-group-items" role="presentation"></div>');

        let allHidden = true;
        for (let i = 0; i < group.items.length; i++) {
            $items.append(this._createMenuItem(group.items[i], level));
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

        if ( ! this.menu) {
            this.menu = new Menu(this.$el[0], 1, { className: 'analysis-menu', exitKeys: [ 'Alt+ArrowUp' ] });
            this.menu.on('menu-hidden', (event) => {
                this.$el.find('.jmv-ribbon-menu-item.open').removeClass('open');
            });
            this.menu.on('menu-shown', (event) => {
                this.$el.removeClass('contains-new');
            });
        }

        let $menu = this.menu.$el;

        $menu.empty();
        let allHidden = true;
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (item.type === 'group')
                $menu.append(this._createMenuGroup(item, 1));
            else
                $menu.append(this._createMenuItem(item, 1));
            if ( ! item.hidden)
                allHidden = false;

            if (item.getMenus) {
                let subMenus = item.getMenus();
                for (let subMenu of subMenus){
                    if (!subMenu.connected)
                        subMenu.connect(this.menu);
                }
            }
        }

        this.$el.empty();
        this.$el.append($icon);
        this.$el.append($label);

        if (allHidden) {
            this.$el.addClass('menu-item-hiding');
            this.hidden = true;
        }

        this.$menuItems = $menu.find('.jmv-ribbon-menu-item:not(.module)');
        this.$moduleItems = $menu.find('.jmv-ribbon-menu-item.module');

        this.$groupItemLists = $menu.find('.jmv-group-items:not(.side-panel .jmv-group-items)');

        this.$menuItems.click(event => this._itemClicked(event, event.detail > 0));

        this.$groupItemLists.scroll(event => this._moduleListScroll(event));
    },
    getMenus() {
        if (this.menu)
            return [ this.menu ];
        return [];
    },
    positionMenu(fromMouse) {
        let anchor = 'left';
        let x = this.$el.offset().left;
        let y = this.$el.offset().top + this.$el.outerHeight(false);
        if (this.inMenu) {
            x += this.menu.$el.outerWidth(true);
            y -= this.$el.outerHeight() + 10;
        }
        this.menu.show(x, y, { withMouse: fromMouse });
    }
});

module.exports = RibbonMenu;
