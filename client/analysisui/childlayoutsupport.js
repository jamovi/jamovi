
'use strict';

var LayoutGrid = require('./layoutgrid').Grid;
var LayoutGridBorderSupport = require('./layoutgridbordersupport');
var SuperClass = require('../common/superclass');

var ChildLayoutSupport = function(params) {


    var self = this;
    this._style = this.getPropertyValue('style');
    this._styles = this._style.split('-');
    this._parentStyle = this._styles[0];
    this._childStyle = this._styles[this._styles.length - 1];


    this._override('onRenderToGrid', function(baseFunction, grid, row, column) {
        if (self.hasProperty('controls')) {
            self._baseLayout = new LayoutGrid();
            LayoutGridBorderSupport.extendTo(self._baseLayout);
            self._baseLayout.$el.addClass("silky-layout-container silky-options-group silky-options-group-style-" + self._parentStyle + " silky-control-margin-" + self.getPropertyValue("margin"));
            var cell = grid.addLayout(column, row, true, self._baseLayout);
            self._contentsPosition = baseFunction.call(self, self._baseLayout, 0, 0);

            return { height: 1, width: 1, cell: cell };
        }
        else
            return baseFunction.call(self, grid, row, column);
    });

    this.setBody = function(body) {
        this._body = body;
        body.$el.addClass("silky-control-body silky-control-body-style-"  + this._parentStyle);

        var rData = null;
        if (this._style.startsWith('list'))
            rData = body.renderToGrid(this._baseLayout, this._contentsPosition.height, 0);
        else
            rData = body.renderToGrid(this._baseLayout, 0, this._contentsPosition.width);

        return rData.cell;
    };

};

SuperClass.create(ChildLayoutSupport);

module.exports = ChildLayoutSupport;
