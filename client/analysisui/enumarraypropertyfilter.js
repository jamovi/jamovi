'use strict';

var EnumArrayPropertyFilter = function(legalValues) {

    this.legalValues = legalValues;
    this.check = function(value) {

        var checkedList = [];

        for (var j = 0; j < value.length; j++) {
            for (var i = 0; i < this.legalValues.length; i++)
            {
                if (value[j] === legalValues[i]) {
                    checkedList.push(value[j]);
                    break;
                }
            }
        }

        return checkedList;
    };
};


module.exports = EnumArrayPropertyFilter;
