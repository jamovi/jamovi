
'use strict';

import fs from 'fs';

const exists = function(path) {
    try {
        fs.statSync(path);
    }
    catch (e) {
        return false;
    }
    return true;
}

export default { exists };
