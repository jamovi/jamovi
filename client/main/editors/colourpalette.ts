'use strict';

const get = function(colourIndex, alpha?) {
    if (alpha === undefined)
        alpha = 1;
    let base = colourIndex % 12;
    let g = base % 6;
    let p = [0, 4, 2, 5, 1, 3];
    if (base < 6)
        return 'hsla(' + (p[g] * 60) + ', 48%, 57%, ' + alpha + ')';

    return 'hsla(' + (30 + (p[g] * 60)) + ', 17%, 52%, ' + alpha + ')';
};

export default { get };
