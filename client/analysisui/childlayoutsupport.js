
'use strict';

const LayoutGrid = require('./layoutgrid');
const LayoutGridBorderSupport = require('./layoutgridbordersupport');
const SuperClass = require('../common/superclass');

const ChildLayoutSupport = function(params) {

    this._style = this.getPropertyValue('style');
    this._styles = this._style.split('-');
    this._parentStyle = this._styles[0];
    this._childStyle = this._styles[this._styles.length - 1];
    this.controls = [];

    this._override('renderToGrid', (baseFunction, grid, row, column) => {
        if (this.hasProperty('controls')) {
            let $el_sub = this.$el;
            LayoutGrid.extendTo(this);
            LayoutGridBorderSupport.extendTo(this, true);
            this.$el.addClass("silky-layout-container titled-group top-title silky-options-group silky-options-group-style-" + this._parentStyle + " silky-control-margin-" + this.getPropertyValue("margin"));
            if ($el_sub.hasClass('silky-control-label'))
                this.$el.addClass('heading');
            let cell = this.addCell(0, 0, $el_sub);
            this._applyCellProperties(cell);
        }

        return baseFunction.call(this, grid, row, column);
    });

    this.setBody = function (body) {
        this._body = body;
        this.controls = body.controls;
        body.$el.addClass("silky-control-body silky-control-body-style-"  + this._parentStyle);
        
        if (this.$el.hasClass('heading'))
            body.$el.attr('role', 'region');
        else
            body.$el.attr('role', 'group');
        body.$el.attr('aria-labelledby', this.getLabelId());

        let rData = null;
        if (this._style.startsWith('list'))
            rData = body.renderToGrid(this, 1, 0);
        else
            rData = body.renderToGrid(this, 0, 1);

        return rData.cell;
    };

    this.getControls = function() {
        return this.controls;
    };

};


SuperClass.create(ChildLayoutSupport);

module.exports = ChildLayoutSupport;
