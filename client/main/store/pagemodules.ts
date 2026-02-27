//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import Markjs from 'mark.js';

import Notify from '../notification';
import Version from '../utils/version';
import ProgressStream from '../utils/progressstream';
import _focusLoop from '../../common/focusloop';
import selectionLoop from '../../common/selectionloop';
import { ModulesBase } from '../modules';
import Settings from '../settings';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

type ModulePageOptions = {
    settings: Settings;
    modules: ModulesBase;
}

class PageModules extends HTMLElement {
    model: ModulePageOptions;
    modules: ModulesBase
    settings: Settings
    marker: Markjs;
    _events: ProgressStream<{type: 'refresh'}, {type: 'refresh'}>;
    $message: HTMLElement;
    $search: HTMLInputElement;
    $body: HTMLElement;
    $content: HTMLElement;
    $error: HTMLElement;

    $uninstall: NodeListOf<HTMLButtonElement>
    $install: NodeListOf<HTMLButtonElement>
    $visibility: NodeListOf<HTMLButtonElement>
    $modules: NodeListOf<HTMLElement>

    searchingInProgress: NodeJS.Timeout;

    constructor(model: ModulePageOptions) {
        super();
        this.model = model;

        this._uninstallClicked = this._uninstallClicked.bind(this);
        this._installClicked = this._installClicked.bind(this);
        this._visibilityClicked = this._visibilityClicked.bind(this);

        this.classList.add('PageModules');
        this.modules = this.model.modules;
        this.settings = this.model.settings;

        this.settings.on('change:permissions_library_show_hide', () => this._triggerRefresh());
        this.settings.on('change:permissions_library_add_remove', () => this._triggerRefresh());

        this.classList.add('jmv-store-page-installed');

        this.setAttribute('role', 'tabpanel');

        this.marker = new Markjs(this);

        this._moduleEnter = this._moduleEnter.bind(this);
        this._moduleLeave = this._moduleLeave.bind(this);
        this._moduleKeyDown = this._moduleKeyDown.bind(this);

        this.$message    = HTML.parse('<div class="jmv-store-message"><div class="icon"></div><div class="text"></div></div>');
        this.append(this.$message);

        let $searchBox = HTML.parse('<div class="store-page-searchbox"><div class="search-icon"></div></div>');
        this.append($searchBox);
        let searchAriaLabel = this.classList.contains('jmv-store-page-store') ? _('Search available modules') : _('Search installed modules');
        this.$search    = HTML.parse(`<input class="search-text" type="text" spellcheck="true" placeholder="${_('Search')}" aria-label="${searchAriaLabel}"></input>`);
        $searchBox.append(this.$search);
        this.$body    = HTML.parse('<div class="jmv-store-body"></div>');
        this.append(this.$body);
        this.$content = HTML.parse(`<div class="jmv-store-content" aria-label="${_('Modules')}"></div>`);
        this.$body.append(this.$content);
        this.$body.append(HTML.parse('<div class="jmv-store-loading"></div>'));
        let progressLabelId = _focusLoop.getNextAriaElementId('label');
        const $installing = HTML.parse(`<div class="jmv-store-installing" role="progressbar" aria-labelledby="${progressLabelId}" aria-valuenow="0"><h2 id="${progressLabelId}">Installing</h2><div class="jmv-store-progress"><div class="jmv-store-progress-bar"></div></div><div class="jmv-store-installing-description">Installing module</div><!--button class="jmv-store-cancel">Cancel</button--></div>`);
        this.$body.append($installing);
        this.$error   = HTML.parse('<div class="jmv-store-error" aria-hidden="true" style="display:none;"><h2 class="jmv-store-error-message"></h2><div class="jmv-store-error-cause"></div><button class="jmv-store-error-retry">Retry</button></div>');
        this.$body.append(this.$error);

        const moduleSelection = new selectionLoop('modules', this.$content);

        this.$content.addEventListener('focus', (event) => {
            let visibleItems = this.$content.querySelectorAll<HTMLElement>('.jmv-store-module:not(.hide-module)');
            if (visibleItems.length > 0)
                moduleSelection.highlightElement(visibleItems[0]);
        })

        const $errorMessage = this.$error.querySelector('.jmv-store-error-message');
        const $errorCause   = this.$error.querySelector('.jmv-store-error-cause');
        const $errorRetry   = this.$error.querySelector('.jmv-store-error-retry');

        const $progressbar = $installing.querySelector<HTMLElement>('.jmv-store-progress-bar');

        this.modules.on('change:modules', this._triggerRefresh, this);
        this.modules.on('moduleVisibilityChanged', this._triggerRefresh, this);

        this.$modules = this.$content.querySelectorAll('.jmv-store-module');

        this.$uninstall = this.$content.querySelectorAll<HTMLButtonElement>('.jmv-store-module-button[data-op="remove"]');
        this.$install = this.$content.querySelectorAll<HTMLButtonElement>('.jmv-store-module-button[data-op="install"], .jmv-store-module-button[data-op="update"]');
        this.$visibility = this.$content.querySelectorAll<HTMLButtonElement>('.jmv-store-module-button[data-op="show"], .jmv-store-module-button[data-op="hide"]');

        this.onSearchValueChanged = this.onSearchValueChanged.bind(this);

        this.$search.addEventListener('input', this.onSearchValueChanged);
        this.$search.addEventListener('change', this.onSearchValueChanged);

        this.$search.addEventListener('focus', (event) => {
            this.$search.select();
        });

        this.modules.on('change:status', () => {
            this.setAttribute('data-status', this.modules.attributes.status);
        });

        this.modules.on('change:error', () => {
            let error = this.modules.attributes.error;

            if (error) {
                this.$error.setAttribute('aria-hidden', 'false');
                this.$error.style.display = '';

                _focusLoop.speakMessage(_('Library error'));
                _focusLoop.speakMessage(error.cause);
                _focusLoop.speakMessage(error.message);

                $errorMessage.textContent = error.message;
                $errorCause.textContent  = error.cause;
            }
            else {
                this.$error.setAttribute('aria-hidden', 'true');
                this.$error.style.display = 'none';
            }
        });

        this.modules.on('change:progress', () => {
            let progress = this.modules.attributes.progress;
            let pc = (100 * progress[0] / progress[1]).toString();
            $installing.setAttribute('aria-valuenow', pc);
            $progressbar.style.width = `${pc}%`;
        });

        this.modules.on('change:message', () => {
            this._updateMessage();
        });

        $errorRetry.addEventListener('click', () => {
            this.modules.retrieve();
    });

        this._events = new ProgressStream<{type: 'refresh'}, {type: 'refresh'}>();

        (async () => {
            // event dispatcher
            for await (let event of this._events) {
                if (event.type === 'refresh')
                    await this._refresh();
            }
        })();

        this._triggerRefresh();
    }

    onSearchValueChanged() {
        if (this.searchingInProgress)
            clearTimeout(this.searchingInProgress);

        this.searchingInProgress = setTimeout(() => {
            this.markHTML();
            this.searchingInProgress = null;
        }, 600);
    }

    search(term: string) : void {
        this.$search.value = term;
    }

    _triggerRefresh() {
        this._events.setProgress({ type: 'refresh' });
    }

    stopListening() {
        // technically not necessary, because this is never remove()d
        this._events.resolve();
        //Backbone.View.prototype.stopListening(this, arguments);
    }

    _updateMessage() {
        let message = this.modules.attributes.message;
        if ( ! message) {
            let addRemove = this.settings.getSetting('permissions_library_add_remove', false);
            if (addRemove === false)
                message = _('Installing modules is not available on your plan');
        }

        if (message) {
            let $text = this.$message.querySelector('.text');
            $text.textContent = message;
            this.$message.classList.add('show');
        }
        else {
            this.$message.classList.remove('show');
        }
    }

    markHTML() {
        let searchType: 'module' | 'plots' | 'general' = 'general';
        let searchValue = this.$search.value.toLowerCase().trim();
        if (searchValue.startsWith('module::')) {
            searchType = 'module';
            searchValue = searchValue.substring(8).trim();
        }
        else if (searchValue.startsWith('plot::')) {
            searchType = 'plots';
            searchValue = searchValue.substring(6).trim();
        }
        
        this.marker.unmark({
            done: () => {
                
                    switch (searchType) {
                        case 'module':
                            if (searchValue != '') {
                                this.querySelectorAll('.jmv-store-module').forEach(el => {el.classList.remove('hide-module')});
                                this.querySelectorAll<HTMLElement>('.jmv-store-module').forEach(el => { 
                                    if (el.dataset['name'].toLowerCase().startsWith(searchValue) === false)
                                        el.classList.add('hide-module') 
                                });
                            }
                            break;
                        case 'plots':
                            this.querySelectorAll('.jmv-store-module').forEach(el => {el.classList.add('hide-module')});
                            this.querySelectorAll<HTMLElement>('.jmv-store-module[data-has-plots="true"]').forEach(el => { 
                                if (el.dataset['name'].toLowerCase().startsWith(searchValue))
                                    el.classList.remove('hide-module') 
                            });
                            break;
                        default:
                            if (searchValue != '') {
                                this.querySelectorAll('.jmv-store-module').forEach(el => { el.classList.add('hide-module') });
                                let regex = new RegExp(`\\b${searchValue}`, 'gi');
                                this.marker.markRegExp(regex, {
                                    each: (element) => {
                                        let parent = element.closest('.jmv-store-module');
                                        if (parent)
                                            parent.classList.remove('hide-module');
                                    },
                                    exclude: ['.jmv-store-module-button']
                                });
                            }
                            else {
                                this.querySelectorAll('.jmv-store-module').forEach(el => {el.classList.remove('hide-module')});
                            }
                            break;
                    }
            }
        });
    }

    async _refresh() {

        this.$uninstall.forEach(el => el.removeEventListener('click', this._uninstallClicked));
        this.$visibility.forEach(el => el.removeEventListener('click', this._visibilityClicked));
        this.$install.forEach(el => el.removeEventListener('click', this._installClicked));

        let scrollTop = this.$body.scrollTop;

        this.$content.querySelectorAll('.jmv-store-module').forEach(el => el.classList.add('to-be-removed'));

        this._updateMessage();

        let addRemove = this.settings.getSetting('permissions_library_add_remove', false);
        let showHide = this.settings.getSetting('permissions_library_show_hide', false);

        for (let module of this.modules) {

            let translator = await module.getTranslator;

            let version = Version.stringify(module.version, 3);

            let moduleLabel = translator(module.title);
            // This regex is used to trim off any leading shortname (as well as seperators) from the title
            // E.G The module title 'GAMLj - General Analyses for Linear Models' will be trimmed to 'General Analyses for Linear Models'.
            let re = new RegExp('^' + module.name + '([ :-]{1,3})', 'i');
            moduleLabel = moduleLabel.replace(re, '');
            if (module.name !== module.title)
                moduleLabel = `${ module.name } - ${ moduleLabel }`;

            let labelId = _focusLoop.getNextAriaElementId('label');

            const hasPlots = module.category === 'plots';

            let html = `
                <div class="jmv-store-module modules-list-item modules-auto-select" data-has-plots="${hasPlots}" data-name="${ module.name }" tabindex="-1" aria-labelledby="${labelId}" role="listitem">
                    <div class="jmv-store-module-lhs">
                        <div class="jmv-store-module-icon"></div>
                    </div>
                    <div class="jmv-store-module-rhs">
                        <h2 id=${labelId} class="mark-search">${ moduleLabel }<span class="version">${ version }</span></h2>
                        <div class="authors">${module.authors.join(', ')}</div>
                        <div class="description">${translator(module.description)}</div>`;

            for (let op of module.ops) {
                let disabled = (op === 'installed' || op === 'old' || op === 'incompatible');
                let label = '';
                let ariaLabel = '';
                switch(op) {
                    case 'remove':
                        if ( ! addRemove)
                            continue;
                        label = _('Remove');
                        ariaLabel = _('Remove module {moduleName}', { moduleName: moduleLabel });
                    break;
                    case 'install':
                        if ( ! addRemove)
                            continue;
                        label = _('Install');
                        ariaLabel = _('Install module {moduleName} version {version}', { moduleName: moduleLabel, version: version });
                    break;
                    case 'installed':
                        label = _('Installed');
                        ariaLabel = _('Module {moduleName} is installed', { moduleName: moduleLabel });
                    break;
                    case 'unavailable':
                        label = _('Unavailable');
                    break;
                    case 'update':
                        if ( ! addRemove)
                            continue;
                        label = _('Update');
                        ariaLabel = _('Update module {moduleName} to version {version}', { moduleName: moduleLabel, version: version });
                    break;
                    case 'old':
                        label = _('Requires a newer version of jamovi');
                    break;
                    case 'incompatible':
                        label = _('Installed version needs to be updated');
                    break;
                    case 'show':
                        if ( ! showHide)
                            continue;
                        label = _('Show');
                        ariaLabel = _('Show module {moduleName} in the Analyses ribbon', { moduleName: moduleLabel });
                    break;
                    case 'hide':
                        if ( ! showHide)
                            continue;
                        label = _('Hide');
                        ariaLabel = _('Hide module {moduleName} from the Analyses ribbon', { moduleName: moduleLabel });
                    break;
                }

                html += `
                    <button
                        ${ disabled ? 'disabled' : '' }
                        data-path="${ (op === 'update' && module.url) ? module.url : module.path }"
                        data-name="${ module.name }"
                        data-op="${ op }"
                        class="jmv-store-module-button"
                        aria-label="${ ariaLabel || moduleLabel }"
                        tabindex="-1"
                    >
                        ${ label }
                    </button>`;
            }

            html += `
                    </div>
                </div>`;


            let $module = this.$content.querySelector(`.jmv-store-module[data-name="${ module.name }"]`);
            if ($module === null) {
                $module = HTML.parse(html);
                this.$content.append($module);
            }
            else {
                $module.removeEventListener('keyup', this._moduleEnter);
                $module.removeEventListener('keydown', this._moduleKeyDown);
                $module.classList.remove('to-be-removed');
                $module.outerHTML = html;
            }
            $module = this.$content.querySelector(`.jmv-store-module[data-name="${ module.name }"]`); 
            $module.addEventListener('keydown', this._moduleKeyDown);
            $module.addEventListener('keyup', this._moduleEnter);  // must be key up otherwise the internal buttons are clicked on key up after focus is moved

            $module.querySelectorAll('a').forEach(el => el.setAttribute('tabindex', '-1'));
        }

        this.$content.querySelectorAll('.to-be-removed').forEach(el => el.remove());

        this.markHTML();

        this.$uninstall = this.$content.querySelectorAll<HTMLButtonElement>('.jmv-store-module-button[data-op="remove"]');
        this.$install = this.$content.querySelectorAll<HTMLButtonElement>('.jmv-store-module-button[data-op="install"], .jmv-store-module-button[data-op="update"]');
        this.$visibility = this.$content.querySelectorAll<HTMLButtonElement>('.jmv-store-module-button[data-op="show"], .jmv-store-module-button[data-op="hide"]');
        this.$modules = this.$content.querySelectorAll('.jmv-store-module');

        this.$uninstall.forEach(el => el.addEventListener('click', this._uninstallClicked));
        this.$install.forEach(el => el.addEventListener('click', this._installClicked));
        this.$visibility.forEach(el => el.addEventListener('click', this._visibilityClicked));

        this.$content.focus();
        this.$body.scrollTop = scrollTop;

    }

    _moduleLeave(event: MouseEvent) {
        if (event.target instanceof HTMLElement && event.currentTarget instanceof HTMLElement) {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
                event.target.querySelectorAll('[tabindex]').forEach(el => el.setAttribute('tabindex', '-1'));
                event.target.removeEventListener('focusout', this._moduleLeave);
            }
        }
    }

    _moduleEnter(event: KeyboardEvent) {
        if (event.target instanceof HTMLElement) {
            if (event.keyCode === 13) {
                if (event.currentTarget === event.target) {
                    event.target.addEventListener('focusout', this._moduleLeave);
                    let $buttons = event.target.querySelectorAll<HTMLButtonElement>('[tabindex]');
                    $buttons.forEach(el => el.setAttribute('tabindex', '0'));
                    $buttons[0].focus();
                }
                event.stopPropagation();
            }
        }
        
    }

    _moduleKeyDown(event) {
        if (event.keyCode === 13) {
            event.stopPropagation();
        }
    }

    _installClicked(event: MouseEvent) {
        if (event.target instanceof HTMLElement) {
            let $target = event.target;
            let path = $target.getAttribute('data-path');
            let name = $target.getAttribute('data-name');
            this._install(path, name);
        }
    }

    _visibilityClicked(event: MouseEvent) {
        if (event.target instanceof HTMLElement) {
            let $target = event.target;
            let name = $target.getAttribute('data-name');
            this.modules.toggleModuleVisibility(name);
        }
    }

    _install(path: string, name: string) {
        _focusLoop.speakMessage(_('Installing {module}', { module: name }));
        return this.modules.install(path)
            .then(() => {
                this._notify({
                    title: _('Module installed'),
                    message: _('{module} was installed successfully', { module: name }),
                    duration: 3000,
                    type: 'success'
                });
                this.$search.focus();
            }, error => {
                this._notify({
                    title: _('Unable to install {module}', { module: name }),
                    message: error.cause,
                    duration: 4000,
                    type: 'error'
                 });
                 this.$search.focus();
            });
    }

    _uninstallClicked(event: MouseEvent) {
        if (event.target instanceof HTMLElement) {
            let $target = event.target;
            let moduleName = $target.getAttribute('data-name');
            let response = window.confirm(_('Really uninstall {m}?', {m:moduleName}));
            if (response)
                this._uninstall(moduleName);
        }
    }

    _uninstall(moduleName: string) {
        this.modules.uninstall(moduleName)
            .then(ok => {
                this._notify({
                    title: _('Module uninstalled'),
                    message: _('{m} was uninstalled successfully', {m: moduleName}),
                    duration: 3000,
                    type: 'success'
                });
                this.$search.focus();
            }, error => {
                this._notify({
                    title: _('Unable to uninstall module'),
                    message: error.message,
                    duration: 4000,
                    type: 'error'
                });
                this.$search.focus();
            });
    }

    _notify(note) {
        this.dispatchEvent(new CustomEvent('notification', { detail: new Notify(note), bubbles: true }));
    }
}

customElements.define('jmv-modules', PageModules);

export default PageModules;
