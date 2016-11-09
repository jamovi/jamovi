'use strict';

var _ = require('underscore');
var $ = require('jquery');
var ControlBase = require('./controlbase');
var SuperClass = require('../common/superclass');

var OptionControlBase = function(params) {

    ControlBase.extendTo(this, params);

    this.setValue = function(value, keys) {
        this.option.beginEdit();
        this.beginPropertyEdit();
        this.option.setValue(value);
        this.endPropertyEdit();
        this.option.endEdit();
    };

    this.getValue = function(keys) {
        return this.option.getValue(keys);
    };

    this.value = function() {
        return this.option.getValue();
    };

    this.registerComplexProperty("value", this.getValue, this.setValue, "value_changed");
    this.registerSimpleProperty("name", null);

    this.option = null;

    this.setOption = function(option) {
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

        if (this.onOptionSet)
            this.onOptionSet(option);
    };
};

SuperClass.create(OptionControlBase);

module.exports = OptionControlBase;
