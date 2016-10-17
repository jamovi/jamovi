'use strict';

var SuperClass = require('./superclass');

var GridControl = function() {

    this.renderToGrid = function(grid, row, column) {

        var returnData = { height: 0, width: 0 };
        if (this.onRenderToGrid)
            returnData = this.onRenderToGrid(grid, row, column);

        return returnData;
    };
};

SuperClass.create(GridControl);

module.exports = GridControl;
