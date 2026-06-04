
'use strict';

import RibbonButton from './ribbonbutton';
import RibbonSeparator from './ribbonseparator';
import RibbonGroup from './ribbongroup';
import RibbonTab from './ribbontab';

export class VariablesTab extends RibbonTab {
    constructor() {
        super('variables', 'V', _('Variables'));

        this.populate();
    }

    override getRibbonItems() {
        return [
            new RibbonGroup({ title: _('Edit'), margin: 'large', alignContents: 'center', items: [
                new RibbonButton({ title: _('Undo Edit'), name: 'undo', size: 'small', keyTipKey: 'z', keyTipPosition: { x: '25%', y: '75%' } }),
                new RibbonButton({ title: _('Redo Edit'), name: 'redo', size: 'small', keyTipKey: 'y', keyTipPosition: { x: '75%', y: '75%' } })
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Variables'), items: [
                new RibbonButton({ title: _('Edit'), name: 'editVar', margin: 'large', size: 'large', keyTipKey: 's', keyTipPosition: { x: '50%', y: '90%' } }),
                new RibbonButton({ title: _('Compute'), name: 'compute', margin: 'large', size: 'large', keyTipKey: 'q', keyTipPosition: { x: '50%', y: '90%' } }),
                new RibbonButton({ title: _('Transform'), name: 'transform', margin: 'large', size: 'large', keyTipKey: 't', keyTipPosition: { x: '50%', y: '90%' } }),
                new RibbonGroup({ orientation: 'vertical', margin: 'large', items: [
                    new RibbonButton({ title: _('Add'), name: 'addVar', keyTipKey: 'a', keyTipPosition: { x: '25%', y: '25%' }, subItems: [
                        new RibbonGroup({ title: _('Data Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertVar', keyTipKey: 'i', keyTipPosition: { x: '25px', y: '55%' } }),
                            new RibbonButton({ title: _('Append'), name: 'appendVar', keyTipKey: 'a', keyTipPosition: { x: '25px', y: '55%' } })
                        ]}),
                        new RibbonSeparator(),
                        new RibbonGroup({ title: _('Computed Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertComputed', keyTipKey: 'qi', keyTipPosition: { x: '25px', y: '55%' } }),
                            new RibbonButton({ title: _('Append'), name: 'appendComputed', keyTipKey: 'qa', keyTipPosition: { x: '25px', y: '55%' } })
                        ]}),
                        new RibbonSeparator(),
                        new RibbonGroup({ title: _('Transformed Variable'), orientation: 'vertical', titlePosition: 'top', items: [
                            new RibbonButton({ title: _('Insert'), name: 'insertRecoded', keyTipKey: 'ti', keyTipPosition: { x: '25px', y: '55%' } }),
                            new RibbonButton({ title: _('Append'), name: 'appendRecoded', keyTipKey: 'ta', keyTipPosition: { x: '25px', y: '55%' } })
                        ]}),
                    ]}),
                    new RibbonButton({ title: _('Delete'), name: 'delVar', keyTipKey: 'd', keyTipPosition: { x: '25%', y: '75%' } }),
                ]}),
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Rows'), items: [
                new RibbonButton({ title: _('Filters'), name: 'editFilters', margin: 'large', size: 'large', keyTipKey: 'f', keyTipPosition: { x: '50%', y: '90%' } }),
            ]})
        ];
    }
}

export default VariablesTab;
