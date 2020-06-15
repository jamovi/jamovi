
'use strict';

module.exports = {
    normalise : (path) => {
        if (path.startsWith('{{Documents}}'))
            path = path.replace('{{Documents}}', 'Documents');
        else if (path.startsWith('{{Downloads}}'))
            path = path.replace('{{Downloads}}', 'Downloads');
        else if (path.startsWith('{{Desktop}}'))
            path = path.replace('{{Desktop}}', 'Desktop');
        else if (path.startsWith('{{Home}}'))
            path = path.replace('{{Home}}', 'Home');
        else if (path.startsWith('{{Root}}'))
            path = path.replace('{{Root}}', 'This Device');
        else if (path.startsWith('{{Examples}}'))
            path = path.replace('{{Examples}}', 'Data Library');
        else if (path.startsWith('{{Temp}}'))
            path = path.replace('{{Temp}}', '');

        path = path.replace(/\/$/, "");
        return path;
    }
};
