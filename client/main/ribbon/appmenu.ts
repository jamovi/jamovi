
'use strict';

import { EventDistributor } from "../../common/eventmap";

import i18n from '../../common/i18n';
import focusLoop from '../../common/focusloop';
import host from '../host';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';
import { RibbonModel } from "../ribbon";

export class AppMenuButton extends EventDistributor {

    $menuPanel: HTMLElement;
    menuVisible = false;
    $zoomLevel: HTMLElement;
    $nFormatList: HTMLSelectElement;
    $pFormatList: HTMLSelectElement;
    $refsModeList: HTMLSelectElement;
    $themeList: HTMLSelectElement;
    $paletteList: HTMLSelectElement;
    $missingsInput: HTMLInputElement;
    $devModeCheck: HTMLInputElement;
    $languageList: HTMLSelectElement;
    model: RibbonModel;

    constructor(model: RibbonModel) {
        super();

        this.model = model;
        this.classList.add('jmv-ribbon-appmenu');
        this.setAttribute('role', 'button');
        this.setAttribute('tabindex', '0');

        this.addEventListener('keydown', (event) => {
            if (event.code === 'Enter' || event.code === 'Space')
                this.toggleMenu(false);
        });

        this.setAttribute('aria-label', _('Preferences'));

        let mode = this.model.settings().getSetting('mode', 'normal');
        this.dataset.mode = mode;

        let $decoration = HTML.parse('<span class="mif-more-vert" role="none"></span>');
        this.append($decoration);
        let $positioner = HTML.parse('<div class="jmv-ribbon-appmenu-positioner"></div>');
        this.append($positioner);

        let menuId = focusLoop.getNextAriaElementId('menu');
        this.$menuPanel = HTML.parse(`<div id="${menuId}" class="jmv-ribbon-appmenu-menu-panel" tabindex="-1" role="grid" aria-label="Application preferences" aria-modal="true"></div>`);
        $positioner.append(this.$menuPanel);

        let $menu = HTML.parse(`<div class="jmv-ribbon-appmenu-menu"></div>`)
        this.$menuPanel.append($menu);

        focusLoop.addFocusLoop(this.$menuPanel, { level: 1, closeHandler: this.hide.bind(this), exitSelector: '.jmv-ribbon-appmenu' } );

        this.addEventListener('click', event => {
            this.toggleMenu(event.detail > 0);
            event.stopPropagation();
        });

        this.$menuPanel.addEventListener('click', event => {
            event.stopPropagation();
        });

        this.$menuPanel.addEventListener('focusout', (event: FocusEvent) => {
            if (event.relatedTarget == null || (event.relatedTarget instanceof Node && ! this.$menuPanel.contains(event.relatedTarget)))
                this.hide(false);
        });

        let $header = HTML.parse('<div class="jmv-ribbon-appmenu-header" role="none"></div>');
        $menu.append($header);
        $header.append(HTML.parse('<div class="jmv-ribbon-appmenu-icon" role="none"></div>'));
        let $backOuter = HTML.parse('<div class="jmv-ribbon-appmenu-back" role="none"></div>');
        $header.append($backOuter);
        let $back = HTML.parse(`<button class="jmv-ribbon-appmenu-back-button" aria-label="${_('Close preferences')}"></button>`);
        $backOuter.append($back);
        $back.append(HTML.parse('<div></div>'));

        $back.addEventListener('click', event => {
            focusLoop.leaveFocusLoop(this.$menuPanel, event.detail > 0);
            event.stopPropagation();
        });

        let $content = HTML.parse('<div class="jmv-ribbon-appmenu-content" role="none"></div>');
        $menu.append($content);

        let zoomId = focusLoop.getNextAriaElementId('label');
        let $zoom = HTML.parse('<div class="jmv-ribbon-appmenu-item jmv-zoom"></div>');
        $content.append($zoom);
        $zoom.append(HTML.parse(`<div id="${zoomId}">${_('Zoom')}</div>`));
        let $zoomButtons = HTML.parse('<div class="jmv-ribbon-appmenu-zoom-buttons"></div>');
        $zoom.append($zoomButtons);
        let $zoomOut = HTML.parse(`<button class="jmv-ribbon-appmenu-zoomout" aria-label="${_('Zoom out')}">&minus;</button>`);
        $zoomButtons.append($zoomOut);
        this.$zoomLevel = HTML.parse('<div class="jmv-ribbon-appmenu-zoomlevel">100%</div>');
        $zoomButtons.append(this.$zoomLevel);
        let $zoomIn = HTML.parse(`<button class="jmv-ribbon-appmenu-zoomin" aria-label="${_('Zoom in')}">+</button>`);
        $zoomButtons.append($zoomIn);

        $content.append(HTML.parse('<div class="jmv-ribbon-appmenu-separator"></div>'));

        let resultsId = focusLoop.getNextAriaElementId('label');
        let $results = HTML.parse(`<div class="jmv-results" role="group" aria-labelledby="${resultsId}"></div>`);
        $content.append($results);
        $results.append(HTML.parse(`<div id="${resultsId}" class="jmv-ribbon-appmenu-subheading">${_('Results')}</div>`));

        let nFormatId = focusLoop.getNextAriaElementId('label');
        let $nFormat = HTML.parse('<div class="jmv-ribbon-appmenu-item"></div>');
        $results.append($nFormat);
        $nFormat.append(HTML.parse(`<div id="${nFormatId}">${_('Number format')}</div>`));
        this.$nFormatList = HTML.parse(`<select aria-labelledby="${nFormatId}"><optgroup label="${_('significant figures')}"><option value="sf:3">${ _('{n} sf', { n: 3 }) }</option><option value="sf:4">${ _('{n} sf', { n: 4 }) }</option><option value="sf:5">${ _('{n} sf', { n: 5 }) }</option></optgroup><optgroup label="${_('decimal places')}"><option value="dp:2">${ _('{n} dp', { n: 2 }) }</option><option value="dp:3">${ _('{n} dp', { n: 3 }) }</option><option value="dp:4">${ _('{n} dp', { n: 4 }) }</option><option value="dp:5">${ _('{n} dp', { n: 5 }) }</option><option value="dp:16">${ _('{n} dp', { n: 16 }) }</option></optgroup></select>`)
        $nFormat.append(this.$nFormatList);
        this.$nFormatList.addEventListener('click', event => event.stopPropagation());
        this.$nFormatList.addEventListener('change', event => this._changeResultsFormat());

        let pFormatId = focusLoop.getNextAriaElementId('label');
        let $pFormat = HTML.parse('<div class="jmv-ribbon-appmenu-item"></div>');
        $results.append($pFormat);
        $pFormat.append(HTML.parse(`<div id="${pFormatId}">${_('p-value format')}</div>`));
        this.$pFormatList = HTML.parse(`<select aria-labelledby="${pFormatId}"><optgroup label="${_('significant figures')}"><option value="sf:3">${ _('{n} sf', { n: 3 }) }</option><option value="sf:4">${ _('{n} sf', { n: 4 }) }</option><option value="sf:5">${ _('{n} sf', { n: 5 }) }</option></optgroup><optgroup label="${_('decimal places')}"><option value="dp:3">${ _('{n} dp', { n: 3 }) }</option><option value="dp:4">${ _('{n} dp', { n: 4 }) }</option><option value="dp:5">${ _('{n} dp', { n: 5 }) }</option><option value="dp:16">${ _('{n} dp', { n: 16 }) }</option></optgroup></select>`);
        $pFormat.append(this.$pFormatList);
        this.$pFormatList.addEventListener('click', event => event.stopPropagation())
        this.$pFormatList.addEventListener('change', event => this._changeResultsFormat());

        let refsModeId = focusLoop.getNextAriaElementId('label');
        let $refsMode = HTML.parse('<div class="jmv-ribbon-appmenu-item"></div>');
        $results.append($refsMode);
        $refsMode.append(HTML.parse(`<div id="${refsModeId}">${_('References')}</div>`));
        this.$refsModeList = HTML.parse(`<select aria-labelledby="${refsModeId}"><option value="bottom">${_('Visible')}</option><option value="hidden">${_('Hidden')}</option></select>`)
        $refsMode.append(this.$refsModeList);
        this.$refsModeList.addEventListener('click', event => event.stopPropagation())
        this.$refsModeList.addEventListener('change', event => this._changeRefsMode());

        let syntaxId = focusLoop.getNextAriaElementId('label');
        let $syntax = HTML.parse('<label class="jmv-ribbon-appmenu-item checkbox" for="syntaxMode"></label>');
        $results.append($syntax);
        $syntax.append(HTML.parse(`<div id="${syntaxId}">${_('Syntax mode')}</div>`));
        let $syntaxModeCheck = HTML.parse<HTMLInputElement>(`<input aria-labelledby="${syntaxId}" class="jmv-ribbon-appmenu-checkbox" type="checkbox" id="syntaxMode">`);
        $syntax.append($syntaxModeCheck);

        $content.append(HTML.parse('<div class="jmv-ribbon-appmenu-separator"></div>'));

        let plotsId = focusLoop.getNextAriaElementId('label');
        let $plots = HTML.parse(`<div class="jmv-results" role="group" aria-labelledby="${plotsId}"></div>`);
        $content.append($plots);
        $plots.append(HTML.parse(`<div id="${plotsId}" class="jmv-ribbon-appmenu-subheading">${_('Plots')}</div>`));
        

        let themeId = focusLoop.getNextAriaElementId('label');
        let $theme = HTML.parse('<div class="jmv-ribbon-appmenu-item"></div>');
        $plots.append($theme);
        $theme.append(HTML.parse(`<div id="${themeId}">${_('Plot theme')}</div>`));
        this.$themeList = HTML.parse(`<select aria-labelledby="${themeId}"><option value="default">${_('Default')}</option><option value="minimal">${_('Minimal')}</option><option value="iheartspss">${_('I ♥ SPSS')}</option><option value="hadley">${_('Hadley')}</option><option value="bw">${_('Black & white')}</option></select>`);
        $theme.append(this.$themeList);
        this.$themeList.addEventListener('click', event => event.stopPropagation())
        this.$themeList.addEventListener('change', event => this._changeTheme(event.target.value));

        let paletteId = focusLoop.getNextAriaElementId('label');
        let $palette = HTML.parse('<div class="jmv-ribbon-appmenu-item"></div>');
        $plots.append($palette);
        $palette.append(HTML.parse(`<div id="${paletteId}">${_('Color palette')}</div>`));
        this.$paletteList = HTML.parse(`<select aria-labelledby="${paletteId}"><optgroup label="${_('qualitative')}"><option value="jmv">jmv</option><option value="Dark2">${_('Dark2')}</option><option value="Set1">${_('Set1')}</option><option value="Accent">${_('Accent')}</option><option value="spss">${_('I ♥ SPSS')}</option><option value="hadley">${_('Hadley')}</option></optgroup><optgroup label="${_('sequential')}"><option value="Greys">${_('Greys')}</option><option value="Blues">${_('Blues')}</option><option value="Greens">${_('Greens')}</option></optgroup></select>`);
        $palette.append(this.$paletteList);
        this.$paletteList.addEventListener('click', event => event.stopPropagation())
        this.$paletteList.addEventListener('change', event => this._changePalette(event.target.value));

        $content.append(HTML.parse('<div class="jmv-ribbon-appmenu-separator"></div>'));

        let importId = focusLoop.getNextAriaElementId('label');
        let $import = HTML.parse(`<div class="jmv-results" role="group" aria-labelledby="${importId}"></div>`);
        $content.append($import);
        $import.append(HTML.parse(`<div id="${importId}" class="jmv-ribbon-appmenu-subheading">${_('Import')}</div>`));

        let $missings = HTML.parse(`<label class="jmv-ribbon-appmenu-item"><div>${_('Default missings')}</div></label>`);
        $import.append($missings);
        this.$missingsInput = HTML.parse('<input type="text" spellcheck="false" size="10" class="jmv-import-missings" list="missings">');
        $missings.append(this.$missingsInput);
        this.$missingsInput.addEventListener('keydown', (event) => {
            if (event.keyCode === 13)
                setTimeout(() => this.$missingsInput.blur());
        });
        this.$missingsInput.addEventListener('blur', () => { this._changeMissings(); });

        // this.$embed = HTML.parse('<label class="jmv-ribbon-appmenu-item"><div>Embed raw data</div></label>').appendTo($import);
        // this.$embedList = HTML.parse('<select><option value="never">Never</option><option value="< 1 Mb">&lt; 1 Mb</option><option value="< 10 Mb">&lt; 10 Mb</option><option value="< 100 Mb">&lt; 100 Mb</option><option value="always">Always</option></select>')
        //     .appendTo(this.$embed)
        //     .on('change', (event) => this.model.settings().setSetting('embedCond', event.target.value));
        $content.append(HTML.parse('<div class="jmv-ribbon-appmenu-separator"></div>'));

        let languageId = focusLoop.getNextAriaElementId('label');
        let $language = HTML.parse('<div class="jmv-language-selector jmv-ribbon-appmenu-item"></div>');
        $content.append($language);
        $language.append(HTML.parse(`<div id="${languageId}">${_('Language')}</div>`));
        this.$languageList = HTML.parse(`<select aria-labelledby="${languageId}"></select>`)
        $language.append(this.$languageList)
        this.$languageList.addEventListener('click', event => event.stopPropagation())
        this.$languageList.addEventListener('change', event => this._changeLanguage());

        let $dev = HTML.parse('<label class="jmv-ribbon-appmenu-item checkbox jmv-devmode" for="devMode"></label>');
        $content.append($dev);
        $dev.append(HTML.parse(`<div>${_('Developer mode')}</div>`));
        this.$devModeCheck = HTML.parse('<input class="jmv-ribbon-appmenu-checkbox" type="checkbox" id="devMode">');
        $dev.append(this.$devModeCheck);

        $zoomIn.addEventListener('click', event => { this.model.settings().zoomIn(); event.stopPropagation(); });
        $zoomOut.addEventListener('click', event => { this.model.settings().zoomOut(); event.stopPropagation(); });

        host.on('zoom', event => {
            let z = '' + parseInt(event.zoom * 100) + '%';
            this.$zoomLevel.innerText = z;
        });

        $menu.append(HTML.parse('<div class="jmv-ribbon-appmenu-spacer"></div>'));
        let $version = HTML.parse('<div class="jmv-ribbon-appmenu-version"></div>');
        $menu.append($version);

        host.version.then(version => {
            $version.innerText = _('Version {v}', { v: version });
        });

        $syntaxModeCheck.addEventListener('change', event => this.model.settings().setSetting('syntaxMode', $syntaxModeCheck.checked));
        this.$devModeCheck.addEventListener('change', event => {
            this.model.settings().setSetting('devMode', this.$devModeCheck.checked);
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


        this.$languageList.innerHTML = available.join('');

        this._updateUI();
    }

    _changeTheme(name) {
        this.model.settings().setSetting('theme', name);
        if (name === 'iheartspss')
            this.model.settings().setSetting('palette', 'spss');
        else if (name === 'bw')
            this.model.settings().setSetting('palette', 'Greys');
    }

    _changePalette(name) {
        this.model.settings().setSetting('palette', name);
    }

    _changeMissings() {
        let missings = this.$missingsInput.value.trim();
        this.model.settings().setSetting('missings', missings);
    }

    _changeResultsFormat() {

        let nfs = this.$nFormatList.value;
        let pfs = this.$pFormatList.value;

        let nfm = nfs.match(/(sf|dp):([0-9]+)/);
        let pfm = pfs.match(/(sf|dp):([0-9]+)/);
        let fmt = {
            t: nfm[1],
            n: parseInt(nfm[2]),
            pt: pfm[1],
            p: parseInt(pfm[2]) };

        let value = JSON.stringify(fmt);
        this.model.settings().setSetting('format', value);
    }

    _changeLanguage() {
        let language = this.$languageList.value;
        this.model.settings().setSetting('selectedLanguage', language);
        host.showMessageBox({
            title: _('Restart required'),
            message: _('A change of language requires jamovi to be restarted'),
        });
    }

    _changeRefsMode() {
        this.model.settings().setSetting('refsMode', this.$refsModeList.value);
    }

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

        this.$nFormatList.value = nf;
        this.$pFormatList.value = pf;

        let refsMode = settings.getSetting('refsMode', 'bottom');
        this.$refsModeList.value = refsMode;

        let theme = settings.getSetting('theme', 'default');
        this.$themeList.value = theme;
        let palette = settings.getSetting('palette', 'jmv');
        this.$paletteList.value = palette;
        let devMode = settings.getSetting('devMode', false);
        this.$devModeCheck.checked = devMode;
        let zoom = '' + settings.getSetting('zoom', 100) + '%';
        this.$zoomLevel.innerText = zoom;
        let missings = settings.getSetting('missings', 'NA');
        this.$missingsInput.value = missings;

        let language = settings.getSetting('selectedLanguage', '');
        this.$languageList.value = language;

        for (let key in this.$versionInfoStatus) {
            let $item = this.$versionInfoStatus[key];
            if (key === status)
                $item.show();
            else
                $item.hide();
        }
    }

    toggleMenu(fromMouse=false) {
        if (this.menuVisible)
            this.hide(fromMouse);
        else
            this.show(fromMouse);
    }

    show(fromMouse) {
        if (this.menuVisible)
            return;
        this.menuVisible = true;
        this.$menuPanel.classList.add('activated');
        setTimeout(() => {
            focusLoop.enterFocusLoop(this.$menuPanel, { withMouse: fromMouse });
        }, 200);
    }

    hide(fromMouse) {
        if ( ! this.menuVisible)
            return;
        this.menuVisible = false;
        this.$menuPanel.classList.remove('activated');
        let event = new CustomEvent('hidden');
        this.dispatchEvent(event);
    }
}

export default AppMenuButton;

customElements.define('jmv-appmenu', AppMenuButton);
