'use strict';

var GridControl = require('./gridcontrol');
var OptionControl = require('./optioncontrol');
var SuperClass = require('../common/superclass');

var GridOptionControl = function(params) {

    GridControl.extendTo(this);
    OptionControl.extendTo(this, params);

};

SuperClass.create(GridOptionControl);

module.exports = GridOptionControl;
