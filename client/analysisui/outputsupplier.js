
'use strict';

const LayoutVariablesView = require('./layoutvariablesview');

const OutputSupplier = function(params) {

    LayoutVariablesView.extendTo(this, params);

    this.setPropertyValue('permitted', [ 'output' ]);
    this.setPropertyValue('hideNotPermitted', true);
};

module.exports = OutputSupplier;
