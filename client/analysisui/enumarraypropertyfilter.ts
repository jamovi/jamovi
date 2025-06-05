'use strict';

import { IPropertyFilter } from "./propertysupplier";

export class EnumArrayPropertyFilter implements IPropertyFilter<Array<string>> {
    legalValues: Array<string>;

    constructor(legalValues: Array<string>) {

        this.legalValues = legalValues;
    }

    check(value: Array<string>) : Array<string> {

        var checkedList = [];

        for (var j = 0; j < value.length; j++) {
            for (var i = 0; i < this.legalValues.length; i++)
            {
                if (value[j] === this.legalValues[i]) {
                    checkedList.push(value[j]);
                    break;
                }
            }
        }

        return checkedList;
    }
}


export default EnumArrayPropertyFilter;
