'use strict';

import { GridControl, GridControlProperties } from './gridcontrol';
import { h }  from '../common/htmlelementcreator';

export type AddonHostProperties = GridControlProperties & {
    // called with the host once it's created, as it has no name (and so
    // isn't one of the analysis' ui resources)
    onCreated: (host: AddonHost) => void;
};

// holds the options of one of an analysis' addons, in the analysis' options.
// the addon's options view is rendered into it, see analysisui/main.ts
export class AddonHost extends GridControl<AddonHostProperties> {

    constructor(params: AddonHostProperties, parent: any) {
        super(params, parent);

        this.setRootElement(h('div', { class: 'jmv-addon-host' }));

        if (params.onCreated)
            params.onCreated(this);
    }
}

export default AddonHost;
