
'use strict';

const $ = require('jquery');

const LayoutGrid = require('./layoutgrid');
const EnumPropertyFilter = require('./enumpropertyfilter');
const GridControl = require('./gridcontrol');
const focusLoop = require('../common/focusloop');

const LayoutCollapseView = function(params) {

    GridControl.extendTo(this, params);
    LayoutGrid.extendTo(this);

    this.registerSimpleProperty("collapsed", false);
    this.registerSimpleProperty("label", null);
    this.registerSimpleProperty("stretchFactor", 1);

    this._collapsed = this.getPropertyValue('collapsed');

    this._body = null;

    this.createItem = function() {
        this.$el.addClass("jmv-collapse-view titled-group top-title silky-layout-container silky-options-group silky-options-group-style-list silky-control-margin-" + this.getPropertyValue("margin"));

        let groupText = this.getPropertyValue('label');
        groupText = this.translate(groupText);
        let t = '<div class="silky-options-collapse-icon" style="display: inline;"> <span class="silky-dropdown-toggle"></span></div>';
        this.labelId = focusLoop.getNextAriaElementId('label');
        this.$header = $(`<button id="${this.labelId}" aria-level="2" class="silky-options-collapse-button silky-control-margin-${this.getPropertyValue("margin")}" style="white-space: nowrap;">${t + groupText }</button>`);

        this.$header.attr('aria-expanded', ! this._collapsed);

        if (this._collapsed) {
            this.$el.addClass('view-colapsed');
            this.$header.addClass('silky-gridlayout-collapsed');
        }

        this._headerCell = this.addCell(0, 0, this.$header);
        this._headerCell.setStretchFactor(1);

        this.$header.on('click', null, this, function(event) {
            let group = event.data;
            group.toggleColapsedState();
        });
    };

    this.setBody = function (body) {
        let bodyId = body.$el.attr('id');
        if (!bodyId) {
            bodyId = focusLoop.getNextAriaElementId('body');
            body.$el.attr('id', bodyId);
        }
        body.$el.attr('role', 'region');
        body.$el.attr('aria-labelledby', this.labelId);

        this.$header.attr('aria-controls', bodyId);

        this._body = body;
        body.$el.addClass("silky-control-body");
        let data = body.renderToGrid(this, 1, 0);
        this._bodyCell = data.cell;
        this._bodyCell.setVisibility(this._collapsed === false, true);
        body.$el.attr('aria-hidden', this._collapsed);
        return data.cell;
    };

    this.collapse = function() {

        if (this._collapsed)
            return;

        this.$header.addClass("silky-gridlayout-collapsed");
        this.$el.addClass('view-colapsed');
        this._body.$el.attr('aria-hidden', true);

        this.setContentVisibility(false);
        this._collapsed = true;
        this.$header.attr('aria-expanded', false);
    };

    this.setContentVisibility = function(visible) {
        this._bodyCell.setVisibility(visible);
    };

    this.expand = function() {

        if ( ! this._collapsed)
            return;

        this.$header.removeClass("silky-gridlayout-collapsed");
        this.$el.removeClass('view-colapsed');
        this._body.$el.attr('aria-hidden', false);

        this.setContentVisibility(true);
        this._collapsed = false;
        this.$header.attr('aria-expanded', true);
    };

    this.toggleColapsedState = function() {
        if (this._collapsed)
            this.expand();
        else
            this.collapse();
    };
};

module.exports = LayoutCollapseView;
