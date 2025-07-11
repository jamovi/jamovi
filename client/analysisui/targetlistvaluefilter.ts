'use strict';

import { FormattedValue } from "./formatdef";

type FilterType = 'none' | 'unique' | 'uniquePerRow' | 'uniquePerColumn';

type ICellValue<U> = {
    rowIndex: number;
    columnName: (string | number | symbol);
    value: FormattedValue<U>;
};
type IRowInfo<R> = { [C in keyof R] : ICellValue<R[C]>}

export class TargetListValueFilter<R> {

    _data: Partial<IRowInfo<R>>[] = [];

    addValue<C extends keyof R>(value: FormattedValue<R[C]>, rowIndex: number, columnName: C): void {
        let row: Partial<IRowInfo<R>> = this._data[rowIndex];
        if (row === undefined || row === null) {
            row = {};
            this._data[rowIndex] = row;
        }

        let cell: ICellValue<R[C]> = row[columnName];
        if (cell === undefined) {
            cell = {rowIndex, columnName, value};
            row[columnName] = cell;
        }
        else {
            cell.rowIndex = rowIndex;
            cell.columnName = columnName;
            cell.value = value;
        }
    }

    insertRow(rowIndex: number, count: number): void {
        for (let i = 0; i < count; i++)
            this._data.splice(rowIndex, 0, null);
    }

    removeValue<C extends keyof R>(rowIndex: number, columnName: C): void {
        let row = this._data[rowIndex];
        if (row === undefined)
            return;

        delete row[columnName];
    }

    clear(): void {
        this._data = [];
    }

    removeRow(rowIndex: number): void {
        this._data.splice(rowIndex, 1);
    }

    testValue<C extends keyof R>(filterType: FilterType, value: R[C], rowIndex: number=null, columnName:C=null, silent=false) {
        let filter = this['testValue_' + filterType];
        if (filter === undefined) {
            console.log('Unknown List Value Filter "' + filterType + '"');
            return true;
        }
        return filter.call(this, value, rowIndex, columnName, silent);
    }

    testValue_none<C extends keyof R>(value: FormattedValue<R[C]>, rowIndex: number, columnName: C) {
        return true;
    }

    testValue_unique<C extends keyof R>(value: FormattedValue<R[C]>, rowIndex: number, columnName: C) {
        for (let r = 0; r < this._data.length; r++) {
            let row = this._data[r];
            for (let c in row) {
                let cell = row[c];
                if (value.equalTo(cell.value))
                    return false;
            }
        }

        return true;
    }

    testValue_uniquePerRow<C extends keyof R>(value: FormattedValue<R[C]>, rowIndex: number, columnName: C) {
        if (rowIndex === null)
            throw 'must have a rowIndex';
        var row = this._data[rowIndex];
        if (row === undefined)
            return true;

        for (let c in row) {
            var cell = row[c];
            if (value.equalTo(cell.value))
                return false;
        }

        return true;
    }

    testValue_uniquePerColumn<C extends keyof R>(value: FormattedValue<R[C]>, rowIndex: number, columnName: C) {
        if (columnName === 'null')
            throw 'must have a columnName';

        for (var r = 0; r < this._data.length; r++) {
            var row = this._data[r];
            var cell = row[columnName];
            if (cell !== undefined) {
                if (value.equalTo(cell.value))
                    return false;
            }
        }

        return true;
    }
}


export default TargetListValueFilter;
