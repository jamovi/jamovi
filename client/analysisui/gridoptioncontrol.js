'use strict';

var GridControl = require('./gridcontrol');
var OptionControl = require('./optioncontrol');

var GridOptionControl = function(option, params) {

    GridControl.extend(this);
    OptionControl.extendTo(this, option, params);

};

GridOptionControl.extend = function(target, option, params) {
    GridOptionControl.call(target, option, params);
};

module.exports = GridOptionControl;
