'use strict';

var GridControl = require('./gridcontrol');
var _ = require('underscore');
var $ = require('jquery');

var GridOptionControl = function(option, params) {

    GridControl.extend(this);

    this.option = option;
    this.params = params;

    this.getParam = function(name) {
        var value = this.params[name];
        if (_.isUndefined(value) === false) {
            if ($.isFunction(value))
                return value.call(this);
            else
                return value;
        }
        return null;
    };

    option.source.on("valuechanged", function(keys, data) {
        if (this.onOptionValueChanged)
            this.onOptionValueChanged(keys, data);
    }, this);

    option.source.on("valueinserted", function(keys, data) {
        if (this.onOptionValueInserted)
            this.onOptionValueInserted(keys, data);
    }, this);

    option.source.on("valueremoved", function(keys, data) {
        if (this.onOptionValueRemoved)
            this.onOptionValueRemoved(keys, data);
    }, this);
};

GridOptionControl.extend = function(target, option, params) {
    GridOptionControl.call(target, option, params);
};

module.exports = GridOptionControl;
