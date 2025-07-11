
export const flatten = function(arr) {
    return arr.join('/');
};

export const unflatten = function(str) {
    // equivalent to str.split('/'), except ignores / inside quotes
    return str.match(/"[^"]+"|([^/]+)/g);
};
