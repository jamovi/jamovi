
'use strict';

function stringify(v, n) {
    n = n || 4;
    let v32 = new Uint32Array(1);
    v32[0] = v;
    let v8 = new Uint8Array(v32.buffer);
    return v8.reverse().slice(0, n).join('.');
}

function parse(v) {
    let nums = v.split('.');
    nums.slice(0, 4);
    while (nums.length < 4)
        nums.push(0);
    let v8  = Uint8Array.from(nums.reverse());
    let v32 = new Uint32Array(v8.buffer);
    return v32[0];
}

module.exports = {
    stringify,
    parse,
};
