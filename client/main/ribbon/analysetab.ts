
'use strict';

import RibbonMenu from './ribbonmenu';
import RibbonTab, { RibbonItem } from './ribbontab';
import Placeholder from './placeholder';
import focusLoop from '../../common/focusloop';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

import Store from '../store';

export class AnalyseTab extends RibbonTab {
    buttons: RibbonItem[] = [ ];
    settings;
    modules;
    store: Store;
    _moduleCount = 0;
    _analysesList = { };

    constructor(modules, model) {
        super('analyses', 'A', _('Analyses'));
        this.modules = modules;
        this.buttons = [ ];
        this._analysesList = { };
        this._moduleCount = 0;
        this.settings = model.settings();

        this.modules.on('moduleVisibilityChanged', this._onModuleVisibilityChanged, this);

        this.store = new Store(model);
        this.store.classList.add('jmv-store');
        document.body.append(this.store);
        this.store.addEventListener('notification', (event: CustomEvent) => {
            this.emit('notification', event.detail);
         });

        this.populate();
    }

    _onModuleVisibilityChanged(module) {
        if (module.visible)
            this._showModule(module.name);
        else
            this._hideModule(module.name);
    }

    _hideModule(name: string) {
        for (let i = 0; i < this.buttons.length; i++) {
            let button = this.buttons[i];
            if (button instanceof RibbonMenu)
                button.hideModule(name);
        }
    }

    _showModule(name) {
        for (let i = 0; i < this.buttons.length; i++) {
            let button = this.buttons[i];
            if (button instanceof RibbonMenu)
                button.showModule(name);
        }
    }

    override needsRefresh() {
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

    override async getRibbonItems() {
        this.buttons = [ ];
        if ( ! this.modules)
            return this.buttons;

        let moduleList = [];
        this._analysesList = { };
        this._moduleCount = 0;
        let modules = this.modules.get('modules');
        for (let module of modules) {
            if (module.analyses.length > 0) {
                let _translate = await module.getTranslator();
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
                    if (analysis.category === undefined || analysis.category === 'analyses') {
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
                }
                if (analyses.items.length > 0) {
                    moduleItem.analyses = analyses;
                    moduleList.push(moduleItem);
                }
                else {
                    delete this._analysesList[module.name];
                    this._moduleCount -= 1;
                }
            }
        }

        let buttonId = focusLoop.getNextAriaElementId('button');
        let  button = new RibbonMenu(_('Modules'), 'modules', 'M', [
            { name : 'modules', title : _('jamovi library'), ns : 'app' },
            { name : 'manageMods', title : _('Manage installed'), ns : 'app' },
            { name: 'installedList', title: _('Installed Modules'), type: 'group', items: moduleList }
        ], true, false);
        button.setAttribute('id', buttonId);
        button.classList.add('jmv-modules-menu-item');
        button.style.position = 'sticky';
        button.style.right =  '0px';
        this.buttons.push(button);

        let menus = { };
        for (let module of modules) {
            let _translate = await module.getTranslator();
            let isNew = module.new;
            for (let analysis of module.analyses) {
                if (analysis.category !== undefined && analysis.category !== 'analyses')
                    continue;

                let groupName = analysis.menuGroup;
                let subgroup = analysis.menuSubgroup;
                let menu = groupName in menus ? menus[groupName] : { _title: _translate(analysis.menuGroup) };
                if (analysis.ns === 'jmv' || menu.ns !== 'jmv')
                    menu.ns = analysis.ns;

                menu._new = isNew;
                let submenu;
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
            let buttonId2 = focusLoop.getNextAriaElementId('button');
            let button = new RibbonMenu(menu._title, groupName, shortcutKey, flattened, false, containsNew);
            button.setAttribute('id', buttonId2);
            this.buttons.push(button);
        }

        if (this.settings.attributes.settingsRecieved === false) {
            this.buttons.push(new Placeholder('exploration', _('Exploration')));
            this.buttons.push(new Placeholder('t-tests', _('T-Tests')));
            this.buttons.push(new Placeholder('anova', _('ANOVA')));
            this.buttons.push(new Placeholder('regression', _('Regression')));
            this.buttons.push(new Placeholder('frequencies', _('Frequencies')));
            this.buttons.push(new Placeholder('factor', _('Factor')));
        }

        return this.buttons;
    }

    private _analysisSelected(analysis) {
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

export default AnalyseTab;
