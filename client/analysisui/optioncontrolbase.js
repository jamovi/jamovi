'use strict';

var _ = require('underscore');
var $ = require('jquery');
var PropertySupplier = require('./propertysupplier');

var OptionControlBase = function(option, params) {

    PropertySupplier.extendTo(this, params);

    this.setValue = function(value, keys) {
        this.option.setValue(value);
    };

    this.getValue = function(keys) {
        return this.option.getValue(keys);
    };

    this.registerComplexProperty("value", this.getValue, this.setValue, "value_changed");

    this.option = option;

    option.source.on("valuechanged", function(keys, data) {
        if (this.onOptionValueChanged)
            this.onOptionValueChanged(keys, data);
        this.firePropertyChangedEvent("value");
    }, this);

    option.source.on("valueinserted", function(keys, data) {
        if (this.onOptionValueInserted)
            this.onOptionValueInserted(keys, data);
        this.firePropertyChangedEvent("value");
    }, this);

    option.source.on("valueremoved", function(keys, data) {
        if (this.onOptionValueRemoved)
            this.onOptionValueRemoved(keys, data);
        this.firePropertyChangedEvent("value");
    }, this);
};

OptionControlBase.extendTo = function(target, option, params) {
    OptionControlBase.call(target, option, params);
};

module.exports = OptionControlBase;
