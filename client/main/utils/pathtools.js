
'use strict';

module.exports = {
    normalise : (path) => {
        if (path.startsWith('{{Documents}}'))
            path = path.replace('{{Documents}}', _('Documents'));
        else if (path.startsWith('{{Downloads}}'))
            path = path.replace('{{Downloads}}', _('Downloads'));
        else if (path.startsWith('{{Desktop}}'))
            path = path.replace('{{Desktop}}', _('Desktop'));
        else if (path.startsWith('{{Home}}'))
            path = path.replace('{{Home}}', _('Home'));
        else if (path.startsWith('{{Root}}'))
            path = path.replace('{{Root}}', _('This Device'));
        else if (path.startsWith('{{Examples}}'))
            path = path.replace('{{Examples}}', _('Data Library'));
        else if (path.startsWith('{{Temp}}'))
            path = path.replace('{{Temp}}', '');

        path = path.replace(/\/$/, "");
        return path;
    }
};
