'use strict';

var GridControl = function() {

    this.renderToGrid = function(grid, row, column) {

        var returnData = { height: 0, width: 0 };
        if (this.onRenderToGrid)
            returnData = this.onRenderToGrid(grid, row, column);

        return returnData;
    };
};

GridControl.extend = function(target) {
    GridControl.call(target);
};

module.exports = GridControl;
