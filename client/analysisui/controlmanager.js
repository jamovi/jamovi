'use strict';

var _ = require('underscore');


var ControlManager = function() {

    this._baseControlManager = null;

    this.registerControl = function(name, constructor) {
        if (_.isUndefined(this[name]) === false)
            throw "A control with this name '" + name + "' already exists";
        this[name] = constructor;
    };

    this.create = function(name, ctrlOption, uiDef) {
        var constructor = this[name];
        if (_.isUndefined(constructor)) {
            if (this._baseControlManager !== null)
                return this._baseControlManager.create(name, ctrlOption, uiDef);
            else
                return null;
        }

        return new constructor(ctrlOption, uiDef);
    };

    this.setBaseControls = function(baseControlManager) {
        this._baseControlManager = baseControlManager;
    };
};

ControlManager.extendTo = function(target) {
    ControlManager.call(target);
};

module.exports = ControlManager;
