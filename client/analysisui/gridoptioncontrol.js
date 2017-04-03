'use strict';

const GridControl = require('./gridcontrol');
const OptionControl = require('./optioncontrol');
const SuperClass = require('../common/superclass');

const GridOptionControl = function(params) {

    GridControl.extendTo(this, params);
    OptionControl.extendTo(this, params);

};

SuperClass.create(GridOptionControl);

module.exports = GridOptionControl;
