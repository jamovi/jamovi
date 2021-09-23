
'use strict';

const $ = require('jquery');

const RibbonMenu = require('./ribbonmenu');

const AnalyseTab = function(modules) {
    this.name = 'analyses';

    this.title = _('Analyses');

    this.modules = modules;

    this._analysesList = { };
    this._moduleCount = 0;

    this.needsRefresh = function() {
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
    };

    this.getRibbonItems = async function(ribbon) {
        let buttons = [ ];

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

        let $button = $('<div class="modules-menu-item"></div>');
        let  button = new RibbonMenu($button, _('Modules'), 'modules', [
            { name : 'modules', title : _('jamovi library'), ns : 'app' },
            { name : 'manageMods', title : _('Manage installed'), ns : 'app' },
            { name: 'installedList', title: _('Installed Modules'), type: 'group', items: moduleList }
        ], true, false);
        buttons.push(button);

        let menus = { };
        let lastSub = null;

        for (let module of this.modules) {
            let _translate = await module.getTranslator();
            let isNew = module.new;
            for (let analysis of module.analyses) {
                let groupName = analysis.menuGroup;
                let subgroup = analysis.menuSubgroup;
                let menu = groupName in menus ? menus[groupName] : { _title: _translate(analysis.menuGroup)  };
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

        for (let groupName in menus) {
            let menu = menus[groupName];
            let flattened = [ ];
            let containsNew = menu._new;
            for (let subgroup in menu) {
                if (subgroup === '_new' || subgroup === '_title')
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

            let $button = $('<div></div>');
            let  button = new RibbonMenu($button, menu._title, groupName, flattened, false, containsNew);
            buttons.push(button);
        }

        return buttons;
    };
};

module.exports = AnalyseTab;
