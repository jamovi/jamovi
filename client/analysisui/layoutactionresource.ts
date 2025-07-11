'use strict';

export class LayoutActionResource {
    constructor(supplier) {
        this._supplier = supplier;
    }

    get(property) {
        return this._supplier.getPropertyValue(property);
    }

    set(property, value) {
        this._supplier.setPropertyValue(property, value);
    }
}

export default LayoutActionResource;
