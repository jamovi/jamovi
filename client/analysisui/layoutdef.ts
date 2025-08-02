'use strict';


class Layout {
    controls = [];
    stage: (0 | 1 | 2) = 2; // 0 - release, 1 - development, 2 - proposed
    label?: string;

    constructor(params: any) {
        Object.assign(this, params);
    }

    getTitle() {
        return this.label ? _(this.label) : "Undefined";
    };
};

const LayoutDef = {
    extend: (params: any) => { return new Layout(params) }
}

export default LayoutDef;
