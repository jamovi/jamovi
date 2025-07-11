'use strict';
import { IPropertyFilter } from "./propertysupplier";

export class EnumPropertyFilter<T extends Record<string, string | number>> implements IPropertyFilter<T[keyof T]> {
    _outOfRangeValue: T[keyof T];
    legalValues: T;

    constructor(legalValues: T, outOfRangeValue: T[keyof T]) {
        this._outOfRangeValue = outOfRangeValue;
        this.legalValues = legalValues;
    }

    check(value: T[keyof T]): T[keyof T] {

        if (Object.values(this.legalValues).includes(value))
            return value;

        return this._outOfRangeValue;
    }
}


export default EnumPropertyFilter;
