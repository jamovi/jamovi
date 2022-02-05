
'use strict';

const $ = require('jquery');

const RibbonButton = require('./ribbonbutton');
const RibbonSeparator = require('./ribbonseparator');
const RibbonGroup = require('./ribbongroup');

const VariablesTab = function() {
    this.name = "variables";

<<<<<<< HEAD
    this.title = "Variables";

    this.getRibbonItems = function(ribbon) {
        return [
            new RibbonGroup({ title: 'Edit', margin: 'large', alignContents: 'center', items: [
                new RibbonButton({ title: 'Undo Edit', name: 'undo', size: 'small' }),
                new RibbonButton({ title: 'Redo Edit', name: 'redo', size: 'small' })
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: 'Variables', items: [
                new RibbonButton({ title: 'Edit', name: 'editVar', margin: 'large', size: 'large' }),
                new RibbonButton({ title: 'Compute', name: 'compute', margin: 'large', size: 'large' }),
                new RibbonButton({ title: 'Transform', name: 'transform', margin: 'large', size: 'large' }),
                new RibbonGroup({ orientation: 'vertical', margin: 'large', items: [
                    new RibbonButton({ title: 'Add', name: 'addVar', subItems: [
                        new RibbonGroup({ title: 'Data Variable', orientation: 'horizontal', titlePosition: 'top', items: [
                            new RibbonButton({ title: 'Insert', name: 'insertVar' }),
                            new RibbonButton({ title: 'Append', name: 'appendVar' })
                        ]}),
                        new RibbonGroup({ title: 'Computed Variable', orientation: 'horizontal', titlePosition: 'top', items: [
                            new RibbonButton({ title: 'Insert', name: 'insertComputed' }),
                            new RibbonButton({ title: 'Append', name: 'appendComputed' })
                        ]}),
                        new RibbonGroup({ title: 'Transformed Variable', orientation: 'horizontal', titlePosition: 'top', items: [
                            new RibbonButton({ title: 'Insert', name: 'insertRecoded' }),
                            new RibbonButton({ title: 'Append', name: 'appendRecoded' })
                        ]}),
                    ]}),
                    new RibbonButton({ title: 'Delete', name: 'delVar' }),
                ]}),
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: 'Rows', items: [
                new RibbonButton({ title: 'Filters', name: 'editFilters', margin: 'large', size: 'large' }),
=======
    this.title = _("Variables");

    this.getRibbonItems = function(ribbon) {
        return [
            new RibbonGroup({ title: _('Edit'), margin: 'large', alignContents: 'center', items: [
                new RibbonButton({ title: _('Undo Edit'), name: 'undo', size: 'small' }),
                new RibbonButton({ title: _('Redo Edit'), name: 'redo', size: 'small' })
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Variables'), items: [
                new RibbonButton({ title: _('Edit'), name: 'editVar', margin: 'large', size: 'large' }),
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
                    ]}),
                    new RibbonButton({ title: _('Delete'), name: 'delVar' }),
                ]}),
            ]}),
            new RibbonSeparator(),
            new RibbonGroup({ title: _('Rows'), items: [
                new RibbonButton({ title: _('Filters'), name: 'editFilters', margin: 'large', size: 'large' }),
>>>>>>> f1498aae3c8ad9411410abbe714638854f0ca782
            ]})
        ];
    };
};

module.exports = VariablesTab;
