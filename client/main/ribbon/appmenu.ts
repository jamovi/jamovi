
'use strict';

import { EventDistributor } from "../../common/eventmap";

import I18ns from '../../common/i18n';
import interactionManager, { type FocusLoop } from '../../common/interactionmanager';
import host from '../host';
import { h }  from '../../common/htmlelementcreator';
import { RibbonModel } from "../ribbon";
import { Theme } from "../settings";

function selectOption(value: string, label: string) {
    return h('option', { value: value }, label);
}

function optGroup(label: string, ...options: HTMLOptionElement[]) {
    return h('optgroup', { label: label }, ...options);
}

function appMenuItem(...children: Array<string | Node>) {
    return h('div', { class: 'jmv-ribbon-appmenu-item' }, ...children);
}

function separator() {
    return h('div', { class: 'jmv-ribbon-appmenu-separator' });
}

export class AppMenuButton extends EventDistributor {

    $menuPanel: HTMLElement;
    menuVisible = false;
    $zoomLevel: HTMLElement;
    $nFormatList: HTMLSelectElement;
    $pFormatList: HTMLSelectElement;
    $refsModeList: HTMLSelectElement;
    $themeList: HTMLSelectElement;
    $paletteList: HTMLSelectElement;
    $decSymbolList: HTMLSelectElement;
    $missingsInput: HTMLInputElement;
    $devModeCheck: HTMLInputElement;
    $languageList: HTMLSelectElement;
    model: RibbonModel;
    loop: FocusLoop;

    constructor(model: RibbonModel) {
        super();

        this.model = model;
        this.classList.add('jmv-ribbon-appmenu');
        this.setAttribute('role', 'button');
        this.setAttribute('tabindex', '0');

        this.addEventListener('keydown', (event) => {
            if (event.target === this && (event.code === 'Enter' || event.code === 'Space'))
                this.toggleMenu(false);
        });

        this.setAttribute('aria-label', _('Preferences'));

        let mode = this.model.settings().getSetting('mode', 'normal');
        this.dataset.mode = mode;

        let $decoration = h('span', { class: 'mif-more-vert', role: 'none' });
        this.append($decoration);
        let $positioner = h('div', { class: 'jmv-ribbon-appmenu-positioner' });
        this.append($positioner);

        let menuId = interactionManager.nextAriaId('menu');
        this.$menuPanel = h('div', { id: menuId, class: 'jmv-ribbon-appmenu-menu-panel', tabindex: '-1', role: 'grid', 'aria-label': 'Application preferences', 'aria-modal': 'true' });
        $positioner.append(this.$menuPanel);

        let $menu = h('div', { class: 'jmv-ribbon-appmenu-menu' });
        this.$menuPanel.append($menu);

        this.loop = interactionManager.registerLoop(this.$menuPanel, { level: 1, exitSelector: '.jmv-ribbon-appmenu' } );
        this.loop.on('deactivate', () => {
            this.hide();
        });

        this.addEventListener('click', event => {
            this.toggleMenu(event.detail > 0);
            event.stopPropagation();
        });

        this.$menuPanel.addEventListener('click', event => {
            event.stopPropagation();
        });

        this.$menuPanel.addEventListener('focusout', (event: FocusEvent) => {
            if (this.isNativeSelectFocusTransition(event))
                return;

            if (event.relatedTarget == null || (event.relatedTarget instanceof Node && ! this.$menuPanel.contains(event.relatedTarget)))
                this.hide(false);
        });

        let $header = h('div', { class: 'jmv-ribbon-appmenu-header', role: 'none' });
        $menu.append($header);
        $header.append(h('div', { class: 'jmv-ribbon-appmenu-icon', role: 'none' }));
        let $backOuter = h('div', { class: 'jmv-ribbon-appmenu-back', role: 'none' });
        $header.append($backOuter);
        let $back = h('button', { class: 'jmv-ribbon-appmenu-back-button', 'aria-label': _('Close preferences') });
        $backOuter.append($back);
        $back.append(h('div'));

        $back.addEventListener('click', event => {
            this.loop.deactivate({ source: event.detail > 0 ? 'mouse' : 'programmatic' });
            event.stopPropagation();
        });

        let $content = h('div', { class: 'jmv-ribbon-appmenu-content', role: 'none' });
        $menu.append($content);

        let zoomId = interactionManager.nextAriaId('label');
        let $zoom = h('div', { class: 'jmv-ribbon-appmenu-item jmv-zoom' });
        $content.append($zoom);
        $zoom.append(h('div', { id: zoomId }, _('Zoom')));
        let $zoomButtons = h('div', { class: 'jmv-ribbon-appmenu-zoom-buttons' });
        $zoom.append($zoomButtons);
        let $zoomOut = h('button', { class: 'jmv-ribbon-appmenu-zoomout', 'aria-label': _('Zoom out') }, '-');
        $zoomButtons.append($zoomOut);
        this.$zoomLevel = h('div', { class: 'jmv-ribbon-appmenu-zoomlevel' }, '100%');
        $zoomButtons.append(this.$zoomLevel);
        let $zoomIn = h('button', { class: 'jmv-ribbon-appmenu-zoomin', 'aria-label': _('Zoom in') }, '+');
        $zoomButtons.append($zoomIn);

        $content.append(separator());

        let resultsId = interactionManager.nextAriaId('label');
        let $results = h('div', { class: 'jmv-results', role: 'group', 'aria-labelledby': resultsId });
        $content.append($results);
        $results.append(h('div', { id: resultsId, class: 'jmv-ribbon-appmenu-subheading' }, _('Results')));

        let nFormatId = interactionManager.nextAriaId('label');
        let $nFormat = appMenuItem();
        $results.append($nFormat);
        $nFormat.append(h('div', { id: nFormatId }, _('Number format')));
        this.$nFormatList = h('select', { 'aria-labelledby': nFormatId },
            optGroup(_('significant figures'),
                selectOption('sf:3', _('{n} sf', { n: '3' })),
                selectOption('sf:4', _('{n} sf', { n: '4' })),
                selectOption('sf:5', _('{n} sf', { n: '5' }))),
            optGroup(_('decimal places'),
                selectOption('dp:2', _('{n} dp', { n: '2' })),
                selectOption('dp:3', _('{n} dp', { n: '3' })),
                selectOption('dp:4', _('{n} dp', { n: '4' })),
                selectOption('dp:5', _('{n} dp', { n: '5' })),
                selectOption('dp:16', _('{n} dp', { n: '16' }))));
        $nFormat.append(this.$nFormatList);
        this.$nFormatList.addEventListener('click', event => event.stopPropagation());
        this.$nFormatList.addEventListener('change', event => this._changeResultsFormat());

        let pFormatId = interactionManager.nextAriaId('label');
        let $pFormat = appMenuItem();
        $results.append($pFormat);
        $pFormat.append(h('div', { id: pFormatId }, _('p-value format')));
        this.$pFormatList = h('select', { 'aria-labelledby': pFormatId },
            optGroup(_('significant figures'),
                selectOption('sf:3', _('{n} sf', { n: '3' })),
                selectOption('sf:4', _('{n} sf', { n: '4' })),
                selectOption('sf:5', _('{n} sf', { n: '5' }))),
            optGroup(_('decimal places'),
                selectOption('dp:3', _('{n} dp', { n: '3' })),
                selectOption('dp:4', _('{n} dp', { n: '4' })),
                selectOption('dp:5', _('{n} dp', { n: '5' })),
                selectOption('dp:16', _('{n} dp', { n: '16' }))));
        $pFormat.append(this.$pFormatList);
        this.$pFormatList.addEventListener('click', event => event.stopPropagation())
        this.$pFormatList.addEventListener('change', event => this._changeResultsFormat());

        let decSymbolId = interactionManager.nextAriaId('label');
        let $decSymbol = appMenuItem();
        $results.append($decSymbol);
        $decSymbol.append(h('div', { id: decSymbolId }, _('Decimal symbol')));
        this.$decSymbolList = h('select', { 'aria-labelledby': decSymbolId },
            selectOption('.', _('Dot')),
            selectOption(',', _('Comma')));
        $decSymbol.append(this.$decSymbolList);
        this.$decSymbolList.addEventListener('click', event => event.stopPropagation())
        this.$decSymbolList.addEventListener('change', event => this._changeDecSymbol(event.target.value));

        let refsModeId = interactionManager.nextAriaId('label');
        let $refsMode = appMenuItem();
        $results.append($refsMode);
        $refsMode.append(h('div', { id: refsModeId }, _('References')));
        this.$refsModeList = h('select', { 'aria-labelledby': refsModeId },
            selectOption('bottom', _('Visible')),
            selectOption('hidden', _('Hidden')));
        $refsMode.append(this.$refsModeList);
        this.$refsModeList.addEventListener('click', event => event.stopPropagation())
        this.$refsModeList.addEventListener('change', event => this._changeRefsMode());

        let syntaxId = interactionManager.nextAriaId('label');
        let $syntax = h('label', { class: 'jmv-ribbon-appmenu-item checkbox', for: 'syntaxMode' });
        $results.append($syntax);
        $syntax.append(h('div', { id: syntaxId }, _('Syntax mode')));
        let $syntaxModeCheck = h('input', { 'aria-labelledby': syntaxId, class: 'jmv-ribbon-appmenu-checkbox', type: 'checkbox', id: 'syntaxMode' });
        $syntax.append($syntaxModeCheck);

        $content.append(separator());

        let plotsId = interactionManager.nextAriaId('label');
        let $plots = h('div', { class: 'jmv-results', role: 'group', 'aria-labelledby': plotsId });
        $content.append($plots);
        $plots.append(h('div', { id: plotsId, class: 'jmv-ribbon-appmenu-subheading' }, _('Plots')));


        let themeId = interactionManager.nextAriaId('label');
        let $theme = appMenuItem();
        $plots.append($theme);
        $theme.append(h('div', { id: themeId }, _('Plot theme')));
        this.$themeList = h('select', { 'aria-labelledby': themeId },
            selectOption('default', _('Default')),
            selectOption('minimal', _('Minimal')),
            selectOption('iheartspss', _('I ♥ SPSS')),
            selectOption('hadley', _('Hadley')),
            selectOption('bw', _('Black & white')));
        $theme.append(this.$themeList);
        this.$themeList.addEventListener('click', event => event.stopPropagation())
        this.$themeList.addEventListener('change', event => this._changeTheme(this.$themeList.value));

        let paletteId = interactionManager.nextAriaId('label');
        let $palette = appMenuItem();
        $plots.append($palette);
        $palette.append(h('div', { id: paletteId }, _('Color palette')));
        this.$paletteList = h('select', { 'aria-labelledby': paletteId },
            optGroup(_('qualitative'),
                selectOption('jmv', 'jmv'),
                selectOption('Dark2', _('Dark2')),
                selectOption('Set1', _('Set1')),
                selectOption('Accent', _('Accent')),
                selectOption('spss', _('I ♥ SPSS')),
                selectOption('hadley', _('Hadley'))),
            optGroup(_('sequential'),
                selectOption('Greys', _('Greys')),
                selectOption('Blues', _('Blues')),
                selectOption('Greens', _('Greens'))));
        $palette.append(this.$paletteList);
        this.$paletteList.addEventListener('click', event => event.stopPropagation())
        this.$paletteList.addEventListener('change', event => this._changePalette(this.$paletteList.value));

        $content.append(separator());

        let importId = interactionManager.nextAriaId('label');
        let $import = h('div', { class: 'jmv-results', role: 'group', 'aria-labelledby': importId });
        $content.append($import);
        $import.append(h('div', { id: importId, class: 'jmv-ribbon-appmenu-subheading' }, _('Import')));

        let $missings = h('label', { class: 'jmv-ribbon-appmenu-item' },
            h('div', {}, _('Default missings')));
        $import.append($missings);
        this.$missingsInput = h('input', { type: 'text', spellcheck: 'false', size: '10', class: 'jmv-import-missings', list: 'missings' });
        $missings.append(this.$missingsInput);
        this.$missingsInput.addEventListener('keydown', (event) => {
            if (event.keyCode === 13)
                setTimeout(() => this.$missingsInput.blur());
        });
        this.$missingsInput.addEventListener('blur', () => { this._changeMissings(); });

        $content.append(separator());

        let languageId = interactionManager.nextAriaId('label');
        let $language = h('div', { class: 'jmv-language-selector jmv-ribbon-appmenu-item' });
        $content.append($language);
        $language.append(h('div', { id: languageId }, _('Language')));
        this.$languageList = h('select', { 'aria-labelledby': languageId });
        $language.append(this.$languageList)
        this.$languageList.addEventListener('click', event => event.stopPropagation())
        this.$languageList.addEventListener('change', event => this._changeLanguage());

        let $dev = h('label', { class: 'jmv-ribbon-appmenu-item checkbox jmv-devmode', for: 'devMode' });
        $content.append($dev);
        $dev.append(h('div', {}, _('Developer mode')));
        this.$devModeCheck = h('input', { class: 'jmv-ribbon-appmenu-checkbox', type: 'checkbox', id: 'devMode' });
        $dev.append(this.$devModeCheck);

        $zoomIn.addEventListener('click', event => { this.model.settings().zoomIn(); event.stopPropagation(); });
        $zoomOut.addEventListener('click', event => { this.model.settings().zoomOut(); event.stopPropagation(); });

        host.on('zoom', event => {
            let z = `${Math.floor(event.zoom * 100)}%`;
            this.$zoomLevel.innerText = z;
        });

        $menu.append(h('div', { class: 'jmv-ribbon-appmenu-spacer' }));
        let $version = h('div', { class: 'jmv-ribbon-appmenu-version' });
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
        this.model.settings().on('change:decSymbol',    () => this._updateUI());
        this.model.settings().on('change:devMode',      () => this._updateUI());
        this.model.settings().on('change:zoom',         () => this._updateUI());
        this.model.settings().on('change:format',       () => this._updateUI());
        this.model.settings().on('change:missings',     () => this._updateUI());
        this.model.settings().on('change:refsMode',     () => this._updateUI());
        this.model.settings().on('change:selectedLanguage', () => this._updateUI());

        let availableGroup = optGroup(_('Available'));
        let inDevelopmentGroup = optGroup(_('In development'));
        let currentGroup = availableGroup;
        for (let code of I18ns.get('app').availableLanguages()) {
            if (code === '---') {
                currentGroup = inDevelopmentGroup;
                continue;
            }

            let ownName = I18ns.get('app').getDisplayName(code);
            currentGroup.append(selectOption(code, ownName));
        }

        this.$languageList.replaceChildren(selectOption('', _('System default')), availableGroup);
        if (inDevelopmentGroup.children.length > 0)
            this.$languageList.append(inDevelopmentGroup);

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

    _changeDecSymbol(symbol: '.' | ',') {
        this.model.settings().setSetting('decSymbol', symbol);
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

        let fmtString = settings.getSetting('format', undefined);
        let nf, pf;
        try {
            const fmt = JSON.parse(fmtString);
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

        let theme = settings.getSetting('theme', Theme.DEFAULT);
        this.$themeList.value = theme;
        let palette = settings.getSetting('palette', 'jmv');
        this.$paletteList.value = palette;
        let decSymbol = settings.getSetting('decSymbol', '.');
        this.$decSymbolList.value = decSymbol;
        let devMode = settings.getSetting('devMode', false);
        this.$devModeCheck.checked = devMode;
        let zoom = '' + settings.getSetting('zoom', 100) + '%';
        this.$zoomLevel.innerText = zoom;
        let missings = settings.getSetting('missings', 'NA');
        this.$missingsInput.value = missings;

        let language = settings.getSetting('selectedLanguage', '');
        this.$languageList.value = language;
    }

    private isNativeSelectFocusTransition(event: FocusEvent): boolean {
        return event.target instanceof HTMLSelectElement && event.relatedTarget === null;
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
            this.loop.activate({ withMouse: fromMouse });
        }, 200);
    }

    hide(fromMouse?: boolean) {
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
