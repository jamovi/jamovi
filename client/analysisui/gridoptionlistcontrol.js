'use strict';

const TitledGridControl = require('./titledgridcontrol');
const OptionListControl = require('./optionlistcontrol');
const SuperClass = require('../common/superclass');

const GridOptionListControl = function(params) {
    OptionListControl.extendTo(this, params);
    TitledGridControl.extendTo(this, params);

    this.registerSimpleProperty("stretchFactor", 1);

    this.addedContentToCell = function(cell) {
        if (this.isSingleItem === false)
            cell.setVerticalAlign('stretch');
    };
};
SuperClass.create(GridOptionListControl);
module.exports = GridOptionListControl;
