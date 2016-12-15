'use strict';

var _ = require('underscore');
var $ = require('jquery');
var ControlBase = require('./controlbase');
var SuperClass = require('../common/superclass');

var OptionControlBase = function(params) {

    ControlBase.extendTo(this, params);

    this.getValue = function(keys) {
        return this.option.getValue(keys);
    };

    this.value = function(key) {
        return this.option.getValue(key);
    };

    this.setValue = function(value, key, insert) {
        if (key === undefined)
            key = [];

        if (insert === undefined)
            insert = false;

        var event = { value: value, key: key, insert: insert, cancel: false };

        this.trigger("changing", event);

        if (event.cancel === false) {
            this.option.beginEdit();
            this.beginPropertyEdit();
            if (event.insert)
                this.option.insertValueAt(event.value, event.key);
            else
                this.option.setValue(event.value, event.key);
            this.endPropertyEdit();
            this.option.endEdit();
        }
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
