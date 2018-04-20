
'use strict';

const $ = require('jquery');

const RibbonSeparator = require('../ribbon/ribbonseparator');
const RibbonGroup = require('../ribbon/ribbongroup');
const ContextMenuButton = require('./contextmenubutton');

const createRowMenuItems = function() {
    return [
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Cut', name: 'cut', iconId: 'cut' }),
            new ContextMenuButton({ title: 'Copy', name: 'copy', iconId: 'copy' }),
            new ContextMenuButton({ title: 'Paste', name: 'paste', iconId: 'paste' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ /*title: "Awesome", titlePosition: "top",*/ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Insert Row...', name: 'insertRow', iconId: 'insertrow' }),
            new ContextMenuButton({ title: 'Append Row...', name: 'appendRow', iconId: 'appendrow' }),
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Delete Row', name: 'delRow', iconId: 'delrow' })
        ]}),
    ];
};

const createFilterRowMenuItems = function() {
    return [
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Copy', name: 'copy', iconId: 'copy' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ /*title: "Awesome", titlePosition: "top",*/ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Insert Row...', name: 'insertRow', iconId: 'insertrow' }),
            new ContextMenuButton({ title: 'Append Row...', name: 'appendRow', iconId: 'appendrow' }),
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Delete Row', name: 'delRow', iconId: 'delrow' })
        ]}),
    ];
};

const createVariableMenuItems = function() {
    return [
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Cut', name: 'cut' }),
            new ContextMenuButton({ title: 'Copy', name: 'copy' }),
            new ContextMenuButton({ title: 'Paste', name: 'paste' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Add Variable', name: 'addVar', subItems: [
                new RibbonGroup({ title: 'Data Variable', orientation: 'vertical', titlePosition: 'top', items: [
                    new ContextMenuButton({ title: 'Insert', name: 'insertVar' }),
                    new ContextMenuButton({ title: 'Append', name: 'appendVar' })
                ]}),
                new RibbonGroup({ title: 'Computed Variable', orientation: 'vertical', titlePosition: 'top', items: [
                    new ContextMenuButton({ title: 'Insert', name: 'insertComputed' }),
                    new ContextMenuButton({ title: 'Append', name: 'appendComputed' })
                ]})
            ]}),
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Delete Variable', name: 'delVar' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Setup...', name: 'editVar' })
        ]}),
    ];
};

const createFilterMenuItems = function() {
    return [
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Copy', name: 'copy' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Delete Filter', name: 'delVar' })
        ]}),
        new RibbonSeparator(),
        new RibbonGroup({ orientation: 'vertical', items: [
            new ContextMenuButton({ title: 'Edit...', name: 'editFilters' })
        ]}),
    ];
};

const createResultsObjectMenuItems = function(entries, parent, levelId) {
    let items = [];
    for (let entry of entries) {

        if (entry.splitter)
            items.push(new RibbonSeparator());

        if (entry.address !== undefined && entry.address.length === 0) { // the analysis
            if (entry.options === undefined)
                entry.options = [];
            entry.options.push({ label: 'Remove', splitter: true });
        }

        let title = entry.label;
        let iconId = null;
        if (title === 'Save')
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
                op     : entry.label.toLowerCase(), //this needs improving
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

module.exports = { createRowMenuItems, createVariableMenuItems, createResultsObjectMenuItems, createFilterMenuItems, createFilterRowMenuItems };
