'use strict';
import { IPropertyFilter } from "./propertysupplier";

export class EnumPropertyFilter implements IPropertyFilter<string> {
    _outOfRangeValue: string;
    legalValues: Array<string>;

    constructor(legalValues: Array<string>, outOfRangeValue: string) {
        this._outOfRangeValue = outOfRangeValue;
        this.legalValues = legalValues;
    }

    check(value: string): string {

        for (var i = 0; i < this.legalValues.length; i++)
        {
            if (value === this.legalValues[i])
                return value;
        }

        return this._outOfRangeValue;
    }
}


export default EnumPropertyFilter;
