'use strict';

var _ = require('underscore');
var SuperClass = require('./superclass');

var LayoutActionResource = function(supplier) {

    this._supplier = supplier;

    this.get = function(property) {
        return this._supplier.getPropertyValue(property);
    };

    this.set = function(property, value) {
        this._supplier.setPropertyValue(property, value);
    };
};

SuperClass.create(LayoutActionResource);

module.exports = LayoutActionResource;
