
'use strict';

const $ = require('jquery');

const RibbonMenu = require('./ribbonmenu');
const RibbonTab = require('./ribbontab');

const Store = require('../store');

class AnalyseTab extends RibbonTab {
    constructor(modules, model) {
        super('analyses', 'A', _('Analyses'));
        this.modules = modules;
        this.buttons = [ ];
        this._analysesList = { };
        this._moduleCount = 0;

        this.modules.on('moduleVisibilityChanged', this._onModuleVisibilityChanged, this);

        this.$store = $(`<div class="jmv-store"></div>`).appendTo(document.body);
        this.store = new Store({ el : this.$store, model : model });
        this.store.on('notification', note => {
            this.emit('notification', note)
         });

        this.populate();
    }

    _onModuleVisibilityChanged(module) {
        if (module.visible)
            this._showModule(module.name);
        else
            this._hideModule(module.name);
    }

    _hideModule(name) {
        for (let i = 0; i < this.buttons.length; i++) {
            let button = this.buttons[i];
            if (button.hideModule)
                button.hideModule(name);
        }
    }

    _showModule(name) {
        for (let i = 0; i < this.buttons.length; i++) {
            let button = this.buttons[i];
            if (button.showModule)
                button.showModule(name);
        }
    }

    needsRefresh() {
        let modules = this.modules.get('modules');
        let count = 0;
        for (let module of modules) {
            let modInfo = this._analysesList[module.name];
            if (modInfo !== undefined && modInfo.version !== module.version)
                return true;

            if (modInfo === undefined && module.analyses.length > 0)
                return true;

            if (module.analyses.length > 0)
                count += 1;
        }

        if (count !== this._moduleCount)
            return true;

        return false;
    }

    async getRibbonItems(ribbon) {
        this.buttons = [ ];
        if ( ! this.modules)
            return this.buttons;

        let moduleList = [];
        this._analysesList = { };
        this._moduleCount = 0;
        for (let module of this.modules) {
            let _translate = await module.getTranslator();
            if (module.analyses.length > 0) {
                if (this._analysesList[module.name] === undefined) {
                    this._analysesList[module.name] = { version: module.version, analyses: [] };
                    this._moduleCount += 1;
                }
                let subtitle = module.title;
                // This regex is used to trim off any leading shortname (as well as seperators) from the title
                // E.G The module title 'GAMLj - General Analyses for Linear Models' will be trimmed to 'General Analyses for Linear Models'.
                let re = new RegExp('^' + module.name + '([ :-]{1,3})', 'i');
                subtitle = subtitle.replace(re, '');
                let moduleItem = { name : module.name, title : _translate(module.name), subtitle: _translate(subtitle), ns : 'installed', type: 'module', checked: module.visible  };
                let analyses = { name: 'analyses', title: _('Analyses'), type: 'group', items: [ ] };
                for (let analysis of module.analyses) {
                    this._analysesList[module.name].analyses.push(analysis.name);
                    let analysisItem = {
                        name: analysis.name,
                        ns: analysis.ns,
                        title: _translate(analysis.menuTitle),
                        subtitle: _translate(analysis.menuSubtitle),
                        moduleName: module.name,
                        resultsTitle: _translate(analysis.title)
                    };
                    analyses.items.push(analysisItem);
                }
                moduleItem.analyses = analyses;
                moduleList.push(moduleItem);
            }
        }

        let $button = $('<button class="modules-menu-item"></button>');
        let  button = new RibbonMenu($button, _('Modules'), 'modules', 'M', [
            { name : 'modules', title : _('jamovi library'), ns : 'app' },
            { name : 'manageMods', title : _('Manage installed'), ns : 'app' },
            { name: 'installedList', title: _('Installed Modules'), type: 'group', items: moduleList }
        ], true, false);
        this.buttons.push(button);

        let menus = { };
        let lastSub = null;

        for (let module of this.modules) {
            let _translate = await module.getTranslator();
            let isNew = module.new;
            for (let analysis of module.analyses) {
                let groupName = analysis.menuGroup;
                let subgroup = analysis.menuSubgroup;
                let menu = groupName in menus ? menus[groupName] : { _title: _translate(analysis.menuGroup) };
                if (analysis.ns === 'jmv' || menu.ns !== 'jmv')
                    menu.ns = analysis.ns;

                menu._new = isNew;
                let submenu = { name };
                if (subgroup in menu)
                    submenu = menu[subgroup];
                else
                    submenu = { name: subgroup, title: _translate(subgroup), items: [ ] };
                let item = {
                    name: analysis.name,
                    ns: analysis.ns,
                    title: _translate(analysis.menuTitle),
                    subtitle: _translate(analysis.menuSubtitle),
                    moduleName: module.name,
                    new: isNew,
                    hidden: module.visible === false,
                    resultsTitle: analysis.title
                };
                submenu.items.push(item);
                menu[subgroup] = submenu;
                menus[groupName] = menu;
            }
        }

        let shortcutIndex = 1;
        for (let groupName in menus) {
            let menu = menus[groupName];
            let flattened = [ ];
            let containsNew = menu._new;
            for (let subgroup in menu) {
                if (subgroup === '_new' || subgroup === '_title' || subgroup === 'ns')
                    continue;
                flattened.push({
                    name: subgroup,
                    title: menu[subgroup].title,
                    type: 'group',
                    items: menu[subgroup].items });
            }

            if (flattened.length > 0 && flattened[0].name === '') {
                let items = flattened.shift().items;
                flattened = items.concat(flattened);
            }

            let shortcutKey = menu.ns === 'jmv' ?  (shortcutIndex++).toString() : null;
            let $button = $('<button></button>');
            let  button = new RibbonMenu($button, menu._title, groupName, shortcutKey, flattened, false, containsNew);

            this.buttons.push(button);
        }

        return this.buttons;
    }

    _analysisSelected(analysis) {
        if (analysis.name === 'modules' && analysis.ns === 'app')
            this.store.show(1);
        else if (analysis.name === 'manageMods' && analysis.ns === 'app')
            this.store.show(0);
        else if (analysis.ns === 'installed')
            this.modules.setModuleVisibility(analysis.name, analysis.checked);
        else
            this.emit('analysisSelected', analysis);
    }
}

module.exports = AnalyseTab;
