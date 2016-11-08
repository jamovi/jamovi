//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Request = require('./request');

const Modules = Backbone.Model.extend({

    defaults : {
        modules : [ ]
    },
    setup(modulesPB) {
        this.set('modules', modulesPB);
    },
    install(path) {
        return this._instance.installModule(path);
    },
    uninstall(name) {
        return this._instance.uninstallModule(name);
    },
    initialize(args) {

        this._instance = args.instance;

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
});

module.exports = Modules;
