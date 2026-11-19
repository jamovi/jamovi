'use strict';

import LayoutCollapseView, { CollapseViewProperties } from './layoutcollapseview';
import { h }  from '../common/htmlelementcreator';

export type AddonBoxProperties = CollapseViewProperties & {
    // the (short) name and the title of the addon's module
    addon: string;
    addonTitle: string;
};

// the collapse box that holds an addon's options, in its parent's options.
// it's jamovi's own (not one of the DefaultControls), so a module's .u.yaml
// can't use it, and the CollapseBox modules use is left as it is
export class AddonBox extends LayoutCollapseView<AddonBoxProperties> {

    protected override registerProperties(properties: AddonBoxProperties) {
        super.registerProperties(properties);
        this.registerSimpleProperty("addon", null);
        this.registerSimpleProperty("addonTitle", null);
    }

    override createItem() {
        super.createItem();

        // the module, its icon and short name, after the addon's title
        let addon = this.getPropertyValue('addon');
        this.el.classList.add('jmv-addon-collapse-view');
        this.header.classList.add('jmv-addon-collapse-button');
        this.header.title = s_('Added by the {module} module', { module: this.getPropertyValue('addonTitle') || addon });
        this.header.append(h('span', { class: 'jmv-addon-module' },
            h('span', { class: 'jmv-addon-icon', 'aria-hidden': 'true' }),
            h('span', { class: 'jmv-addon-name' }, addon)));
    }
}

export default AddonBox;
