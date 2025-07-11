'use strict';

import { IPropertyFilter } from "./propertysupplier";

export class EnumArrayPropertyFilter<T extends Record<string, string | number>> implements IPropertyFilter<Array<T[keyof T]>> {
    legalValues: T;

    constructor(legalValues: T) {

        this.legalValues = legalValues;
    }

    check(value: Array<T[keyof T]>) : Array<T[keyof T]> {

        var checkedList = [];

        for (var j = 0; j < value.length; j++) {
            if (Object.values(this.legalValues).includes(value[j]))
                checkedList.push(value[j]);
        }

        return checkedList;
    }
}


export default EnumArrayPropertyFilter;
