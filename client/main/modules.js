//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const yaml = require('js-yaml');

const host = require('./host');
const Version = require('./utils/version');
const I18n = require('../common/i18n');

class ModuleError extends Error {}
class ModuleNotFoundError extends ModuleError {}
class ModuleCorruptError extends ModuleError {}
class AnalysisNotFoundError extends ModuleError {}

const ModulesBase = Backbone.Model.extend({
    defaults : {
        modules : [ ],
        progress : [ 0, 1 ],
        message: '',
        status : 'none',
        error: null,
    },
    initialize(args) {

        this._instance = args.instance;
        this._parent = args.parent;

        this[Symbol.iterator] = () => {
            let index = 0;
            return {
                next: () => {
                    let ret = { };
                    if (index < this.attributes.modules.length) {
                        ret.value = this.attributes.modules[index];
                        ret.done = false;
                        index++;
                    }
                    else {
                        ret.done = true;
                    }
                    return ret;
               }
            };
        };
    },
    install(path) {
        this.set('progress', [ 0, 1 ]);
        this.set('status', 'installing');
        let install = this._instance.installModule(path);
        install.then(() => {
            this.set('status', 'done');
        }, error => {
            throw error;
        }, progress => {
            this.set('progress', progress);
        });
        return install;
    },
    uninstall(name) {
        return this._instance.uninstallModule(name);
    },
    retrieve() {

    },
    setModuleVisibility(name, value) {
        let modules = this.get('modules');
        for (let module of modules) {
            if (module.name === name && module.visible !== value) {
                this._setModVisibility(module, value);
                break;
            }
        }
    },
    toggleModuleVisibility(name) {
        let modules = this.get('modules');
        for (let module of modules) {
            if (module.name === name) {
                this._setModVisibility(module, ! module.visible);
                break;
            }
        }
    },
    _setModVisibility(module, value) {
        return this._instance.setModuleVisibility(module.name, value).then(() => {
            module.visible = value;
            module.ops = this._determineOps(module);
            this.trigger('moduleVisibilityChanged', module);
        });
    },
    _setup(message, modulesPB) {

        let modules = [ ];

        for (let modulePB of modulesPB) {

            let module = {
                name:  modulePB.name,
                title: modulePB.title,
                version: modulePB.version,
                authors: modulePB.authors,
                description: modulePB.description,
                analyses: modulePB.analyses,
                path: modulePB.path,
                isSystem: modulePB.isSystem,
                new: modulePB.new,
                minAppVersion: modulePB.minAppVersion,
                visible: modulePB.visible,
                incompatible: modulePB.incompatible,
                getTranslator: () => { return (value) => { return value; }; }
            };

            module.ops = this._determineOps(module);

            if (this.create)
                this.create(module);

            modules.push(module);
        }

        this.set('message', message);
        this.set('modules', modules);
    },
    _determineOps(module) {
        return [ ];
    }
});

class Module {

    constructor(ns, version) {
        this._ns = ns;
        this._version = version;
        this._moduleDefn = undefined;
        this._analysisDefns = { };
        this._i18nDefns = { };
        this._status = 'none';
        this._i18nReady = this._loadI18n();
        this.loaded = false;
    }

    load() {
        this._ready = this._load(false);
    }

    reload() {
        this._ready = this._load(true);
    }

    async _load(refresh) {
        this.loaded = true;
        let version = await host.version;
        let url = `../modules/${ this._ns }`;
        if (this._version)
            url = `${ url }?v=${ this._version }`;
        let options = { };

        if (refresh)
            options.cache = 'reload';

        let response = await fetch(url, options);
        if (response.ok) {
            let content = await response.text();
            try {
                let moduleDefn = yaml.safeLoad(content);
                this._moduleDefn = Object.assign(...moduleDefn.analyses.map(a => {
                    let obj = { };
                    obj[a.name] = a;
                    return obj;
                }));
                this._status = 'ok';
            }
            catch (e) {
                this._status = 'corrupt';
            }
        }
        else {
            this._status = 'legacy';
        }
    }

    async _loadI18n() {
        this.currentI18nDef = await this.getI18nDefn();
    }

    translate(key) {
        if (key.trim() === '')
            return key;

        if ( ! this.currentI18nDef)
            return key;

        let value = this.currentI18nDef.locale_data.messages[key.trim()];
        if (value === null || value === undefined || value[0] === '')
            return key;
        else
            return value[0];
    }

    async getDefn(name) {
        if (this.loaded === false)
            this.load();
        await this._ready;
        if (this._status == 'corrupt') {
            throw new ModuleCorruptError();
        }
        else if (this._status == 'missing') {
            throw new ModuleNotFoundError();
        }
        else if (this._status == 'ok') {
            let defn = this._moduleDefn[name];
            if (defn === undefined)
                throw new AnalysisNotFoundError();
            return defn;
        }
        else if (this._status == 'legacy') {
            let defnProm = this._analysisDefns[name];
            if (defnProm === undefined) {
                defnProm = this._analysisDefns[name] = (async() => {
                    let url = `../analyses/${ this._ns }/${ name.toLowerCase() }/a.yaml`;
                    let response = await fetch(url);
                    if (response.ok) {
                        try {
                            let defn = await response.text();
                            defn = yaml.safeLoad(defn);
                            return defn;
                        }
                        catch (e) {
                            throw new ModuleCorruptError();
                        }
                    }
                    else {
                        throw new ModuleNotFoundError();
                    }
                })();
            }
            let defn = await defnProm;
            return defn;
        }
        else {
            throw new Error('shouldn\'t get here');
        }
    }

    async getI18nCodes() {

        let codes = this._i18nCodes;
        if (codes === undefined){
            let defnProm = this._i18nCodes;
            if (defnProm === undefined) {
                defnProm = this._i18nCodes = (async() => {

                    let url = `../modules/${ this._ns }/i18n`;
                    let response = await fetch(url);
                    if (response.ok) {
                        try {
                            return await response.json();
                        }
                        catch (e) {
                            throw new ModuleCorruptError();
                        }
                    }
                    else {
                        return [ ];
                    }
                })();
            }
            let codes = await defnProm;
            return codes;
        }
        return codes;

    }

    async getCurrentI18nCode() {
        let code = this.currentI18nCode;
        if ( ! code) {
            let codes = await this.getI18nCodes();
            code = I18n.findBestMatchingLocale([I18n.locale], codes);
            if (code === null) {
                if (codes.includes('en'))
                    code = 'en';
                else
                    code = '';
            }
            this.currentI18nCode = code;
        }
        return code;
    }

    async getI18nDefn() {

            let code = await this.getCurrentI18nCode();
            if (code === null || code === '')
                return '';

            let defn = this._i18nDefns[code];
            if (defn === undefined){
                let defnProm = this._i18nDefns[code];
                if (defnProm === undefined) {
                    defnProm = this._i18nDefns[code] = (async() => {

                        let url = `../modules/${ this._ns }/i18n/${ code }`;
                        let response = await fetch(url);
                        if (response.ok) {
                            try {
                                return await response.json();
                            }
                            catch (e) {
                                throw new ModuleCorruptError();
                            }
                        }
                        else {
                            return '';
                        }
                    })();
                }
                let defn = await defnProm;
                return defn;
            }
            return defn;
        }
}

const Available = ModulesBase.extend({

    initialize(args) {
        ModulesBase.prototype.initialize.apply(this, arguments);
        this._parent.on('change:modules', () => this._updateOps());
    },
    retrieve() {

        this.set('status', 'loading');

        host.version.then((version) => {
            this.version = Version.parse(version);
        }).then(() => {
            return this._instance.retrieveAvailableModules();
        }).then(storeResponse => {
            this._setup(storeResponse.message, storeResponse.modules);
            this.set('status', 'done');
        }, error => {
            this.set('error', error);
            this.set('status', 'error');
            this._setup('', [ ]);
        });
    },
    _updateOps() {
        let modules = this.attributes.modules;
        for (let module of modules)
            module.ops = this._determineOps(module);
        this.attributes.modules = [ ];
        this.set('modules', modules);
    },
    _determineOps(module) {
        if (module.path === '')
            return [ 'unavailable' ];
        if (module.minAppVersion > this.version)
            return [ 'old' ];
        for (let installed of this._parent) {
            if (module.name === installed.name) {
                if (installed.incompatible) {
                    if (module.version >= installed.version)
                        return [ 'update', 'incompatible' ];
                    else
                        return [ 'install', 'incompatible' ];
                }
                else if (module.version > installed.version)
                    return [ 'update' ];
                else
                    return [ 'installed' ];
            }
        }
        return [ 'install' ];
    }
});

const Modules = ModulesBase.extend({
    initialize(args) {
        ModulesBase.prototype.initialize.apply(this, arguments);
        this._available = new Available({ instance: args.instance, parent: this });

        this._moduleDefns = { };
        this._preloadedJMV = false;

        this._instance.settings().on('change:modules', async (modules) => {
            this._setup('', modules.changed.modules);

            // preload jmv
            if ( ! this._preloadedJMV) {
                this.getDefn('jmv', 'descriptives');
                this._preloadedJMV = true;
            }
        });

        this._instance.on('moduleInstalled', (module) => {
            this.trigger('moduleInstalled', module);
        });
    },
    create(info) {
        info.getTranslator = () => {
            return this.getTranslator(info.name);
        };

        this._moduleDefns[info.name] = new Module(info.name, Version.stringify(info.version));
    },
    available() {
        return this._available;
    },
    purgeCache(ns) {
        let module = this._moduleDefns[ns];
        if (module)
            module.reload();
    },
    _createModule(ns) {
        let version = '';
        for (let mod of this.attributes.modules) {
            if (mod.name === ns) {
                version = Version.stringify(mod.version);
                break;
            }
        }

        let module = new Module(ns, version);
        this._moduleDefns[ns] = module;

        return module;
    },
    async getDefn(ns, name) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        return await module.getDefn(name);
    },

    async getTranslator(ns) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        await module._i18nReady;
        return module.translate.bind(module);
    },

    async getI18nCodes(ns) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        return await module.getI18nCodes();
    },

    async getCurrentI18nCode(ns) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        return await module.getCurrentI18nCode();
    },

    async getI18nDefn(ns) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        return await module.getI18nDefn();
    },

    _determineOps(module) {

        let showHide = [ 'show' ];
        if (module.incompatible)
            showHide = [ ];
        else if (module.visible)
            showHide = [ 'hide' ];

        let remove = [ 'remove' ];
        if (module.isSystem)
            remove = [ ];

        let incompatible = [ ];
        if (module.incompatible)
            incompatible = ['incompatible' ];

        return [].concat(showHide, remove, incompatible);
    }
});

Modules.ModuleError = ModuleError;
Modules.ModuleNotFoundError = ModuleNotFoundError;
Modules.ModuleCorruptError = ModuleCorruptError;
Modules.AnalysisNotFoundError = AnalysisNotFoundError;

module.exports = Modules;
