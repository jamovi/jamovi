'use strict';

var EnumPropertyFilter = function(legalValues, outOfRangeValue) {

    this._outOfRangeValue = outOfRangeValue;
    this.legalValues = legalValues;
    this.check = function(value) {

        for (var i = 0; i < this.legalValues.length; i++)
        {
            if (value === legalValues[i])
                return value;
        }

        return this._outOfRangeValue;
    };
};


module.exports = EnumPropertyFilter;
