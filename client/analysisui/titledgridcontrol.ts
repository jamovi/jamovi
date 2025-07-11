'use strict';

import GridControl, { GridControlProperties } from './gridcontrol';

export class TitledGridControl<P extends GridControlProperties> extends GridControl<P> {
    labelId: string;
    _subel: HTMLElement;

    constructor(...args: any[]) {
        super(args[0]);
    }

    override getSpans() {
        let useSingleCell = this.getPropertyValue("useSingleCell");
        if (useSingleCell)
            return super.getSpans();

        return { rows: 1, columns: 2 };
    }

    getLabelId() {
        let labelId = this.labelId;
        if (labelId)
            return labelId;

        return null;
    }
}

export default TitledGridControl;
