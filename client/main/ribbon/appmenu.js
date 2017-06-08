
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const host = require('../host');

const AppMenuButton = Backbone.View.extend({

    initialize(args) {

        this.$el.addClass('jmv-ribbon-appmenu');

        let $decoration = $('<span class="mif-more-vert"></span>').appendTo(this.$el);
        let $positioner = $('<div class="jmv-ribbon-appmenu-positioner"></div>').appendTo(this.$el);

        this.$menu = $('<div class="jmv-ribbon-appmenu-menu"></div>').appendTo($positioner);

        this.menuVisible = false;
        this.$el.on('click', event => {
            this.toggleMenu();
            event.stopPropagation();
        });

        this.$zoom = $('<div class="jmv-ribbon-appmenu-zoom"></div>').appendTo(this.$menu);
        this.$zoomOut = $('<div class="jmv-ribbon-appmenu-zoomout">&minus;</div>').appendTo(this.$zoom);
        this.$zoomLevel = $('<div class="jmv-ribbon-appmenu-zoomlevel">100%</div>').appendTo(this.$zoom);
        this.$zoomIn = $('<div class="jmv-ribbon-appmenu-zoomin">+</div>').appendTo(this.$zoom);

        this.$syntaxMode = $('<label class="jmv-ribbon-appmenu-checkbox jmv-ribbon-appmenu-syntaxmode"><input type="checkbox">Syntax mode</label>').appendTo(this.$menu);
        this.$syntaxModeCheck = this.$syntaxMode.find('input');

        this.$devMode = $('<label class="jmv-ribbon-appmenu-checkbox jmv-ribbon-appmenu-devmode"><input type="checkbox">Dev mode</label>').appendTo(this.$menu);
        this.$devModeCheck = this.$devMode.find('input');

        this.$theme = $('<div class="jmv-ribbon-appmenu-list">Plot theme </div>')
            .appendTo(this.$menu);
        this.$themeList = $('<select><option value="default">Default</option><option value="minimal">Minimal</option><option value="iheartspss">I ♥ SPSS</option><option value="liberace">Liberace</option><option value="hadley">Hadley</option></select>')
            .appendTo(this.$theme)
            .click(event => event.stopPropagation())
            .change(event => this._changeTheme(event.target.value));

        this.$zoomIn.on('click', event => { this.model.settings().zoomIn(); event.stopPropagation(); });
        this.$zoomOut.on('click', event => { this.model.settings().zoomOut(); event.stopPropagation(); });

        host.on('zoom', event => {
            let z = '' + parseInt(event.zoom * 100) + '%';
            this.$zoomLevel.text(z);
        });

        this.$syntaxModeCheck.on('change', event => this.model.settings().setSetting('syntaxMode', this.$syntaxModeCheck.prop('checked')));
        this.$devModeCheck.on('change', event => {
            this.model.settings().setSetting('devMode', this.$devModeCheck.prop('checked'));
        });

        this.model.settings().on('change:theme', () => this._updateUI());
        this.model.settings().on('change:devMode', () => this._updateUI());
        this.model.settings().on('change:zoom', () => this._updateUI());
    },
    _changeTheme(name) {
        this.model.settings().setSetting('theme', name);
    },
    _updateUI() {
        let settings = this.model.settings();
        let theme = settings.getSetting('theme', 'default');
        this.$themeList.val(theme);
        let devMode = settings.getSetting('devMode', false);
        this.$devModeCheck.prop('checked', devMode);
        let zoom = '' + settings.getSetting('zoom', 100) + '%';
        this.$zoomLevel.text(zoom);
    },
    toggleMenu() {
        if (this.menuVisible)
            this.hide();
        else
            this.show();
    },
    show() {
        if (this.menuVisible)
            return;
        this.menuVisible = true;
        this.trigger('shown', this);
        this.$menu.show();
    },
    hide() {
        this.menuVisible = false;
        this.$menu.hide();
    }
});

module.exports = AppMenuButton;
