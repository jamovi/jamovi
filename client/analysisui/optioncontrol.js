'use strict';

var _ = require('underscore');
var OptionControlBase = require('./optioncontrolbase');

var OptionControl = function(option, params) {

    OptionControlBase.extendTo(this, option, params);

    this.registerSimpleProperty("name", null);
    this.registerSimpleProperty("optionId", null);
    this.registerSimpleProperty("disabled", false);
    this.registerSimpleProperty("label", null);

};

OptionControl.extendTo = function(target, option, params) {
    OptionControl.call(target, option, params);
};

module.exports = OptionControl;
