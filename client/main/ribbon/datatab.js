
'use strict';

const RibbonButton = require('./ribbonbutton');
const RibbonSeparator = require('./ribbonseparator');
const RibbonGroup = require('./ribbongroup');

const DataTab = function() {
    this.name = "data";

    this.title = _("Data");

    this.getRibbonItems = function(ribbon) {
        return [
            new RibbonGroup({ title: _('Clipboard'), margin: 'large', items: [
                new RibbonButton({ title: _('Paste'), name: 'paste', size: 'large' }),
                new RibbonGroup({ orientation: 'vertical', items: [
                    new RibbonButton({ title: _('Cut'), name: 'cut', size: 'small' }),
                    new RibbonButton({ title: _('Copy'), name: 'copy', size: 'small' })
                ]})
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Edit'), margin: 'large', alignContents: 'center', items: [
                new RibbonButton({ title: _('Undo Edit'), name: 'undo', size: 'small' }),
                new RibbonButton({ title: _('Redo Edit'), name: 'redo', size: 'small' })
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Variables'), items: [
                new RibbonButton({ title: _('Setup'), name: 'editVar', margin: 'large', size: 'large' }),
                new RibbonButton({ title: _('Compute'), name: 'compute', margin: 'large', size: 'large' }),
                new RibbonButton({ title: _('Transform'), name: 'transform', margin: 'large', size: 'large' }),
                new RibbonGroup({ orientation: 'vertical', margin: 'large', items: [
                    new RibbonButton({ title: _('Add'), name: 'addVar', subItems: [
                        new RibbonGroup({ title: _('Data Variable'), orientation: 'horizontal', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertVar' }),
                            new RibbonButton({ title: _('Append'), name: 'appendVar' })
                        ]}),
                        new RibbonGroup({ title: _('Computed Variable'), orientation: 'horizontal', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertComputed' }),
                            new RibbonButton({ title: _('Append'), name: 'appendComputed' })
                        ]}),
                        new RibbonGroup({ title: _('Transformed Variable'), orientation: 'horizontal', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertRecoded' }),
                            new RibbonButton({ title: _('Append'), name: 'appendRecoded' })
                        ]}),
                        /* new RibbonGroup({ title: _('Output Variable'), orientation: 'horizontal', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertOutput' }),
                            new RibbonButton({ title: _('Append'), name: 'appendOutput' })
                        ]})*/
                    ]}),
                    new RibbonButton({ title: _('Delete'), name: 'delVar' }),
                ]}),
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Rows'), items : [
                new RibbonButton({ title: _('Filters'), name: 'editFilters', margin: 'large', size: 'large' }),
                new RibbonGroup({ orientation: 'vertical', margin: 'large', items: [
                    new RibbonButton({ title: _('Add'), name: 'addRow', subItems: [
                        new RibbonButton({ title: _('Insert'), name: 'insertRow' }),
                        new RibbonButton({ title: _('Append'), name: 'appendRow' }),
                    ]}),
                    new RibbonButton({ title: _('Delete'), name: 'delRow' }),
                ]})
            ]})
        ];
    };
};

module.exports = DataTab;
