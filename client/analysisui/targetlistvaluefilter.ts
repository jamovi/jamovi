'use strict';

type FilterType = 'none' | 'unique' | 'uniquePerRow' | 'uniquePerColumn';

export class TargetListValueFilter {

    _data: [] = [];

    addValue(value, rowIndex, columnName) {
        var row = this._data[rowIndex];
        if (row === undefined || row === null) {
            row = {};
            this._data[rowIndex] = row;
        }

        var cell = row[columnName];
        if (cell === undefined) {
            cell = {};
            row[columnName] = cell;
        }

        cell.rowIndex = rowIndex;
        cell.columnName = columnName;
        cell.value = value;
    }

    insertRow(rowIndex, count) {
        for (let i = 0; i < count; i++)
            this._data.splice(rowIndex, 0, null);
    }

    removeValue(rowIndex, columnName) {
        let row = this._data[rowIndex];
        if (row === undefined)
            return;

        delete row[columnName];
    }

    clear() {
        this._data = [];
    }

    removeRow(rowIndex) {
        this._data.splice(rowIndex, 1);
    }

    testValue(filterType: FilterType, value, rowIndex=null, columnName=null, silent=false) {
        let filter = this['testValue_' + filterType];
        if (filter === undefined) {
            console.log('Unknown List Value Filter "' + filterType + '"');
            return true;
        }
        return filter.call(this, value, rowIndex, columnName, silent);
    }

    testValue_none(value, rowIndex, columnName) {
        return true;
    }

    testValue_unique(value, rowIndex, columnName) {
        for (var r = 0; r < this._data.length; r++) {
            var row = this._data[r];
            for (let c in row) {
                var cell = row[c];
                if (value.equalTo(cell.value))
                    return false;
            }
        }

        return true;
    }

    testValue_uniquePerRow(value, rowIndex, columnName) {
        if (rowIndex === 'null')
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

    testValue_uniquePerColumn(value, rowIndex, columnName) {
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
