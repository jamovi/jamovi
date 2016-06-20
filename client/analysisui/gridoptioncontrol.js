'use strict';

var GridControl = require('./gridcontrol');
var OptionControl = require('./optioncontrol');

var GridOptionControl = function(params) {

    GridControl.extend(this);
    OptionControl.extendTo(this, params);

};

GridOptionControl.extend = function(target, params) {
    GridOptionControl.call(target, params);
};

module.exports = GridOptionControl;
