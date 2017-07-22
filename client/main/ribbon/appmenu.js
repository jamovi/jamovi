
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

        this.$menuPanel = $('<div class="jmv-ribbon-appmenu-menu-panel"></div>').appendTo($positioner);
        this.$menu = $('<div class="jmv-ribbon-appmenu-menu"></div>').appendTo(this.$menuPanel);

        this.menuVisible = false;
        this.$el.on('click', event => {
            this.toggleMenu();
            event.stopPropagation();
        });
        this.$menuPanel.on('click', event => {
            event.stopPropagation();
        });

        this.$header = $('<div class="jmv-ribbon-appmenu-header"></div>').appendTo(this.$menu);
        this.$icon = $('<div class="jmv-ribbon-appmenu-icon"></div>').appendTo(this.$header);
        this.$backOuter = $('<div class="jmv-ribbon-appmenu-back"></div>').appendTo(this.$header);
        this.$back = $('<div class="jmv-ribbon-appmenu-back-button"></div>').appendTo(this.$backOuter);
        this.$backButton = $('<div></div>').appendTo(this.$back);

        this.$back.on('click', event => {
            this.toggleMenu();
            event.stopPropagation();
        });

        this.$content = $('<div class="jmv-ribbon-appmenu-content"></div>').appendTo(this.$menu);

        this.$zoom = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$content);
        this.$zoom.append($('<div>Zoom</div>'));
        this.$zoomButtons = $('<div class="jmv-ribbon-appmenu-zoom-buttons"></div>').appendTo(this.$zoom);
        this.$zoomOut = $('<div class="jmv-ribbon-appmenu-zoomout">&minus;</div>').appendTo(this.$zoomButtons);
        this.$zoomLevel = $('<div class="jmv-ribbon-appmenu-zoomlevel">100%</div>').appendTo(this.$zoomButtons);
        this.$zoomIn = $('<div class="jmv-ribbon-appmenu-zoomin">+</div>').appendTo(this.$zoomButtons);

        this.$content.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        this.$syntax = $('<label class="jmv-ribbon-appmenu-item checkbox" for="syntaxMode"></label>').appendTo(this.$content);
        this.$syntax.append($('<div>Syntax mode</div>'));
        this.$syntaxModeCheck = $('<input class="jmv-ribbon-appmenu-checkbox" type="checkbox" id="syntaxMode">').appendTo(this.$syntax);

        this.$dev = $('<label class="jmv-ribbon-appmenu-item checkbox" for="devMode"></label>').appendTo(this.$content);
        this.$dev.append($('<div>Developer mode</div>'));
        this.$devModeCheck = $('<input class="jmv-ribbon-appmenu-checkbox" type="checkbox" id="devMode">').appendTo(this.$dev);

        this.$content.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        this.$theme = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$content);
        this.$theme.append($('<div>Plot theme</div>'));
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

        this.$version = $('<div class="jmv-ribbon-appmenu-version">Version ' + host.version + '</div>').appendTo(this.$menu);

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
        this.$menuPanel.addClass('activated');
    },
    hide() {
        if ( ! this.menuVisible)
            return;
        this.menuVisible = false;
        this.$menuPanel.removeClass('activated');
        this.trigger('hidden');
    }
});

module.exports = AppMenuButton;
