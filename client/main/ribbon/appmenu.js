
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const i18n = require('../../common/i18n');
const focusLoop = require('../../common/focusloop');
const host = require('../host');

const AppMenuButton = Backbone.View.extend({

    initialize(args) {

        this.$el.addClass('jmv-ribbon-appmenu');

        let mode = this.model.settings().getSetting('mode', 'normal');
            this.el.dataset.mode = mode;

        let $decoration = $('<span class="mif-more-vert" role="none"></span>').appendTo(this.$el);
        let $positioner = $('<div class="jmv-ribbon-appmenu-positioner"></div>').appendTo(this.$el);

        let menuId = focusLoop.getNextAriaElementId('menu');
        this.$menuPanel = $('<div id="${menuId}" class="jmv-ribbon-appmenu-menu-panel" tabindex="-1" role="grid" aria-label="Application preferences" aria-modal="true"></div>').appendTo($positioner);
        //this.$el.attr('aria-controls', menuId);

        this.$menu = $(`<div class="jmv-ribbon-appmenu-menu"></div>`).appendTo(this.$menuPanel);

        focusLoop.addFocusLoop(this.$menuPanel[0], { level: 1, closeHandler: this.hide.bind(this), exitSelector: '.jmv-ribbon-appmenu' } );

        this.menuVisible = false;
        this.$el.on('click', event => {
            this.toggleMenu(event.detail > 0);
            event.stopPropagation();
        });

        this.$menuPanel.on('click', event => {
            event.stopPropagation();
        });

        this.$menuPanel.on('focusout', (event) => {
            if ( ! this.$menuPanel[0].contains(event.relatedTarget))
                this.hide();
        });

        this.$header = $('<div class="jmv-ribbon-appmenu-header" role="none"></div>').appendTo(this.$menu);
        this.$icon = $('<div class="jmv-ribbon-appmenu-icon" role="none"></div>').appendTo(this.$header);
        this.$backOuter = $('<div class="jmv-ribbon-appmenu-back" role="none"></div>').appendTo(this.$header);
        this.$back = $(`<button class="jmv-ribbon-appmenu-back-button" aria-label="${_('Close preferences')}"></button>`).appendTo(this.$backOuter);
        this.$backButton = $('<div></div>').appendTo(this.$back);

        this.$back.on('click', event => {
            focusLoop.leaveFocusLoop(this.$menuPanel[0], event.detail > 0);
            event.stopPropagation();
        });

        this.$content = $('<div class="jmv-ribbon-appmenu-content" role="none"></div>').appendTo(this.$menu);

        let zoomId = focusLoop.getNextAriaElementId('label');
        this.$zoom = $('<div class="jmv-ribbon-appmenu-item jmv-zoom"></div>').appendTo(this.$content);
        this.$zoom.append($(`<div id="${zoomId}">${_('Zoom')}</div>`));
        this.$zoomButtons = $('<div class="jmv-ribbon-appmenu-zoom-buttons"></div>').appendTo(this.$zoom);
        this.$zoomOut = $(`<button class="jmv-ribbon-appmenu-zoomout" aria-label="${_('Zoom out')}">&minus;</button>`).appendTo(this.$zoomButtons);
        this.$zoomLevel = $('<div class="jmv-ribbon-appmenu-zoomlevel">100%</div>').appendTo(this.$zoomButtons);
        this.$zoomIn = $(`<button class="jmv-ribbon-appmenu-zoomin" aria-label="${_('Zoom in')}">+</button>`).appendTo(this.$zoomButtons);

        this.$content.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        let resultsId = focusLoop.getNextAriaElementId('label');
        this.$results = $(`<div class="jmv-results" role="group" aria-labelledby="${resultsId}"></div>`).appendTo(this.$content);
        this.$resultsHeading = $(`<div id="${resultsId}" class="jmv-ribbon-appmenu-subheading">${_('Results')}</div>`).appendTo(this.$results);

        let nFormatId = focusLoop.getNextAriaElementId('label');
        this.$nFormat = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$results);
        this.$nFormat.append($(`<div id="${nFormatId}">${_('Number format')}</div>`));
        this.$nFormatList = $(`<select aria-labelledby="${nFormatId}"><optgroup label="${_('significant figures')}"><option value="sf:3">${ _('{n} sf', { n: 3 }) }</option><option value="sf:4">${ _('{n} sf', { n: 4 }) }</option><option value="sf:5">${ _('{n} sf', { n: 5 }) }</option></optgroup><optgroup label="${_('decimal places')}"><option value="dp:2">${ _('{n} dp', { n: 2 }) }</option><option value="dp:3">${ _('{n} dp', { n: 3 }) }</option><option value="dp:4">${ _('{n} dp', { n: 4 }) }</option><option value="dp:5">${ _('{n} dp', { n: 5 }) }</option><option value="dp:16">${ _('{n} dp', { n: 16 }) }</option></optgroup></select>`)
            .appendTo(this.$nFormat)
            .click(event => event.stopPropagation())
            .change(event => this._changeResultsFormat());

        let pFormatId = focusLoop.getNextAriaElementId('label');
        this.$pFormat = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$results);
        this.$pFormat.append($(`<div id="${pFormatId}">${_('p-value format')}</div>`));
        this.$pFormatList = $(`<select aria-labelledby="${pFormatId}"><optgroup label="${_('significant figures')}"><option value="sf:3">${ _('{n} sf', { n: 3 }) }</option><option value="sf:4">${ _('{n} sf', { n: 4 }) }</option><option value="sf:5">${ _('{n} sf', { n: 5 }) }</option></optgroup><optgroup label="${_('decimal places')}"><option value="dp:3">${ _('{n} dp', { n: 3 }) }</option><option value="dp:4">${ _('{n} dp', { n: 4 }) }</option><option value="dp:5">${ _('{n} dp', { n: 5 }) }</option><option value="dp:16">${ _('{n} dp', { n: 16 }) }</option></optgroup></select>`)
            .appendTo(this.$pFormat)
            .click(event => event.stopPropagation())
            .change(event => this._changeResultsFormat());

        let refsModeId = focusLoop.getNextAriaElementId('label');
        this.$refsMode = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$results);
        this.$refsMode.append($(`<div id="${refsModeId}">${_('References')}</div>`));
        this.$refsModeList = $(`<select aria-labelledby="${refsModeId}"><option value="bottom">${_('Visible')}</option><option value="hidden">${_('Hidden')}</option></select>`)
            .appendTo(this.$refsMode)
            .click(event => event.stopPropagation())
            .change(event => this._changeRefsMode());

        let syntaxId = focusLoop.getNextAriaElementId('label');
        this.$syntax = $('<label class="jmv-ribbon-appmenu-item checkbox" for="syntaxMode"></label>').appendTo(this.$results);
        this.$syntax.append($(`<div id="${syntaxId}">${_('Syntax mode')}</div>`));
        this.$syntaxModeCheck = $(`<input aria-labelledby="${syntaxId}" class="jmv-ribbon-appmenu-checkbox" type="checkbox" id="syntaxMode">`).appendTo(this.$syntax);

        this.$content.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        let plotsId = focusLoop.getNextAriaElementId('label');
        this.$plots = $(`<div class="jmv-results" role="group" aria-labelledby="${plotsId}"></div>`).appendTo(this.$content);
        this.$plotsHeading = $(`<div id="${plotsId}" class="jmv-ribbon-appmenu-subheading">${_('Plots')}</div>`).appendTo(this.$plots);

        let themeId = focusLoop.getNextAriaElementId('label');
        this.$theme = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$plots);
        this.$theme.append($(`<div id="${themeId}">${_('Plot theme')}</div>`));
        this.$themeList = $(`<select aria-labelledby="${themeId}"><option value="default">${_('Default')}</option><option value="minimal">${_('Minimal')}</option><option value="iheartspss">${_('I ♥ SPSS')}</option><option value="hadley">${_('Hadley')}</option><option value="bw">${_('Black & white')}</option></select>`)
            .appendTo(this.$theme)
            .click(event => event.stopPropagation())
            .change(event => this._changeTheme(event.target.value));

        let paletteId = focusLoop.getNextAriaElementId('label');
        this.$palette = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$plots);
        this.$palette.append($(`<div id="${paletteId}">${_('Color palette')}</div>`));
        this.$paletteList = $(`<select aria-labelledby="${paletteId}"><optgroup label="${_('qualitative')}"><option value="jmv">jmv</option><option value="Dark2">${_('Dark2')}</option><option value="Set1">${_('Set1')}</option><option value="Accent">${_('Accent')}</option><option value="spss">${_('I ♥ SPSS')}</option><option value="hadley">${_('Hadley')}</option></optgroup><optgroup label="${_('sequential')}"><option value="Greys">${_('Greys')}</option><option value="Blues">${_('Blues')}</option><option value="Greens">${_('Greens')}</option></optgroup></select>`)
            .appendTo(this.$palette)
            .click(event => event.stopPropagation())
            .change(event => this._changePalette(event.target.value));

        this.$content.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        let importId = focusLoop.getNextAriaElementId('label');
        this.$import = $(`<div class="jmv-results" role="group" aria-labelledby="${importId}"></div>`).appendTo(this.$content);
        this.$importHeading = $(`<div id="${importId}" class="jmv-ribbon-appmenu-subheading">${_('Import')}</div>`).appendTo(this.$import);

        this.$missings = $(`<label class="jmv-ribbon-appmenu-item"><div>${_('Default missings')}</div></label>`).appendTo(this.$import);
        this.$missingsInput = $('<input type="text" size="10" class="jmv-import-missings" list="missings">').appendTo(this.$missings);
        //this.$missingsItems = $('<datalist id="missings"><option value="NA"><option value="-999999"></datalist>').appendTo(this.$missings);
        this.$missingsInput.on('keydown', (event) => {
            if (event.keyCode === 13)
                setTimeout(() => this.$missingsInput.blur());
        });
        this.$missingsInput.on('blur', () => { this._changeMissings(); });

        // this.$embed = $('<label class="jmv-ribbon-appmenu-item"><div>Embed raw data</div></label>').appendTo(this.$import);
        // this.$embedList = $('<select><option value="never">Never</option><option value="< 1 Mb">&lt; 1 Mb</option><option value="< 10 Mb">&lt; 10 Mb</option><option value="< 100 Mb">&lt; 100 Mb</option><option value="always">Always</option></select>')
        //     .appendTo(this.$embed)
        //     .on('change', (event) => this.model.settings().setSetting('embedCond', event.target.value));
        this.$content.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        let languageId = focusLoop.getNextAriaElementId('label');
        this.$language = $('<div class="jmv-language-selector jmv-ribbon-appmenu-item"></div>').appendTo(this.$content);
        this.$language.append($(`<div id="${languageId}">${_('Language')}</div>`));
        this.$languageList = $(`<select aria-labelledby="${languageId}"></select>`)
            .appendTo(this.$language)
            .click(event => event.stopPropagation())
            .change(event => this._changeLanguage());

        this.$dev = $('<label class="jmv-ribbon-appmenu-item checkbox jmv-devmode" for="devMode"></label>').appendTo(this.$content);
        this.$dev.append($(`<div>${_('Developer mode')}</div>`));
        this.$devModeCheck = $('<input class="jmv-ribbon-appmenu-checkbox" type="checkbox" id="devMode">').appendTo(this.$dev);

        this.$zoomIn.on('click', event => { this.model.settings().zoomIn(); event.stopPropagation(); });
        this.$zoomOut.on('click', event => { this.model.settings().zoomOut(); event.stopPropagation(); });

        host.on('zoom', event => {
            let z = '' + parseInt(event.zoom * 100) + '%';
            this.$zoomLevel.text(z);
        });

        this.$spacer = $('<div class="jmv-ribbon-appmenu-spacer"></div>').appendTo(this.$menu);
        this.$version = $('<div class="jmv-ribbon-appmenu-version"></div>').appendTo(this.$menu);

        host.version.then(version => {
            this.$version.text(_('Version {v}', { v: version }));
        });

        this.$syntaxModeCheck.on('change', event => this.model.settings().setSetting('syntaxMode', this.$syntaxModeCheck.prop('checked')));
        this.$devModeCheck.on('change', event => {
            this.model.settings().setSetting('devMode', this.$devModeCheck.prop('checked'));
        });

        this.model.settings().on('change:theme',        () => this._updateUI());
        this.model.settings().on('change:palette',      () => this._updateUI());
        this.model.settings().on('change:devMode',      () => this._updateUI());
        this.model.settings().on('change:zoom',         () => this._updateUI());
        this.model.settings().on('change:format',       () => this._updateUI());
        this.model.settings().on('change:missings',     () => this._updateUI());
        this.model.settings().on('change:refsMode',     () => this._updateUI());
        this.model.settings().on('change:selectedLanguage', () => this._updateUI());

        let available = i18n.availableLanguages().map((code) => {
            if (code === '---')
                return `</optgroup><optgroup label="${ _('In development') }">`;
              
            let ownName;
            if (code === 'zh-cn') {
                // sensitive! shouldn't be translated
                ownName = 'Chinese (Simplified)';
            }
            else if (code === 'zh-tw') {
                // sensitive! shouldn't be translated
                ownName = 'Chinese (Traditional)';
            }
            else {
                ownName = new Intl.DisplayNames([code], { type: 'language' }).of(code);
                ownName = `${ ownName[0].toUpperCase() }${ ownName.slice(1) }`; // capitalise first letter
            }
            return `<option value="${ code }">${ ownName }</option>`;
        });
        available.unshift(`<optgroup label="${ _('Available') }">`);
        available.push('</optgroup>');

        available.unshift(`<option value="">${ _('System default') }</option>`);


        this.$languageList[0].innerHTML = available.join('');

        this._updateUI();
    },
    _changeTheme(name) {
        this.model.settings().setSetting('theme', name);
        if (name === 'iheartspss')
            this.model.settings().setSetting('palette', 'spss');
        else if (name === 'bw')
            this.model.settings().setSetting('palette', 'Greys');
    },
    _changePalette(name) {
        this.model.settings().setSetting('palette', name);
    },
    _changeMissings() {
        let missings = this.$missingsInput.val().trim();
        this.model.settings().setSetting('missings', missings);
    },
    _changeResultsFormat() {

        let nfs = this.$nFormatList.val();
        let pfs = this.$pFormatList.val();

        let nfm = nfs.match(/(sf|dp):([0-9]+)/);
        let pfm = pfs.match(/(sf|dp):([0-9]+)/);
        let fmt = {
            t: nfm[1],
            n: parseInt(nfm[2]),
            pt: pfm[1],
            p: parseInt(pfm[2]) };

        let value = JSON.stringify(fmt);
        this.model.settings().setSetting('format', value);
    },
    _changeLanguage() {
        let language = this.$languageList.val();
        this.model.settings().setSetting('selectedLanguage', language);
        host.showMessageBox({
            title: _('Restart required'),
            message: _('A change of language requires jamovi to be restarted'),
        });
    },
    _changeRefsMode() {
        this.model.settings().setSetting('refsMode', this.$refsModeList.val());
    },
    _updateUI() {
        let settings = this.model.settings();

        let fmt = settings.getSetting('format');
        let nf, pf;
        try {
            fmt = JSON.parse(fmt);
            if ( ! ('pt' in fmt))
                fmt.pt = 'dp';
            nf = fmt.t + ':' + fmt.n;
            pf = fmt.pt + ':' + fmt.p;
        }
        catch (e) {
            nf = 'sf:3';
            pf = 'dp:3';
        }

        this.$nFormatList.val(nf);
        this.$pFormatList.val(pf);

        let refsMode = settings.getSetting('refsMode', 'bottom');
        this.$refsModeList.val(refsMode);

        let theme = settings.getSetting('theme', 'default');
        this.$themeList.val(theme);
        let palette = settings.getSetting('palette', 'jmv');
        this.$paletteList.val(palette);
        let devMode = settings.getSetting('devMode', false);
        this.$devModeCheck.prop('checked', devMode);
        let zoom = '' + settings.getSetting('zoom', 100) + '%';
        this.$zoomLevel.text(zoom);
        let missings = settings.getSetting('missings', 'NA');
        this.$missingsInput.val(missings);

        let language = settings.getSetting('selectedLanguage', '');
        this.$languageList.val(language);

        for (let key in this.$versionInfoStatus) {
            let $item = this.$versionInfoStatus[key];
            if (key === status)
                $item.show();
            else
                $item.hide();
        }
    },
    toggleMenu(fromMouse) {
        if (this.menuVisible)
            this.hide(fromMouse);
        else
            this.show(fromMouse);
    },
    show(fromMouse) {
        if (this.menuVisible)
            return;
        this.menuVisible = true;
        this.$menuPanel.addClass('activated');
        //this.$el.attr('aria-expanded', 'true');
        setTimeout(() => {
            focusLoop.enterFocusLoop(this.$menuPanel[0], { withMouse: fromMouse });
        }, 200);

    },
    hide(fromMouse) {
        if ( ! this.menuVisible)
            return;
        this.menuVisible = false;
        //this.$el.attr('aria-expanded', 'false');
        this.$menuPanel.removeClass('activated');
        this.trigger('hidden');
    }
});

module.exports = AppMenuButton;
