'use strict';

var SuperClass = require('../common/superclass');
var PropertySupplier = require('./propertysupplier');
var EnumPropertyFilter = require('./enumpropertyfilter');

var ControlBase = function(params) {

    PropertySupplier.extendTo(this, params);

    this.registerSimpleProperty("stage", 0); //0 - release, 1 - development, 2 - proposed
    this.registerSimpleProperty("cell", null);
    this.registerSimpleProperty("margin", "normal", new EnumPropertyFilter(["small", "normal", "large", "none"], "normal"));
    
    this.registerSimpleProperty("fitToGrid", false);
    this.registerSimpleProperty("stretchFactor", 0);
    this.registerSimpleProperty("horizontalAlignment", "left", new EnumPropertyFilter(["left", "center", "right"], "left"));
    this.registerSimpleProperty("verticalAlignment", "top", new EnumPropertyFilter(["top", "center", "bottom"], "top"));
};

SuperClass.create(ControlBase);

module.exports = ControlBase;
