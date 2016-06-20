'use strict';

var _ = require('underscore');
var OptionControlBase = require('./optioncontrolbase');

var OptionControl = function(params) {

    OptionControlBase.extendTo(this, params);

    this.registerSimpleProperty("optionId", null);
    this.registerSimpleProperty("disabled", false);
    this.registerSimpleProperty("label", null);

};

OptionControl.extendTo = function(target, params) {
    OptionControl.call(target, params);
};

module.exports = OptionControl;
