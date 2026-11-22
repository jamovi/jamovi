
'use strict';

import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

// an addon's parent is in another module, so its definition is read from the
// jamovi being built against, where it's installed. it isn't always there (a
// module the user installs, or a flatpak), and then null is returned
export const findInstalledAnalysis = function(home, analysisId) {

    if ( ! home || home === 'flatpak')
        return null;

    const [ ns, name ] = analysisId.split('::');
    const candidates = [
        path.join(home, 'Resources', 'modules', ns, 'jamovi.yaml'),
        path.join(home, 'modules', ns, 'jamovi.yaml'),
    ];

    for (let candidate of candidates) {
        let content;
        try {
            content = fs.readFileSync(candidate, 'utf-8');
        }
        catch (e) {
            continue;
        }
        const moduleDefn = yaml.load(content);
        const analysis = (moduleDefn.analyses ?? [ ]).find(a => a.name === name);
        if (analysis)
            return analysis;
    }

    return null;
};

// the addonFor written to the module's definition. versions defaults to the
// installed parent's interface version, so an addon is only run with the
// parent it was built against, unless it says otherwise. without the parent,
// a bare addonFor is kept, and runs with any version
export const resolveAddonFor = function(addonFor, parent) {
    if (typeof addonFor === 'object')
        return addonFor;
    if (parent === null)
        return addonFor;
    return { analysis: addonFor, versions: [ parent.interfaceVersion ?? 1 ] };
};

// the parent:<name> names in an addon's results' clearWith, which the parent
// has no option of
export const unknownParentNames = function(results, parent) {
    const names = new Set((parent.options ?? [ ]).map(option => option.name));
    const unknown = new Set();

    const check = function(element) {
        if ( ! element)
            return;
        for (let name of element.clearWith ?? [ ]) {
            if (typeof name === 'string' && name.startsWith('parent:')) {
                const parentName = name.substring('parent:'.length);
                if ( ! names.has(parentName))
                    unknown.add(parentName);
            }
        }
        check(element.template);
        for (let item of element.items ?? [ ])
            check(item);
    };

    check(results);
    return [ ...unknown ];
};
