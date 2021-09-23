'use strict';

const SuperClass = require('../common/superclass');
const GridControl = require('./gridcontrol');

const TitledGridControl = function(params) {

    GridControl.extendTo(this, params);

    this._override('getSpans', (baseFunction) => {
        let useSingleCell = this.getPropertyValue("useSingleCell");
        if (useSingleCell && baseFunction !== null)
            return baseFunction.call(this, name);

        return { rows: 1, columns: 2 };
    });
};

SuperClass.create(TitledGridControl);

module.exports = TitledGridControl;
