'use strict';

const TitledGridControl = require('./titledgridcontrol');
const OptionControl = require('./optioncontrol');
const SuperClass = require('../common/superclass');

const GridOptionControl = function(params) {

    TitledGridControl.extendTo(this, params);
    OptionControl.extendTo(this, params);

};

SuperClass.create(GridOptionControl);

module.exports = GridOptionControl;
