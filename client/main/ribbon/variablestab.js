
'use strict';

const RibbonButton = require('./ribbonbutton');
const RibbonSeparator = require('./ribbonseparator');
const RibbonGroup = require('./ribbongroup');
import RibbonTab from './ribbontab';

class VariablesTab extends RibbonTab {
    constructor() {
        super('variables', 'V', _('Variables'));

        this.populate();
    }

    getRibbonItems(ribbon) {
        return [
            new RibbonGroup({ title: _('Edit'), margin: 'large', alignContents: 'center', items: [
                new RibbonButton({ title: _('Undo Edit'), name: 'undo', size: 'small', shortcutKey: 'z', shortcutPosition: { x: '25%', y: '75%' } }),
                new RibbonButton({ title: _('Redo Edit'), name: 'redo', size: 'small', shortcutKey: 'y', shortcutPosition: { x: '75%', y: '75%' } })
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Variables'), items: [
                new RibbonButton({ title: _('Edit'), name: 'editVar', margin: 'large', size: 'large', shortcutKey: 's', shortcutPosition: { x: '50%', y: '90%' } }),
                new RibbonButton({ title: _('Compute'), name: 'compute', margin: 'large', size: 'large', shortcutKey: 'q', shortcutPosition: { x: '50%', y: '90%' } }),
                new RibbonButton({ title: _('Transform'), name: 'transform', margin: 'large', size: 'large', shortcutKey: 't', shortcutPosition: { x: '50%', y: '90%' } }),
                new RibbonGroup({ orientation: 'vertical', margin: 'large', items: [
                    new RibbonButton({ title: _('Add'), name: 'addVar', shortcutKey: 'a', shortcutPosition: { x: '25%', y: '25%' }, subItems: [
                        new RibbonGroup({ title: _('Data Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertVar', shortcutKey: 'i', shortcutPosition: { x: '25px', y: '55%' } }),
                            new RibbonButton({ title: _('Append'), name: 'appendVar', shortcutKey: 'a', shortcutPosition: { x: '25px', y: '55%' } })
                        ]}),
                        new RibbonSeparator(),
                        new RibbonGroup({ title: _('Computed Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertComputed', shortcutKey: 'qi', shortcutPosition: { x: '25px', y: '55%' } }),
                            new RibbonButton({ title: _('Append'), name: 'appendComputed', shortcutKey: 'qa', shortcutPosition: { x: '25px', y: '55%' } })
                        ]}),
                        new RibbonSeparator(),
                        new RibbonGroup({ title: _('Transformed Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertRecoded', shortcutKey: 'ti', shortcutPosition: { x: '25px', y: '55%' } }),
                            new RibbonButton({ title: _('Append'), name: 'appendRecoded', shortcutKey: 'ta', shortcutPosition: { x: '25px', y: '55%' } })
                        ]}),
                    ]}),
                    new RibbonButton({ title: _('Delete'), name: 'delVar', shortcutKey: 'd', shortcutPosition: { x: '25%', y: '75%' } }),
                ]}),
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Rows'), items: [
                new RibbonButton({ title: _('Filters'), name: 'editFilters', margin: 'large', size: 'large', shortcutKey: 'f', shortcutPosition: { x: '50%', y: '90%' } }),
            ]})
        ];
    }
}

module.exports = VariablesTab;
