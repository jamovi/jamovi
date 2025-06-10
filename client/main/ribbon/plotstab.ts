
'use strict';

import RibbonMenu from './ribbonmenu';
import RibbonTab from './ribbontab';
import Placeholder from './placeholder';
import RibbonButton from './ribbonbutton';
const focusLoop = require('../../common/focusloop');

//import Store from '../store';

class PlotsTab extends RibbonTab {
    buttons = [ ];
    settings;
    modules;
    //store: Store;
    _moduleCount = 0;
    _analysesList = { };

    constructor(modules, model) {
        super('plots', 'P', _('Plots'));
        this.modules = modules;
        this.settings = model.settings();

        this.modules.on('moduleVisibilityChanged', this._onModuleVisibilityChanged, this);

        /*let storeElement = document.createElement('div');
        storeElement.classList.add('jmv-store');
        document.body.append(storeElement);
        this.store = new Store({ el : storeElement, model : model });
        this.store.on('notification', note => {
            this.emit('notification', note);
         });*/

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

    async getRibbonItems() {
        this.buttons = [ ];
        if ( ! this.modules)
            return this.buttons;

        let moduleList = [];
        this._analysesList = { };
        this._moduleCount = 0;
        let modules = this.modules.get('modules');
        for (let module of modules) {
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
                let analyses = { name: 'plots', title: _('Plots'), type: 'group', items: [ ] };
                for (let analysis of module.analyses) {
                    if (analysis.category === 'plots') {
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

        /*let buttonId = focusLoop.getNextAriaElementId('button');
        let buttonElement = document.createElement('button');
        buttonElement.classList.add('modules-menu-item');
        buttonElement.setAttribute('id', buttonId);
        let  button = new RibbonMenu(buttonElement, _('Modules'), 'modules', 'M', [
            { name : 'modules', title : _('jamovi library'), ns : 'app' },
            { name : 'manageMods', title : _('Manage installed'), ns : 'app' },
            { name: 'installedList', title: _('Installed Modules'), type: 'group', items: moduleList }
        ], true, false);
        this.buttons.push(button);*/

        let menus = { };
        let lastSub = null;

        for (let module of modules) {
            let _translate = await module.getTranslator();
            let isNew = module.new;
            for (let analysis of module.analyses) {
                if (analysis.category !== 'plots')
                    continue;

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
            let button = null;
            if (groupName === '.') {
                //let subgroups = [];
                let buttons = [];
                for (let subgroup in menu) {
                    
                    if (subgroup === '_new' || subgroup === '_title' || subgroup === 'ns')
                        continue;
                    
                    
                    for (let item of menu[subgroup].items) {
                        let name = `${item.ns}-${item.name}`;
                        let analysisButton = new RibbonButton({ class: 'jmv-analyses-button', title: _(item.title), name: name, size: 'large', /*shortcutKey: 'v', shortcutPosition: { x: '50%', y: '90%' }*/ });
                        analysisButton.on('menuActioned', () => {
                            let analysis = { name:item.name, ns:item.ns, title:item.title };
                            this._analysisSelected(analysis);
                        });
                        buttons.push(analysisButton);
                    }
                    //subgroups.push(new RibbonGroup({ title: '', margin: 'large', items: buttons }));
                }
                button = buttons; //new RibbonGroup({ title: '', margin: 'large', items: buttons });
            }
            else {
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
                let buttonElement = document.createElement('button');
                buttonElement.setAttribute('id', buttonId2);
                button = new RibbonMenu(buttonElement, menu._title, groupName, shortcutKey, flattened, false, containsNew);
            }

            this.buttons.push(...button);
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

    _analysisSelected(analysis) {
       /* if (analysis.name === 'modules' && analysis.ns === 'app')
            this.store.show(1);
        else if (analysis.name === 'manageMods' && analysis.ns === 'app')
            this.store.show(0);
        else if (analysis.ns === 'installed')
            this.modules.setModuleVisibility(analysis.name, analysis.checked);
        else*/
            this.emit('analysisSelected', analysis);
    }
}

export default PlotsTab;
