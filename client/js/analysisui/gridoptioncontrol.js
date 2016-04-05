'use strict';

var GridControl = require('./gridcontrol');

var GridOptionControl = function(option, params) {

    GridControl.extend(this);

    this.option = option;
    this.params = params;

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
