
'use strict';

import LayoutVariablesView, { VariablesViewProperties } from './layoutvariablesview';


export class OutputSupplier extends LayoutVariablesView {

    constructor(params: VariablesViewProperties) {
        super(params);
    }

    protected override registerProperties(properties) {
        super.registerProperties(properties);

        this.setPropertyValue('permitted', [ 'output' ]);
        this.setPropertyValue('hideNotPermitted', true);
    }

}

export default OutputSupplier;
