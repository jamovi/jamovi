
export type AddonId = { ns: string, name: string };

// an addon's options are carried in its parent's options, named
// addons/<ns>/<name>/<option>. the server (addon_prefix() in
// server/jamovi/server/options.py) and jmvcore (Options$.addonPrefix()) build
// the same prefix, and all three must agree
export const addonPrefix = (ns: string, name: string) => `addons/${ ns }/${ name }/`;

// identifies a set of addons, so two sets can be compared
export const addonsKey = (addons: AddonId[]) => addons.map(addon => `${ addon.ns }::${ addon.name }`).join(',');
