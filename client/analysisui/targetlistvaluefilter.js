'use strict';

var _ = require("underscore");

var TargetListValueFilter = function() {

    this._data = [];

    this.addValue = function(value, rowIndex, columnName) {
        var row = this._data[rowIndex];
        if (_.isUndefined(row)) {
            row = {};
            this._data[rowIndex] = row;
        }

        var cell = row[columnName];
        if (_.isUndefined(cell)) {
            cell = {};
            row[columnName] = cell;
        }

        cell.rowIndex = rowIndex;
        cell.columnName = columnName;
        cell.value = value;
    };

    this.removeValue = function(rowIndex, columnName) {
        var row = this._data[rowIndex];
        if (_.isUndefined(row))
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
        var filter = this["testValue_" + filterType];
        if (_.isUndefined(filter)) {
            console.log("Unknown List Value Filter '" + filterType + "'");
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

    this.testValue_unique_per_row = function(value, rowIndex, columnName) {
        var row = this._data[rowIndex];
        if (_.isUndefined(row))
            return true;

        for (let c in row) {
            var cell = row[c];
            if (value.equalTo(cell.value))
                return false;
        }

        return true;
    };

    this.testValue_unique_per_column = function(value, rowIndex, columnName) {
        for (var r = 0; r < this._data.length; r++) {
            var row = this._data[r];
            var cell = row[columnName];
            if (_.isUndefined(cell) === false) {
                if (value.equalTo(cell.value))
                    return false;
            }
        }

        return true;
    };
};


module.exports = TargetListValueFilter;
