'use strict';

const TargetListValueFilter = function() {

    this._data = [];

    this.addValue = function(value, rowIndex, columnName) {
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
    };

    this.insertRow = function(rowIndex, count) {
        for (let i = 0; i < count; i++)
            this._data.splice(rowIndex, 0, null);
    };

    this.removeValue = function(rowIndex, columnName) {
        let row = this._data[rowIndex];
        if (row === undefined)
            return;

        delete row[columnName];
    };

    this.clear = function() {
        this._data = [];
    };

    this.removeRow = function(rowIndex) {
        this._data.splice(rowIndex, 1);
    };

    this.testValue = function(filterType, value, rowIndex, columnName) {
        let filter = this['testValue_' + filterType];
        if (filter === undefined) {
            console.log('Unknown List Value Filter "' + filterType + '"');
            return true;
        }
        return filter.call(this, value, rowIndex, columnName);
    };

    this.testValue_none = function(value, rowIndex, columnName) {
        return true;
    };

    this.testValue_unique = function(value, rowIndex, columnName) {
        for (var r = 0; r < this._data.length; r++) {
            var row = this._data[r];
            for (let c in row) {
                var cell = row[c];
                if (value.equalTo(cell.value))
                    return false;
            }
        }

        return true;
    };

    this.testValue_uniquePerRow = function(value, rowIndex, columnName) {
        var row = this._data[rowIndex];
        if (row === undefined)
            return true;

        for (let c in row) {
            var cell = row[c];
            if (value.equalTo(cell.value))
                return false;
        }

        return true;
    };

    this.testValue_uniquePerColumn = function(value, rowIndex, columnName) {
        for (var r = 0; r < this._data.length; r++) {
            var row = this._data[r];
            var cell = row[columnName];
            if (cell !== undefined) {
                if (value.equalTo(cell.value))
                    return false;
            }
        }

        return true;
    };
};


module.exports = TargetListValueFilter;
