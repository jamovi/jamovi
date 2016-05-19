'use strict';

var GridControl = function() {

    this.render = function(grid, row, column) {

        var returnData = { height: 0, width: 0 };
        if (this.onRender)
            returnData = this.onRender(grid, row, column);

        return returnData;
    };
};

GridControl.extend = function(target) {
    GridControl.call(target);
};

module.exports = GridControl;
