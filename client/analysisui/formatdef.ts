'use strict';

import Format from './format.js';

export class VariablesFormat extends Format<string[]> {
    
    name = 'variables';
    
    static default = null;

    override toString(raw: string[]) {
        let r = '';
        for (let i = 0; i < raw.length; i++) {
            if (i > 0)
                r = r + ', ';
            r = r + raw[i];
        }
        return r;
    }

    override toAriaLabel(raw: string[]) {
        if (raw.length === 1)
            return s_(`Variable {0}`, raw);

        let list = raw[0];
        if (raw.length > 2) {
            for (let i = 1; i < raw.length - 1; i++) {
                list = s_('{list}, {nextItem}', { list: list, nextItem: raw[i] });
            }
        }
        let last = raw[raw.length - 1];
        list = s_('{list} and {lastItem}', {list: list, lastItem: last});
        return s_('Variables {list}', {list});
    }

    parse(value: string): string[] {
        return value;
    }

    isValid(raw: any): boolean {
        return Array.isArray(raw);
    }

    override isEqual(raw1: string[], raw2: string[], orderImportant: boolean = false) {
        if (raw1.length !== raw2.length)
            return false;

        for (let i = 0; i < raw1.length; i++) {
            let found = false;
            if (orderImportant && raw1[i] === raw2[i])
                found = true;
            else {
                for (let j = 0; j < raw2.length; j++) {
                    if (raw1[i] === raw2[j])
                        found = true;
                }
            }
            if (found === false)
                return false;
        }
        return true;
    }

    isEmpty(raw: string[]) {
        return raw === null || raw.length === 0;
    }
}

export class VariableFormat extends Format<string> {

    name = 'variable';

    static default: null;

    override toString(raw: string): string {
        return raw;
    }

    override toAriaLabel(raw: string): string {
        return s_('{name} variable', { name: raw });
    }

    parse(value: string): string {
        return value;
    }

    isValid(raw: any) : boolean {
        return (typeof raw === 'string') || Array.isArray(raw);
    }

    isEqual(raw1: string, raw2: string): boolean {
        return raw1 === raw2;
    }

    isEmpty(raw: string): boolean {
        return raw === null;
    }

    interactions(values: (string | FormattedValue<string>)[], minLength: number = 1, maxLength: number = -1) {
        let counts = [0];
        let findPosition = (length) => {
            let pos = 0;
            for (let k = 0; k < length; k++)
                pos += counts[k];
            return pos;
        };

        let list = [];
        for (let i = 0; i < values.length; i++) {
            let listLength = list.length;
            let rawVar = values[i];
            let isFormatted = false;
            if (rawVar instanceof FormattedValue) {
                rawVar = rawVar.raw;
                isFormatted = true;
            }

            for (let j = 0; j < listLength; j++) {
                let f = list[j];
                if (maxLength > 1 && f.length === maxLength)
                    break;

                let newVar = JSON.parse(JSON.stringify(f));

                newVar.push(rawVar);

                if (counts[newVar.length - 1] === undefined)
                    counts[newVar.length - 1] = 1;
                else
                    counts[newVar.length - 1] += 1;
                list.splice(findPosition(newVar.length), 0, isFormatted ? new FormattedValue(newVar, FormatDef.term) : newVar);
            }

            list.splice(i, 0, isFormatted ? new FormattedValue([rawVar], FormatDef.term) : [rawVar]);
            counts[0] += 1;
        }

        if (minLength > 1)
            list.splice(0, findPosition(minLength - 1));

        for (let i = 0; i < list.length; i++)
            list[i] = this._flattenList(list[i]);

        return list;
    }

    _flattenList(list: (string | string[])[]) : string[] {
        let flatList = [];
        for (let value of list) {
            if (Array.isArray(value))
                flatList = flatList.concat(this._flattenList(value));
            else
                flatList.push(value);
        }
        return flatList;
    }
}

export class TermFormat extends Format<string[]> {

    name = 'term';

    static default: null;

    override toString(raw: string[]) : string {
        return this._itemToString(raw, 0);
    }

    override toAriaLabel(raw: string[]) : string {
        if (raw.length === 1)
            return raw[0];

        let list = raw[0];
        if (raw.length > 2) {
            for (let i = 1; i < raw.length - 1; i++) {
                list = s_('{list}, {nextItem}', { list: list, nextItem: raw[i] });
            }
        }
        let last = raw[raw.length - 1];
        list = s_('{list} and {lastItem}', {list: list, lastItem: last});
        return s_('The interaction of {list}', {list});

    }

    parse(value: string) : string[] {
        return "test";
    }

    isValid(raw: any) : boolean {
        return this._validateItem(raw, 0);
    }

    isEqual(raw1: string | string[], raw2: string | string[]): boolean {
        return this._areItemsEqual(raw1, raw2);
    }

    isEmpty(raw: string[]): boolean {
        return raw === null;
    }

    contains(raw: string[] | string, value: string): boolean {

        let type1 = typeof raw;
        let type2 = typeof value;

        if (type1 === 'string' && type2 === 'string')
            return raw === value;
        else if (type1 === 'string')
            return false;

        for (let j = 0; j < raw.length; j++) {

            if (this.contains(raw[j], value))
                return true;
        }

        if (raw.length < value.length)
            return false;

        let jStart = 0;
        for (let i = 0; i < value.length; i++) {
            let found = false;
            for (let k = jStart; k < raw.length; k++) {
                if (this._areItemsEqual(value[i], raw[k])) {
                    if (jStart === k)
                        jStart = k + 1;
                    found = true;
                    break;
                }
            }

            if (found === false)
                return false;
        }

        return true;
    }

    _areItemsEqual(item1: string | string[], item2: string | string[]): boolean {
        let type1 = typeof item1;
        let type2 = typeof item1;

        if (type1 !== type2)
            return false;

        if (type1=== 'string' && type2 === 'string')
            return item1 === item2;

        if (Array.isArray(item1) === false || Array.isArray(item2) === false)
            return false;

        if (item1.length !== item2.length)
            return false;

        let jStart = 0;
        for (let i = 0; i < item1.length; i++) {
            let found = false;
            for (let j = jStart; j < item2.length; j++) {
                if (this._areItemsEqual(item1[i], item2[j])) {
                    if (j === jStart)
                        jStart = j + 1;
                    found = true;
                    break;
                }
            }
            if (found === false)
                return false;
        }

        return true;
    }

    _getJoiner(level: number): '✻' | '-' {
        if (level === 0)
            return '✻';

        return '-';
    }

    getSuperscript(value: number): string {
        return '<sup> ' + value + '</sup>';
    }

    _itemToString(item: string | string[], level: number, power=1): string {
        if (typeof item === 'string')
            return item + (power > 1 ? this.getSuperscript(power) : '');

        if (item === null || item.length === 0)
            return '';

        let joiner = this._getJoiner(level);

        let combined = '';
        let npower = 1;
        for (let i = 0; i < item.length; i++) {
            if (i < item.length - 1 && item[i] === item[i+1])
                npower += 1;
            else {
                combined = (combined !== '' ? (combined + ' ' + joiner + ' ') : '') + this._itemToString(item[i], level + 1, npower);
                npower = 1;
            }
        }

        return combined;
    }

    _validateItem(item: string | string[], level: number): boolean {
        if (level > 0 && typeof item === 'string')
            return true;
        else if (level > 2 || Array.isArray(item) === false || item.length === 0)
            return false;

        for (let i = 0; i < item.length; i++) {
            if (this._validateItem(item[i], level + 1) === false)
                return false;
        }

        return true;
    }

    from<T>(raw: T | FormattedValue<T>, properties: { format?: Format<T>, power?: number }): string[] {
        let format = properties.format;
        if (format === undefined && raw instanceof FormattedValue) {
            format = raw.format;
            raw = raw.raw;
        }

        let power = properties.power;
        if (power === undefined)
            power = 1;

        if (format.name === 'term')
            return raw;

        if (format.name === 'variable') {
            if (Array.isArray(raw))
                return raw;
            else {
                let term = [];
                for (let p = 0; p < power; p++)
                    term.push(raw);
                return term;
            }
        }

        return null;
    }
}

export class NumberFormat extends Format<number> {

    name = 'number';

    static default: 0;

    override toString(raw: number): string {
        return raw.toString();
    }

    parse(value: string): number {
        return parseFloat(value);
    }

    isValid(raw: any): boolean {
        return ! (isNaN(raw) || typeof(raw) !== 'number');
    }

    isEmpty(raw: number): boolean {
        return raw === null;
    }

    isEqual(raw1: number, raw2: number): boolean {
        return raw1 === raw2;
    }
}

export class BooleanFormat extends Format<boolean> {

    name = 'bool';

    static default: false;

    override toString(raw: boolean) {
        return raw.toString();
    }

    parse(value: string) {
        return value === 'true';
    }

    isValid(raw: any) {
        return typeof(raw) === 'boolean';
    }

    isEmpty(raw: boolean) {
        return raw === null;
    }

    isEqual(raw1: boolean, raw2: boolean) {
        return raw1 === raw2;
    }
}

export class StringFormat extends Format<string> {

    name = 'string';

    static default: '';

    override toString(raw: string) {
        return raw;
    }

    parse(value: string) {
        return value;
    }

    isValid(raw: any) {
        return typeof(raw) === 'string';
    }

    isEmpty(raw: string) {
        return raw === null;
    }

    isEqual(raw1: string, raw2: string) {
        return raw1 === raw2;
    }
}

type OutputType = {value: boolean, vars: string[]};
export class OutputFormat extends Format<OutputType> {

    static name: 'output'

    static default: null

    override toString(raw: OutputType) {
        if (raw === null)
            return 'false';

        return raw.value.toString();
    }

    parse(value: string): OutputType {
        return { value: value === 'true', vars: [] };
    }

    isValid(raw: any) {
        return raw === null || (typeof(raw) === 'object' && typeof(raw.value) === 'boolean');
    }

    isEmpty(raw: OutputType) {
        return raw === null || raw.vars.length === 0;
    }

    isEqual(raw1: OutputType, raw2: OutputType) {
        if (raw1 === null && raw2 === null)
            return true;

        if (raw1.value === raw2.value) {
            if (raw1.vars.length === raw2.vars.length) {
                for (let i = 0; i < raw1.vars.length; i++) {
                    if (raw1.vars[i] !== raw2.vars[i])
                        return false;
                }
            }
            return true;
        }
        return false;
    }
}

export const FormatDef = {
    variables: new VariablesFormat(),

    variable: new VariableFormat(),

    term: new TermFormat(),

    number: new NumberFormat(),

    bool: new BooleanFormat(),

    string: new StringFormat(),

    output: new OutputFormat()
}

export function inferFormat(raw: any) : Format<any> {
    let typeName = typeof(raw);
    switch (typeName) {
        case 'number':
        case 'string':
            return FormatDef[typeName];
        case 'boolean':
            return FormatDef.bool;
        case 'object':
            for (let key in FormatDef) {
                let value = FormatDef[key];
                if (value.isValid) {
                    if (value.isValid(raw))
                        return value;
                }
            }
            break;
    }
    return null;
};


export class FormattedValue<T> {

    format: Format<T>;
    raw: T;

    constructor(raw: T, format?: Format<T>) {
        if (format === undefined)
            format = inferFormat(raw);

        this.format = format;
        this.raw = raw;
    }

    toString() {
        if (this.format === null && this.raw.toString)
            return this.raw.toString();

        if (this.format === null)
            return '';

        return this.format.toString(this.raw);
    }

    toAriaLabel() {
        if (this.format === null && this.raw.toString)
            return this.raw.toString();

        if (this.format === null)
            return '';

        if (this.format.toAriaLabel)
            return this.format.toAriaLabel(this.raw);

        return this.toString();
    }

    equalTo(value: T | FormattedValue<T>) {
        if (this.format === null)
            return this.raw === value;

        let temp = value;
        if (temp instanceof FormattedValue) {
            if (this.format.name !== temp.format.name)
                return false;

            temp = temp.raw;
        }

        return this.format.isEqual(this.raw, temp);
    }

    isValid() {
        return this.format === null || this.format.isValid(this.raw);
    }

    isPrimitive() {
        return this.format !== null;
    }

    convert<T>(format: Format<T>, properties) {
        if (format.from === undefined)
            throw 'Format "' + format.name + '" does not have a "from" converter function.';

        return new FormattedValue(format.from(this, properties), format);
    }


}


export default FormattedValue;
