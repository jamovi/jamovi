'use strict';

var PropertySupplier = require('./propertysupplier');

var ControlBase = function(params) {

    PropertySupplier.extendTo(this, params);

    this.registerSimpleProperty("stage", "release");
    this.registerSimpleProperty("cell", null);
    this.registerSimpleProperty("level", null);

};

ControlBase.extendTo = function(target, params) {
    ControlBase.call(target, params);
};

module.exports = ControlBase;
