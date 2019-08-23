
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const keyboardjs = require('keyboardjs');
const tippy = require('tippy.js');

const host = require('../host');

const AppMenuButton = Backbone.View.extend({

    initialize(args) {

        this.$el.addClass('jmv-ribbon-appmenu');

        let mode = this.model.settings().getSetting('mode', 'normal');
            this.el.dataset.mode = mode;

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
        this.$back = $('<div class="jmv-ribbon-appmenu-back-button" title="Hide settings"></div>').appendTo(this.$backOuter);
        tippy(this.$back[0], {
            placement: 'left',
            animation: 'perspective',
            duration: 200,
            delay: 700,
            flip: true,
            theme: 'jmv'
        });
        this.$backButton = $('<div></div>').appendTo(this.$back);

        this.$back.on('click', event => {
            this.toggleMenu();
            event.stopPropagation();
            this.$back[0]._tippy.hide();
            this.$back[0]._tippy.disable();
        });

        this.$back.on('mouseout', event => {
            this.$back[0]._tippy.enable();
        });

        this.$content = $('<div class="jmv-ribbon-appmenu-content"></div>').appendTo(this.$menu);

        this.$zoom = $('<div class="jmv-ribbon-appmenu-item jmv-zoom"></div>').appendTo(this.$content);
        this.$zoom.append($('<div>Zoom</div>'));
        this.$zoomButtons = $('<div class="jmv-ribbon-appmenu-zoom-buttons"></div>').appendTo(this.$zoom);
        this.$zoomOut = $('<div class="jmv-ribbon-appmenu-zoomout">&minus;</div>').appendTo(this.$zoomButtons);
        this.$zoomLevel = $('<div class="jmv-ribbon-appmenu-zoomlevel">100%</div>').appendTo(this.$zoomButtons);
        this.$zoomIn = $('<div class="jmv-ribbon-appmenu-zoomin">+</div>').appendTo(this.$zoomButtons);

        this.$content.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        this.$results = $('<div class="jmv-results"></div>').appendTo(this.$content);
        this.$resultsHeading = $('<div class="jmv-ribbon-appmenu-subheading">Results</div>').appendTo(this.$results);

        this.$nFormat = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$content);
        this.$nFormat.append($('<div>Number format</div>'));
        this.$nFormatList = $('<select><optgroup label="significant figures"><option value="sf:3">3 sf</option><option value="sf:4">4 sf</option><option value="sf:5">5 sf</option></optgroup><optgroup label="decimal places"><option value="dp:2">2 dp</option><option value="dp:3">3 dp</option><option value="dp:4">4 dp</option><option value="dp:5">5 dp</option><option value="dp:16">16 dp</optgroup></option></select>')
            .appendTo(this.$nFormat)
            .click(event => event.stopPropagation())
            .change(event => this._changeResultsFormat());

        this.$pFormat = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$content);
        this.$pFormat.append($('<div>p-value format</div>'));
        this.$pFormatList = $('<select><optgroup label="significant figures"><option value="sf:3">3 sf</option><option value="sf:4">4 sf</option><option value="sf:5">5 sf</option></optgroup><optgroup label="decimal places"><option value="dp:3">3 dp</option><option value="dp:4">4 dp</option><option value="dp:5">5 dp</option><option value="dp:16">16 dp</optgroup></option></select>')
            .appendTo(this.$pFormat)
            .click(event => event.stopPropagation())
            .change(event => this._changeResultsFormat());

        this.$refsMode = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$content);
        this.$refsMode.append($('<div>References</div>'));
        this.$refsModeList = $('<select><option value="bottom">Visible</option><option value="hidden">Hidden</option></select>')
            .appendTo(this.$refsMode)
            .click(event => event.stopPropagation())
            .change(event => this._changeRefsMode());

        this.$syntax = $('<label class="jmv-ribbon-appmenu-item checkbox" for="syntaxMode"></label>').appendTo(this.$content);
        this.$syntax.append($('<div>Syntax mode</div>'));
        this.$syntaxModeCheck = $('<input class="jmv-ribbon-appmenu-checkbox" type="checkbox" id="syntaxMode">').appendTo(this.$syntax);

        this.$content.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        this.$plots = $('<div class="jmv-results"></div>').appendTo(this.$content);
        this.$plotsHeading = $('<div class="jmv-ribbon-appmenu-subheading">Plots</div>').appendTo(this.$plots);

        this.$theme = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$content);
        this.$theme.append($('<div>Plot theme</div>'));
        this.$themeList = $('<select><option value="default">Default</option><option value="minimal">Minimal</option><option value="iheartspss">I ♥ SPSS</option><option value="hadley">Hadley</option></select>')
            .appendTo(this.$theme)
            .click(event => event.stopPropagation())
            .change(event => this._changeTheme(event.target.value));

        this.$palette = $('<div class="jmv-ribbon-appmenu-item"></div>').appendTo(this.$content);
        this.$palette.append($('<div>Color palette</div>'));
        this.$paletteList = $('<select><optgroup label="qualitative"><option value="jmv">jmv</option><option value="Dark2">Dark2</option><option value="Set1">Set1</option><option value="Accent">Accent</option><option value="spss">I ♥ SPSS</option><option value="hadley">Hadley</option></optgroup><optgroup label="sequential"><option value="Greys">Greys</option><option value="Blues">Blues</option><option value="Greens">Greens</option></optgroup></select>')
            .appendTo(this.$palette)
            .click(event => event.stopPropagation())
            .change(event => this._changePalette(event.target.value));

        this.$content.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        this.$import = $('<div class="jmv-results"></div>').appendTo(this.$content);
        this.$importHeading = $('<div class="jmv-ribbon-appmenu-subheading">Import</div>').appendTo(this.$import);

        this.$missings = $('<label class="jmv-ribbon-appmenu-item"><div>Default missings</div></label>').appendTo(this.$import);
        this.$missingsInput = $('<input type="text" size="10" class="jmv-import-missings" list="missings">').appendTo(this.$missings);
        //this.$missingsItems = $('<datalist id="missings"><option value="NA"><option value="-999999"></datalist>').appendTo(this.$missings);
        this.$missingsInput.on('keydown', (event) => {
            if (event.keyCode === 13)
                setTimeout(() => this.$missingsInput.blur());
        });
        this.$missingsInput.on('focus', () => keyboardjs.pause());
        this.$missingsInput.on('blur', () => { keyboardjs.resume(); this._changeMissings(); });

        // this.$embed = $('<label class="jmv-ribbon-appmenu-item"><div>Embed raw data</div></label>').appendTo(this.$import);
        // this.$embedList = $('<select><option value="never">Never</option><option value="< 1 Mb">&lt; 1 Mb</option><option value="< 10 Mb">&lt; 10 Mb</option><option value="< 100 Mb">&lt; 100 Mb</option><option value="always">Always</option></select>')
        //     .appendTo(this.$embed)
        //     .on('change', (event) => this.model.settings().setSetting('embedCond', event.target.value));
        this.$import.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        this.$updateInfo = $('<div class="jmv-update-info" style="display: none"></div>').appendTo(this.$content);
        this.$versionInfo = $('<div class="jmv-ribbon-appmenu-subheading">Updates</div>').appendTo(this.$updateInfo);

        this.$versionInfoStatus = { };
        this.$versionInfoStatus.uptodate    = $('<div class="jmv-version-info-uptodate jmv-ribbon-appmenu-item">jamovi is up-to-date<button>Check again</button></div>').appendTo(this.$updateInfo);
        this.$versionInfoStatus.checking    = $('<div class="jmv-version-info-checking jmv-ribbon-appmenu-item"><label>Checking for updates</label><img width="16" height="16" src="../assets/indicator-running.svg"></div>').appendTo(this.$updateInfo);
        this.$versionInfoStatus.checkerror  = $('<div class="jmv-version-info-checkerror jmv-ribbon-appmenu-item">Update not found<button>Retry</button></div>').appendTo(this.$updateInfo);
        this.$versionInfoStatus.available   = $('<div class="jmv-version-info-available jmv-ribbon-appmenu-item"><label>An update is available</label><button>Update</button></div>').appendTo(this.$updateInfo);
        this.$versionInfoStatus.downloading = $('<div class="jmv-version-info-downloading jmv-ribbon-appmenu-item">Update is being downloaded<img width="16" height="16" src="../assets/indicator-running.svg"></div>').appendTo(this.$updateInfo);
        this.$versionInfoStatus.error       = $('<div class="jmv-version-info-error jmv-ribbon-appmenu-item"><label>Update did not complete</label><button>Retry</button></div>').appendTo(this.$updateInfo);
        this.$versionInfoStatus.ready       = $('<div class="jmv-version-info-ready jmv-ribbon-appmenu-item"><label>Update is ready</label><button>Restart and Install</button></div>').appendTo(this.$updateInfo);

        this.$versionInfoStatus.uptodate.find('button').on('click', () => this._checkForUpdate());
        this.$versionInfoStatus.checkerror.find('button').on('click', () => this._checkForUpdate());
        this.$versionInfoStatus.available.find('button').on('click', () => this._downloadUpdate());
        this.$versionInfoStatus.error.find('button').on('click', () => this._downloadUpdate());
        this.$versionInfoStatus.ready.find('button').on('click', () => this._restartAndInstall());

        this.$versionInfoUpdates = $('<label class="jmv-ribbon-appmenu-item checkbox" for="keep-uptodate"></label>').appendTo(this.$updateInfo);
        this.$versionInfoUpdates.append($('<div>Automatically install updates</div>'));
        this.$versionInfoUpdatesCheck = $('<input class="jmv-ribbon-appmenu-checkbox" type="checkbox" id="keep-uptodate">').appendTo(this.$versionInfoUpdates);

        this.$updateInfo.append($('<div class="jmv-ribbon-appmenu-separator"></div>'));

        this.$recorder = $('<div class="jmv-ribbon-appmenu-item action jmv-recorder">Screen Capture Tool</div>').appendTo(this.$content);
        this.$recorder.on('click', (event) => host.openRecorder());

        this.$dev = $('<label class="jmv-ribbon-appmenu-item checkbox jmv-devmode" for="devMode"></label>').appendTo(this.$content);
        this.$dev.append($('<div>Developer mode</div>'));
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
            this.$version.text('Version ' + version);
        });

        this.$syntaxModeCheck.on('change', event => this.model.settings().setSetting('syntaxMode', this.$syntaxModeCheck.prop('checked')));
        this.$devModeCheck.on('change', event => {
            this.model.settings().setSetting('devMode', this.$devModeCheck.prop('checked'));
        });

        this.$versionInfoUpdatesCheck.on('change', event => {
            this.model.settings().setSetting('autoUpdate', this.$versionInfoUpdatesCheck.prop('checked'));
        });

        this.model.settings().on('change:theme',        () => this._updateUI());
        this.model.settings().on('change:palette',      () => this._updateUI());
        this.model.settings().on('change:devMode',      () => this._updateUI());
        this.model.settings().on('change:zoom',         () => this._updateUI());
        this.model.settings().on('change:updateStatus', () => this._updateUI());
        this.model.settings().on('change:autoUpdate',   () => this._updateUI());
        this.model.settings().on('change:format',       () => this._updateUI());
        this.model.settings().on('change:missings',     () => this._updateUI());
        this.model.settings().on('change:refsMode',     () => this._updateUI());
        // this.model.settings().on('change:embedCond',    () => this._updateUI());

        this._updateUI();
    },
    _checkForUpdate() {
        this.model.settings().setSetting('updateStatus', 'checking');
    },
    _downloadUpdate() {
        this.model.settings().setSetting('updateStatus', 'downloading');
    },
    _restartAndInstall() {
        this.model.settings().setSetting('updateStatus', 'installing');
    },
    _changeTheme(name) {
        this.model.settings().setSetting('theme', name);
        if (name === 'iheartspss')
            this.model.settings().setSetting('palette', 'spss');
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
        // let embedCond = settings.getSetting('embedCond', '< 10 Mb');
        // this.$embedList.val(embedCond);

        let autoUpdate = settings.getSetting('autoUpdate', false);
        this.$versionInfoUpdatesCheck.prop('checked', autoUpdate);

        let status = settings.getSetting('updateStatus', 'na');

        if (status === 'na')
            this.$updateInfo.hide();
        else
            this.$updateInfo.show();

        for (let key in this.$versionInfoStatus) {
            let $item = this.$versionInfoStatus[key];
            if (key === status)
                $item.show();
            else
                $item.hide();
        }
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
