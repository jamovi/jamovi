//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const yaml = require('js-yaml');

const ModulesBase = Backbone.Model.extend({
    defaults : {
        modules : [ ],
        progress : [ 0, 1 ],
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
    _setup(modulesPB) {

        let modules = [ ];

        for (let modulePB of modulesPB) {

            let module = {
                name:  modulePB.name,
                title: modulePB.title,
                version: [ modulePB.version.major, modulePB.version.minor, modulePB.version.revision ],
                authors: modulePB.authors,
                description: modulePB.description,
                analyses: modulePB.analyses,
                path: modulePB.path,
                isSystem: modulePB.isSystem,
                new: modulePB.new,
            };

            module.ops = this._determineOps(module);
            modules.push(module);
        }

        this.set('modules', modules);
    },
    _determineOps(module) {
        return [ ];
    }
});

const Available = ModulesBase.extend({

    initialize(args) {
        ModulesBase.prototype.initialize.apply(this, arguments);
        this._parent.on('change:modules', () => this._updateOps());
    },
    retrieve() {

        this._instance.retrieveAvailableModules()
            .then(storeResponse => {
                this._setup(storeResponse.modules);
                this.set('status', 'done');
            }, error => {
                this.set('error', error);
                this.set('status', 'error');
                this._setup([ ]);
            }).done();
        this.set('status', 'loading');
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
        for (let installed of this._parent) {
            if (module.name === installed.name)
                return [ 'installed' ];
        }
        return [ 'install' ];
    }
});

const Modules = ModulesBase.extend({
    initialize(args) {
        ModulesBase.prototype.initialize.apply(this, arguments);
        this._available = new Available({ instance: args.instance, parent: this });

        this._instance.settings().on('change:modules', (modules) => {
            this._setup(modules.changed.modules);
        });

        this._instance.on('moduleInstalled', (module) => {
            this.trigger('moduleInstalled', module);
        });
    },
    available() {
        return this._available;
    },
    _determineOps(module) {
        if (module.isSystem)
            return [ ];
        else
            return [ 'remove' ];
    }
});



module.exports = Modules;
