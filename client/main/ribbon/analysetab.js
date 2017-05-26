
'use strict';

const $ = require('jquery');

const RibbonMenu = require('./ribbonmenu');

const AnalyseTab = function(modules) {
    this.name = "analyse";

    this.title = "Analyse";

    this.modules = modules;

    this.getRibbonItems = function(ribbon) {
        let buttons = [ ];

        let $button = $('<div></div>');
        let  button = new RibbonMenu($button, 'Modules', 'modules', [
            { name : 'modules', title : 'jamovi library', ns : 'app' }
        ], true, false);
        buttons.push(button);

        let menus = { };
        let lastSub = null;

        for (let module of this.modules) {
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

            let $button = $('<div></div>');
            let  button = new RibbonMenu($button, group, group, flattened, false, containsNew);
            buttons.push(button);
        }

        return buttons;
    };
};

module.exports = AnalyseTab;
