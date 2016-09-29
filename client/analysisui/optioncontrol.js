'use strict';

var _ = require('underscore');
var OptionControlBase = require('./optioncontrolbase');
var EnumPropertyFilter = require('./enumpropertyfilter');

var OptionControl = function(params) {

    OptionControlBase.extendTo(this, params);

    this.registerSimpleProperty("optionId", null);
    this.registerSimpleProperty("disabled", false);
    this.registerSimpleProperty("label", null);
    this.registerSimpleProperty("style", "list", new EnumPropertyFilter(["list", "inline", "list-inline", "inline-list"], "list"));

};

OptionControl.extendTo = function(target, params) {
    OptionControl.call(target, params);
};

module.exports = OptionControl;
