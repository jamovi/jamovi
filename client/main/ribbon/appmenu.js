
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const tarp = require('../utils/tarp');
const host = require('../host');

const AppMenuButton = Backbone.View.extend({

    initialize() {

        this.$el.addClass('jmv-ribbon-appmenu');

        let $decoration = $('<span class="mif-more-vert"></span>').appendTo(this.$el);
        let $positioner = $('<div class="jmv-ribbon-appmenu-positioner"></div>').appendTo(this.$el);

        this.$menu = $('<div class="jmv-ribbon-appmenu-menu"></div>').appendTo($positioner);

        this.menuVisible = false;
        this.$el.on('click', event => {
            if ( ! this.menuVisible)
                this._show();
        });

        this.$zoom = $('<div class="jmv-ribbon-appmenu-zoom"></div>').appendTo(this.$menu);
        this.$zoomOut = $('<div class="jmv-ribbon-appmenu-zoomout">&minus;</div>').appendTo(this.$zoom);
        this.$zoomLevel = $('<div class="jmv-ribbon-appmenu-zoomlevel">100%</div>').appendTo(this.$zoom);
        this.$zoomIn = $('<div class="jmv-ribbon-appmenu-zoomin">+</div>').appendTo(this.$zoom);

        this.$syntaxMode = $('<label class="jmv-ribbon-appmenu-checkbox jmv-ribbon-appmenu-syntaxmode"><input type="checkbox">Syntax mode</label>').appendTo(this.$menu);
        this.$syntaxModeCheck = this.$syntaxMode.find('input');

        this.$devMode = $('<label class="jmv-ribbon-appmenu-checkbox jmv-ribbon-appmenu-devmode"><input type="checkbox">Dev mode</label>').appendTo(this.$menu);
        this.$devModeCheck = this.$devMode.find('input');

        this.$zoomIn.on('click', event => host.zoomIn());
        this.$zoomOut.on('click', event => host.zoomOut());

        host.on('zoom', event => {
            let z = '' + parseInt(event.zoom * 100) + '%';
            this.$zoomLevel.text(z);
        });

        this.$syntaxModeCheck.on('change', event => this.model.toggleResultsMode());
        this.$devModeCheck.on('change', event => this.model.toggleDevMode());
    },
    _show() {
        if (this.menuVisible)
            return;
        this.menuVisible = true;
        this.$menu.show();
        tarp.show().catch(() => {
            this._hide();
        });
    },
    _hide() {
        this.menuVisible = false;
        this.$menu.hide();
    }
});

module.exports = AppMenuButton;
