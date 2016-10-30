'use strict';

var SuperClass = require('../common/superclass');
var PropertySupplier = require('./propertysupplier');
var EnumPropertyFilter = require('./enumpropertyfilter');

var ControlBase = function(params) {

    PropertySupplier.extendTo(this, params);

    this.registerSimpleProperty("stage", 0); //0 - release, 1 - development, 2 - proposed
    this.registerSimpleProperty("cell", null);
    this.registerSimpleProperty("level", null);
    this.registerSimpleProperty("margin", "normal", new EnumPropertyFilter(["small", "normal", "large", "none"], "normal"));

};

SuperClass.create(ControlBase);

module.exports = ControlBase;
