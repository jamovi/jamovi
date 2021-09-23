
'use strict';

const $ = require('jquery');

const RibbonSeparator = require('../ribbon/ribbonseparator');
const RibbonGroup = require('../ribbon/ribbongroup');
const ContextMenuButton = require('./contextmenubutton');

const createRowMenuItems = function(plural) {
    return [
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Cut'), name: 'cut', iconId: 'cut' }),
            new ContextMenuButton({ title: _('Copy'), name: 'copy', iconId: 'copy' }),
            new ContextMenuButton({ title: _('Paste'), name: 'paste', iconId: 'paste' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Filters'), name: 'editFilters', iconId: 'editFilters' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({  orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Insert Row...'), name: 'insertRow', iconId: 'insertrow' }),
            new ContextMenuButton({ title: _('Append Row...'), name: 'appendRow', iconId: 'appendrow' }),
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Delete Row') + (plural ? 's' : ''), name: 'delRow', iconId: 'delrow' })
        ]}),
    ];
};

const createFilterRowMenuItems = function() {
    return [
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Copy'), name: 'copy', iconId: 'copy' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Filters'), name: 'editFilters', iconId: 'editFilters' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Append Row...'), name: 'appendRow', iconId: 'appendrow' }),
            new ContextMenuButton({ title: _('Insert Row...'), name: 'insertRow', iconId: 'insertrow' }),
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Delete Row'), name: 'delRow', iconId: 'delrow' })
        ]}),
    ];
};

const createVariableMenuItems = function(plural, noData) {
    let menu = [
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Add Variable'), name: 'addVar', subItems: [
                new RibbonGroup({ title: _('Data Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                    new ContextMenuButton({ title: _('Insert'), name: 'insertVar' }),
                    new ContextMenuButton({ title: _('Append'), name: 'appendVar' })
                ]}),
                new RibbonGroup({ title: _('Computed Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                    new ContextMenuButton({ title: _('Insert'), name: 'insertComputed' }),
                    new ContextMenuButton({ title: _('Append'), name: 'appendComputed' })
                ]}),
                new RibbonGroup({ title: _('Transformed Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                    new ContextMenuButton({ title: _('Insert'), name: 'insertRecoded' }),
                    new ContextMenuButton({ title: _('Append'), name: 'appendRecoded' })
                ]})
            ]})
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: n_('Delete Variable', 'Delete Variables', plural ? 2 : 1), name: 'delVar' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Setup...'), name: 'editVar' })
        ]}),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Transform...'), name: 'transform' })
        ]}),
    ];

    if (! noData) {
        menu.unshift(new RibbonSeparator());
        menu.unshift(new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: _('Cut'), name: 'cut' }),
            new ContextMenuButton({ title: _('Copy'), name: 'copy' }),
            new ContextMenuButton({ title: _('Paste'), name: 'paste' })
        ]}));
    }

    return menu;
};

const createAppendVariableMenuItems = function() {
    return [
        new RibbonGroup({ orientation: 'vertical', items: [
            new RibbonGroup({ title: _('Transformed Variable'), orientation: 'horizontal', titlePosition: 'top', items: [
                new ContextMenuButton({ title: _('Insert'), name: 'insertRecoded' }),
                new ContextMenuButton({ title: _('Append'), name: 'appendRecoded' })
            ]}),
            new RibbonGroup({ title: _('Computed Variable'), orientation: 'horizontal', titlePosition: 'top', items: [
                new ContextMenuButton({ title: _('Insert'), name: 'insertComputed' }),
                new ContextMenuButton({ title: _('Append'), name: 'appendComputed' })
            ]}),
            new RibbonGroup({ title: _('Data Variable'), orientation: 'horizontal', titlePosition: 'top', items: [
                new ContextMenuButton({ title: _('Insert'), name: 'insertVar' }),
                new ContextMenuButton({ title: _('Append'), name: 'appendVar' })
            ]})
        ]})
    ];
};

const createFilterMenuItems = function(noData) {
    if (noData) {
        return [
            new RibbonGroup({ orientation: 'vertical', items: [
                new ContextMenuButton({ title: _('Delete Filter'), name: 'delVar' })
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ orientation: 'vertical', items: [
                new ContextMenuButton({ title: _('Edit...'), name: 'editFilters' })
            ]}),
        ];
    }
    else {
        return [
            new RibbonGroup({ orientation: 'vertical', items: [
                new ContextMenuButton({ title: _('Copy'), name: 'copy' })
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ orientation: 'vertical', items: [
                new ContextMenuButton({ title: _('Delete Filter'), name: 'delVar' })
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ orientation: 'vertical', items: [
                new ContextMenuButton({ title: _('Edit...'), name: 'editFilters' })
            ]}),
        ];
    }
};

const createResultsObjectMenuItems = function(entries, parent, levelId) {
    let items = [];
    for (let entry of entries) {

        if (entry.splitter)
            items.push(new RibbonSeparator());

        let title = entry.label;
        let iconId = null;
        if (title === 'Export')
            title = title + '...';
        else if (title === 'Copy')
            iconId = 'copy';

        let params = { title: title, iconId: iconId, name: entry.label + '_' + levelId + items.length, useActionHub: false };
        if (entry.options !== undefined && entry.options.length > 0) {
            params.subItems = createResultsObjectMenuItems(entry.options, entry, items.length);
            params.eventData = { type: 'activated', address: entry.address };
        }
        else {
            let entryData = {
                label  : title,
                op     : entry.op || entry.label.toLowerCase(),
                address: parent.address,
                type   : parent.type,
                title  : parent.title,
            };
            params.eventData = { type: 'selected', address: entryData.address, op: entryData.op, target: entryData };
        }

        let button = new ContextMenuButton(params);

        items.push(button);
    }


    return [new RibbonGroup({ orientation: 'vertical', items: items })];
};

module.exports = { createRowMenuItems, createVariableMenuItems, createResultsObjectMenuItems, createFilterMenuItems, createFilterRowMenuItems, createAppendVariableMenuItems };
