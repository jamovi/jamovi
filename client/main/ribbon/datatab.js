
'use strict';

const RibbonButton = require('./ribbonbutton');
const RibbonSeparator = require('./ribbonseparator');
const RibbonGroup = require('./ribbongroup');
const RibbonTab = require('./ribbontab');

import ActionHub from '../actionhub';


class DataTab extends RibbonTab {

    constructor() {
        super('data', 'D', _('Data'));

        ActionHub.get('weights').on('request', () => {
            this.emit('analysisSelected', { name: 'weights', ns: 'jmv', title: _('Weights'), index: 1, onlyOne: true });
        });
    }

    getRibbonItems(ribbon) {
        return [
            new RibbonGroup({ title: _('Clipboard'), margin: 'large', items: [
                new RibbonButton({ title: _('Paste'), name: 'paste', size: 'large', shortcutKey: 'v', shortcutPosition: { x: '50%', y: '90%' } }),
                new RibbonGroup({ orientation: 'vertical', items: [
                    new RibbonButton({ title: _('Cut'), name: 'cut', size: 'small', shortcutKey: 'x', shortcutPosition: { x: '25%', y: '25%' } }),
                    new RibbonButton({ title: _('Copy'), name: 'copy', size: 'small', shortcutKey: 'c', shortcutPosition: { x: '25%', y: '75%' } })
                ]})
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Edit'), margin: 'large', alignContents: 'center', items: [
                new RibbonButton({ title: _('Undo Edit'), name: 'undo', size: 'small', shortcutKey: 'z', shortcutPosition: { x: '25%', y: '75%' } }),
                new RibbonButton({ title: _('Redo Edit'), name: 'redo', size: 'small', shortcutKey: 'y', shortcutPosition: { x: '75%', y: '75%' } })
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Variables'), items: [
                new RibbonButton({ title: _('Setup'), ariaLabel: _('Variable setup'), name: 'editVar', margin: 'large', size: 'large', shortcutKey: 's', shortcutPosition: { x: '50%', y: '90%' } }),
                new RibbonButton({ title: _('Compute'), ariaLabel: _('Insert new computed variable'), name: 'compute', margin: 'large', size: 'large', shortcutKey: 'q', shortcutPosition: { x: '50%', y: '90%' } }),
                new RibbonButton({ title: _('Transform'), ariaLabel: _('Insert new transformed variable'), name: 'transform', margin: 'large', size: 'large', shortcutKey: 't', shortcutPosition: { x: '50%', y: '90%' } }),
                new RibbonButton({ title: _('Weights'), ariaLabel: _('Data weights'), name: 'weights', margin: 'large', size: 'large', shortcutKey: 'w', shortcutPosition: { x: '50%', y: '90%' } }),
                new RibbonGroup({ orientation: 'vertical', margin: 'large', items: [
                    new RibbonButton({ title: _('Add'), ariaLabel: _('Add new variable'), name: 'addVar', shortcutKey: 'a', shortcutPosition: { x: '25%', y: '25%' }, subItems: [
                        new RibbonGroup({ title: _('Data Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertVar', shortcutKey: 'i', shortcutPosition: { x: '25px', y: '55%' } }),
                            new RibbonButton({ title: _('Append'), name: 'appendVar', shortcutKey: 'a', shortcutPosition: { x: '25px', y: '55%' }  })
                        ]}),
                        new RibbonSeparator(),
                        new RibbonGroup({ title: _('Computed Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertComputed', shortcutKey: 'qi', shortcutPosition: { x: '25px', y: '55%' }  }),
                            new RibbonButton({ title: _('Append'), name: 'appendComputed', shortcutKey: 'qa', shortcutPosition: { x: '25px', y: '55%' }  })
                        ]}),
                        new RibbonSeparator(),
                        new RibbonGroup({ title: _('Transformed Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertRecoded', shortcutKey: 'ti', shortcutPosition: { x: '25px', y: '55%' }  }),
                            new RibbonButton({ title: _('Append'), name: 'appendRecoded', shortcutKey: 'ta', shortcutPosition: { x: '25px', y: '55%' }  })
                        ]}),
                        /* new RibbonGroup({ title: _('Output Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertOutput' }),
                            new RibbonButton({ title: _('Append'), name: 'appendOutput' })
                        ]})*/
                    ]}),
                    new RibbonButton({ title: _('Delete'), ariaLabel: _('Delete selected variable(s)'), name: 'delVar', shortcutKey: 'd', shortcutPosition: { x: '25%', y: '75%' } }),
                ]}),
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Rows'), items : [
                new RibbonButton({ title: _('Filters'), ariaLabel: _('Filters'), name: 'editFilters', margin: 'large', size: 'large', shortcutKey: 'f', shortcutPosition: { x: '50%', y: '90%' } }),
                new RibbonGroup({ orientation: 'vertical', margin: 'large', items: [
                    new RibbonButton({ title: _('Add'), ariaLabel: _('Add new rows'), name: 'addRow', shortcutKey: 'ra', shortcutPosition: { x: '25%', y: '25%' }, subItems: [
                        new RibbonButton({ title: _('Insert'), name: 'insertRow', shortcutKey: 'i', shortcutPosition: { x: '25px', y: '55%' }  }),
                        new RibbonButton({ title: _('Append'), name: 'appendRow', shortcutKey: 'a', shortcutPosition: { x: '25px', y: '55%' }  }),
                    ]}),
                    new RibbonButton({ title: _('Delete'), ariaLabel: _('Delete selected rows'), name: 'delRow', shortcutKey: 'rd', shortcutPosition: { x: '25%', y: '75%' } }),
                ]})
            ]})
        ];
    }
}

module.exports = DataTab;
