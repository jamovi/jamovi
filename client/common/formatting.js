
'use strict';

// determine the number of decimal places that the column needs to be formatted to

const determFormat = function(values, type, format, settings, maxNS, minNS) {

    if (format === undefined)
        format = '';
    if (settings === undefined)
        settings = { 't': 'sf', 'n': 3, 'p': 3 };
    if (minNS === undefined)
        minNS = 1e-3;
    if (maxNS === undefined)
        maxNS = 1e6;

    let formats = [ ];
    if (format !== '')
        formats = format.split(',');

    let minAbsNS = Infinity;
    let maxAbsExpnt = -Infinity;

    for (let i = 0; i < values.length; i++) {

        let value = values[i];

        if (isNaN(value))
            continue;

        if (formats.includes('log10'))
            value = Math.pow(10, value);

        let absValue = Math.abs(value);
        if (absValue >= minNS && absValue <= maxNS) {

            if (absValue !== 0 && isFinite(absValue) && absValue < minAbsNS)
                minAbsNS = absValue;
        }
        else {
            let exponent = parseInt(Math.log10(absValue));
            let absS = Math.abs(exponent);
            if (absS !== 0 && isFinite(absS) && absS > maxAbsExpnt)
                maxAbsExpnt = absS;
        }
    }

    let dp, sf;

    if (formats.includes('pvalue')) {
        dp = settings.p;
        sf = settings.p;
        maxNS = Infinity;
        minNS = -Infinity;
    }
    else if (formats.includes('zto') || formats.includes('pc')) {
        dp = settings.n;
        sf = settings.n;
        maxNS = Infinity;
        minNS = -Infinity;
    }
    else if (settings.t === 'sf') {

        if (type === 'integer') {
            dp = 0;
            sf = settings.n;
        }
        else if ( ! isFinite(minAbsNS)) {
            dp = settings.n - 1;
            sf = settings.n;
        }
        else if (minAbsNS === 0) {
            dp = settings.n - 1;
            sf = settings.n;
        }
        else {
            sf = settings.n;
            dp = settings.n - 1 - Math.floor(Math.log10(minAbsNS));
            dp = Math.max(dp, 0);
        }
    }
    else {

        if (type === 'integer') {
            dp = 0;
            sf = settings.n + 1;
        }
        else {
            dp = settings.n;
            sf = settings.n + 1;
        }
    }

    let expw = parseInt(Math.log10(maxAbsExpnt)+1);

    return { dp, expw, format, sf, maxNS, minNS };
};

let format = function(value, format) {

    if (isNaN(value)) {
        return 'NaN';
    }
    else if ( ! isFinite(value)) {
        if (value > 0)
            return 'Inf';
        else
            return '-Inf';
    }

    if (format.format.includes('log10')) {
        value = Math.pow(10, value);
        if ( ! isFinite(value)) {
            if (value  > 0)
                return 'Inf';
            else
                return '-Inf';
        }
    }

    if (format.format.includes('pvalue') && value < Math.pow(10, -format.dp)) {
        return '<\u2009' + Math.pow(10,-format.dp).toFixed(format.dp).substring(1);
    }
    else if (format.format.includes('pc')) {
        return '' + (100 * value).toFixed(format.dp - 2) + '\u2009%';
    }
    else if (Math.abs(value) >= format.minNS && Math.abs(value) <= format.maxNS) {
        return value.toFixed(format.dp);
    }
    else {
        let exponent = Math.floor(Math.log10(Math.abs(value)));
        let mantissa = value/Math.pow(10, exponent);
        if (value === 0)
            return value.toFixed(format.dp);
        let expntSpan = Math.log10(exponent);
        let sign = '+';
        if (value < 1) {
            sign = '-';
        }
        let spaces = format.expw - Math.floor(Math.log10(Math.abs(exponent)));
        spaces = Math.max(spaces, 0);
        let gap = Array(spaces).join(' ');
        return mantissa.toFixed(format.sf-1)+'e'+gap+sign+Math.abs(exponent);
    }

};

module.exports = { determFormat: determFormat, format: format };
