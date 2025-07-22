//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import yaml from 'js-yaml';

import host from './host';
import Version from './utils/version';
import I18n from '../common/i18n';

import { EventMap } from '../common/eventmap';

import type { IModulesProvider } from './instance';

class ModuleError extends Error {}
class ModuleNotFoundError extends ModuleError {}
class ModuleCorruptError extends ModuleError {}
class AnalysisNotFoundError extends ModuleError {}

interface IModulesModel {
    modules: IModuleMeta[],
    progress: any[],
    message: string,
    status: string,
    error: any
}

interface IAnalysisPosition {
    title: string
    menuGroup :string,
    menuSubgroup: string,
    menuTitle: string,
    menuSubtitle: string,
    category: string
}

interface IAnalysisMeta extends IAnalysisPosition {
    name : string,
    ns: string,
}

type AnalysisCategory = 'analyses' | 'plots';

interface AnalysisDef {
    name : string,
    ns: string,
    position: { [k in AnalysisCategory]? : IAnalysisPosition };
}

type Op =
  | 'install'
  | 'update'
  | 'incompatible'
  | 'unavailable'
  | 'old'
  | 'installed'
  | 'show'
  | 'hide'
  | 'remove';

interface IModuleMeta {
    name: string,
    title: string,
    version: number,
    authors: string[],
    description: string,
    analyses: IAnalysisMeta[],
    path: string,
    isSystem: boolean,
    new: boolean,
    minAppVersion: number,
    visible: boolean,
    incompatible: boolean,
    getTranslator: () => (value: string) => string,
    ops: Op[]
}

export class ModulesBase extends EventMap<IModulesModel> {

    _parent: ModulesBase;
    _instance: IModulesProvider;

    constructor(args: {instance: any, parent?: ModulesBase}) {
        super({
            modules : [ ],
            progress : [ 0, 1 ],
            message: '',
            status : 'none',
            error: null,
        });

        this._instance = args.instance;
        this._parent = args.parent;
    }

    [Symbol.iterator](): Iterator<IModuleMeta> {
        let index = 0;
        const modules = this.attributes.modules;
        return {
            next() : IteratorResult<IModuleMeta> {
                if (index < modules.length) 
                    return { value: modules[index++], done: false };
                else
                    return { value: undefined, done: true };
            }
        };
    }

    install(path: string) {
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
    }

    uninstall(name: string) {
        return this._instance.uninstallModule(name);
    }

    retrieve() {

    }

    setModuleVisibility(name: string, value: boolean) {
        let modules = this.get('modules');
        for (let module of modules) {
            if (module.name === name && module.visible !== value) {
                this._setModVisibility(module, value);
                break;
            }
        }
    }

    toggleModuleVisibility(name: string) {
        let modules = this.get('modules');
        for (let module of modules) {
            if (module.name === name) {
                this._setModVisibility(module, ! module.visible);
                break;
            }
        }
    }

    _setModVisibility(module: IModuleMeta, value: boolean) {
        return this._instance.setModuleVisibility(module.name, value).then(() => {
            module.visible = value;
            module.ops = this._determineOps(module);
            this.trigger('moduleVisibilityChanged', module);
        });
    }

    _setup(message, modulesPB) {

        let modules: IModuleMeta[] = [ ];

        for (let modulePB of modulesPB) {

            let module: IModuleMeta = {
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
                getTranslator: () => { return (value) => { return value; }; },
                ops: []
            };

            module.ops = this._determineOps(module);

            if (this.create)
                this.create(module);

            modules.push(module);
        }

        this.set('message', message);
        this.set('modules', modules);
    }

    _determineOps(module: IModuleMeta) : Op[] {
        return [ ];
    }
}

class Module {

    _ns: string;
    _version: string;
    _moduleDefn: AnalysisDef[];
    _analysisDefns = { };
    _i18nDefns = { };
    _status: string = 'none';
    loaded = false;
    _languages = [];
    _i18nReady: Promise<void>;
    _ready: Promise<void>;
    currentI18nCode: string;

    constructor(ns, version) {
        this._ns = ns;
        this._version = version;
        this._i18nReady = this._loadI18n();
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
                let moduleDefn = yaml.load(content);
                if (moduleDefn.languages)
                    this._languages = moduleDefn.languages;

                this._moduleDefn = { };
                for (let analysisMeta of moduleDefn.analyses) {
                    let current = this._moduleDefn[analysisMeta.name]
                    if ( ! current) {
                        current = { name: analysisMeta.name, ns: analysisMeta.ns, position: { } };
                        this._moduleDefn[analysisMeta.name] = current;
                    }

                    analysisMeta.category = analysisMeta.category ? analysisMeta.category : 'analyses';

                    current.position[analysisMeta.category] = {
                        title: analysisMeta.title,
                        menuGroup :analysisMeta.menuGroup,
                        menuSubgroup: analysisMeta.menuSubgroup,
                        menuTitle: analysisMeta.menuTitle,
                        menuSubtitle: analysisMeta.menuSubtitle,
                        category: analysisMeta.category
                    };

                    for (let prop in analysisMeta) {
                        if (prop === 'name' || 
                            prop === 'ns' || 
                            prop === 'title' || 
                            prop === 'menuGroup' || 
                            prop === 'menuSubgroup' || 
                            prop === 'menuTitle' || 
                            prop === 'menuSubtitle' || 
                            prop === 'category' ) {
                                continue;
                        }
                        current[prop] = analysisMeta[prop];
                    }
                }
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

    async getDefn(name: string) {
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
                            defn = yaml.load(defn);
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
        if (this.loaded === false)
            this.load();
        await this._ready;
        return this._languages;
    }

    async getCurrentI18nCode() {
        let code = this.currentI18nCode;
        if ( ! code) {
            let codes = await this.getI18nCodes();
            code = I18n.findBestMatchingLanguage(I18n.language, codes);
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

export class Available extends ModulesBase {

    version: number;

    constructor(args: {instance: any, parent: any}) {
        super(args);

        //ModulesBase.prototype.initialize.apply(this, arguments);
        this._parent.on('change:modules', () => this._updateOps());
    }

    override retrieve() {
        this.set('error', null);
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
    }

    _updateOps() {
        let modules = this.attributes.modules;
        for (let module of modules)
            module.ops = this._determineOps(module);
        this.attributes.modules = [ ];
        this.set('modules', modules);
    }

    override _determineOps(module: IModuleMeta): Op[] {
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
}

export class Modules extends ModulesBase {
    _available: Available;
    _moduleDefns: { [name: string]: Module } = { };
    _preloadedJMV = false;
    
    constructor(args: {instance: any, parent?: any}) {
        super(args);

        this._available = new Available({ instance: args.instance, parent: this });

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
    }

    create(info) {
        info.getTranslator = () => {
            return this.getTranslator(info.name);
        };

        this._moduleDefns[info.name] = new Module(info.name, Version.stringify(info.version));
    }

    available() {
        return this._available;
    }

    purgeCache(ns) {
        let module = this._moduleDefns[ns];
        if (module)
            module.reload();
    }

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
    }

    async getDefn(ns, name) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        return await module.getDefn(name);
    }

    async getTranslator(ns) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        await module._i18nReady;
        return module.translate.bind(module);
    }

    async getI18nCodes(ns) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        return await module.getI18nCodes();
    }

    async getCurrentI18nCode(ns) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        return await module.getCurrentI18nCode();
    }

    async getI18nDefn(ns) {
        let module = this._moduleDefns[ns];
        if ( ! module)
            module = this._createModule(ns);

        return await module.getI18nDefn();
    }

    override _determineOps(module: IModuleMeta): Op[] {

        let showHide: Op[] = [ 'show' ];
        if (module.incompatible)
            showHide = [ ];
        else if (module.visible)
            showHide = [ 'hide' ];

        let remove: Op[] = [ 'remove' ];
        if (module.isSystem)
            remove = [ ];

        let incompatible: Op[] = [ ];
        if (module.incompatible)
            incompatible = ['incompatible' ];

        return [].concat(showHide, remove, incompatible);
    }
}

/*Modules.ModuleError = ModuleError;
Modules.ModuleNotFoundError = ModuleNotFoundError;
Modules.ModuleCorruptError = ModuleCorruptError;
Modules.AnalysisNotFoundError = AnalysisNotFoundError;*/

//export default Modules;
