'use strict';

import GridControl from './gridcontrol';

export class TitledGridControl extends GridControl {
    labelId: string;
    _subel: HTMLElement;

    constructor(params) {
        super(params);
    }

    getSpans() {
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
