
'use strict';

const fs = require('fs');

const exists = function(path) {
    try {
        fs.statSync(path);
    }
    catch (e) {
        return false;
    }
    return true;
}

module.exports = { exists };
