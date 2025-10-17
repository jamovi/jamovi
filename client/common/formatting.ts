
'use strict';

// determine the number of decimal places that the column needs to be formatted to

export const determFormat = function(values, type, format, settings, maxNS?, minNS?) {

    if (format === undefined)
        format = '';
    if (settings === undefined)
        settings = { 't': 'sf', 'n': 3, 'pt': 'dp', 'p': 3, 'ds': '.' };
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
            let exponent = Math.log10(absValue) | 0;
            let absS = Math.abs(exponent);
            if (absS !== 0 && isFinite(absS) && absS > maxAbsExpnt)
                maxAbsExpnt = absS;
        }
    }

    let dp, sf;
    let lz = true; // leading zero

    let { t } = settings;
    let { n } = settings;
    const ds = settings.ds || '.';

    if (formats.includes('pvalue')) {
        t = settings.pt;
        n = settings.p;
        // lz = false;
    } /*else if (formats.includes('zto')) {
        lz = false;
    }*/

    if (t === 'dp' && formats.includes('pvalue')) {
        dp = n;
        sf = n;
        maxNS = Infinity;
        minNS = -Infinity;
    }
    else if ( ! formats.includes('pvalue') && (formats.includes('zto') || formats.includes('pc'))) {
        dp = n;
        sf = n;
        maxNS = Infinity;
        minNS = -Infinity;
    }
    else if (t === 'sf') {

        if (type === 'integer') {
            dp = 0;
            sf = n;
        }
        else if ( ! isFinite(minAbsNS)) {
            dp = n - 1;
            sf = n;
        }
        else if (minAbsNS === 0) {
            dp = n - 1;
            sf = n;
        }
        else {
            sf = n;
            dp = n - 1 - Math.floor(Math.log10(minAbsNS));
            dp = Math.max(dp, 0);
        }
    }
    else {

        maxNS = Infinity;
        minNS = -Infinity;

        if (type === 'integer') {
            dp = 0;
            sf = n + 1;
        }
        else {
            dp = n;
            sf = n + 1;
        }
    }

    let expw = (Math.log10(maxAbsExpnt)+1) | 0;

    return { dp, expw, format, sf, maxNS, minNS, t, lz, ds };
};

export const format = function(value, format) {

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

    if (format.t === 'dp' && format.format.includes('pvalue') && value < Math.pow(10, -format.dp)) {
        return '<\u2009' + Math.pow(10,-format.dp).toFixed(format.dp).replace('.', format.ds).substring(1);
    }
    else if (format.format.includes('pc')) {
        return '' + (100 * value).toFixed(format.dp - 2).replace('.', format.ds) + '\u2009%';
    }
    else if (Math.abs(value) >= format.minNS && Math.abs(value) <= format.maxNS) {
        let str = value.toFixed(format.dp).replace('.', format.ds);
        if (format.lz === false && str.startsWith('0.'))
            str = str.substring(1);
        str = str.replace('.', format.ds)
        return str;
    }
    else {
        const exponent = Math.floor(Math.log10(Math.abs(value)));
        const mantissa = value/Math.pow(10, exponent);
        if (value === 0)
            return value.toFixed(format.dp).replace('.', format.ds);
        const expSign = Math.abs(value) < 1 ? '-' : '+';
        let spaces = format.expw - Math.floor(Math.log10(Math.abs(exponent)));
        spaces = Math.max(spaces, 0);
        const gap = Array(spaces).join(' ');
        return mantissa.toFixed(format.sf-1).replace('.', format.ds)+'e'+gap+expSign+Math.abs(exponent);
    }

};
