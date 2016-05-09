'use strict';
var _ = require('underscore');

//find the number of decimal places that the column needs to be formated to

var determineFormatting = function(values, sf, maxNS, minNS) {

    if (_.isUndefined(sf))
        sf = 3;
    if (_.isUndefined(minNS))
        minNS = 1e-3;
    if (_.isUndefined(maxNS))
        maxNS = 1e6;

    var minAbsNS = Infinity;
    var maxAbsExpnt = -Infinity;
    
    for (var i = 0; i < values.length; i++) {
    
        var value = values[i];
        var absValue = Math.abs(value);
        if (absValue >= minNS && absValue <= maxNS) {

            if (absValue !== 0 && isFinite(absValue) && absValue < minAbsNS)
                minAbsNS = absValue;
        }
        else {
            var exponent = parseInt(Math.log10(absValue));
            var absS = Math.abs(exponent);
            if (absS !== 0 && isFinite(absS) && absS > maxAbsExpnt)
                maxAbsExpnt = absS;
        }
    }
    var dp;
    var expw;
    
    if ( ! isFinite(minAbsNS)) {
        dp = sf - 1;
    }
    else if (minAbsNS === 0) {
        dp = sf - 1;
    }
    else {
        var logAbs = Math.log10(minAbsNS);
        dp = sf - 1 - Math.floor(logAbs);
    }
    dp = Math.max(dp, 0);


    
    expw = parseInt(Math.log10(maxAbsExpnt)+1);
    console.log(maxAbsExpnt);
    return { dp: dp, expw: expw};
};

var format = function(value, format, sf, maxNS, minNS) {
    if (_.isUndefined(minNS))
        minNS = 1e-3;
    if (_.isUndefined(maxNS))
        maxNS = 1e6;
    if (_.isUndefined(sf))
        sf = 3;
    
    if (Math.abs(value) >= minNS && Math.abs(value) <= maxNS) {
        return value.toFixed(format.dp);
    }
    else {
        var exponent = Math.floor(Math.log10(Math.abs(value)));
        var mantissa = value/Math.pow(10, exponent);
        if (value === 0){
            return value.toFixed(sf-1);
        }
        var expntSpan = Math.log10(exponent);
        var sign = '+'; 
        if (value < 1) {
            sign = '-';
        }
        var spaces = format.expw - Math.floor(Math.log10(Math.abs(exponent)));
        spaces = Math.max(spaces, 0);
        var gap = Array(spaces).join(" ");
        return mantissa.toFixed(sf-1)+'e'+gap+sign+Math.abs(exponent);
    }
    
};

module.exports = { determineFormatting: determineFormatting, format: format };

