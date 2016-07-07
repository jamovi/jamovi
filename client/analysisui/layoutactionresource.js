'use strict';

var _ = require('underscore');

var LayoutActionResource = function(supplier) {

    this._supplier = supplier;
    
    this.get = function(property) {
        return this._supplier.getPropertyValue(property);
    };

    this.set = function(property, value) {
        this._supplier.setPropertyValue(property, value);
    };
};

LayoutActionResource.extendTo = function(target, supplier) {
    LayoutActionResource.call(target, supplier);
};

module.exports = LayoutActionResource;
