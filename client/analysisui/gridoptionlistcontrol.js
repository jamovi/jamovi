'use strict';

const GridControl = require('./gridcontrol');
const OptionListControl = require('./optionlistcontrol');
const SuperClass = require('../common/superclass');

const GridOptionListControl = function(params) {
    OptionListControl.extendTo(this, params);
    GridControl.extendTo(this, params);

    this.registerSimpleProperty("stretchFactor", 0.5);

    this.addedContentToCell = function(cell) {
        if (this.isSingleItem === false)
            cell.dockContentHeight = true;
    };
};
SuperClass.create(GridOptionListControl);
module.exports = GridOptionListControl;
