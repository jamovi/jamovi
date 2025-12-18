
'use strict';

import { DefaultEventMap, EventEmitter, Listener } from "tsee";
import type { FormattedValue } from "./formatdef";

type FormatEventMap = {
    displayFormatChanged : Listener;
}

export class Format<T> extends EventEmitter<FormatEventMap> {

    constructor(legacy?: any) {
        super();
        if (legacy)  // To keep backwards compatible, shouldn't be used
            Object.assign(this, legacy);
    }

    name: string;

    isValid?(raw: T): boolean;

    children: any[];

    isEmpty(raw: T) {
        return raw === null;
    }

    getFormat(key) {
        if (key === undefined || key.length === 0)
            return this;

        if (this.children === undefined)
            return null;

        let format = this.children[key[0]];
        if (format === undefined)
            return null;

        if (key.length === 1)
            return format;

        return format.getFormat(key.slice(1));
    }

    createItem() {
        let item = null;
        if (this.children) {
            item = { };
            for (let name in this.children) {
                let format = this.children[name];
                item[name] = format.create();
            }
        }
        return item;
    }

    allFormats(equalTo) {
        let childrenList = [];
        this._allFormats(childrenList, this, [], equalTo);
        return childrenList;
    }

    _allFormats(list, format, valueKey, equalTo) {
        if (equalTo === undefined || equalTo.name === format.name)
            list.push({ format: format, key: valueKey });

        if (format.children) {
            for (let subItem in format.children) {
                let subkey = valueKey.slice(0);
                subkey.push(subItem);
                let subFormat = format.children[subItem];
                this._allFormats(list, subFormat, subkey, equalTo);
            }
        }
    }

    toString(raw: T): string {
        return raw.toString();
    }

    isEqual(raw1: T, raw2: T): boolean {
        return raw1 == raw2;
    }

    toAriaLabel?(raw: T) : string;

    from?<TFt>(raw: TFt | FormattedValue<TFt>, properties: { format?: Format<TFt>, power?: number }): T;
}


export default Format;
