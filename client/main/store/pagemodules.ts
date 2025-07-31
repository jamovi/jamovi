//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import $ from 'jquery';
import Markjs from 'mark.js';
import Backbone from 'backbone';
Backbone.$ = $;

import Notify from '../notification';
import Version from '../utils/version';
import ProgressStream from '../utils/progressstream';
import _focusLoop from '../../common/focusloop';
import selectionLoop from '../../common/selectionloop';


const PageModules = Backbone.View.extend({
    className: 'PageModules',
    initialize: function() {

        this.modules = this.model.modules;
        this.settings = this.model.settings;

        this.settings.on('change:permissions_library_show_hide', () => this._triggerRefresh());
        this.settings.on('change:permissions_library_add_remove', () => this._triggerRefresh());

        this.$el.addClass('jmv-store-page-installed');

        this.$el.attr('role', 'tabpanel');

        this.marker = new Markjs(this.$el[0]);

        this._moduleEnter = this._moduleEnter.bind(this);
        this._moduleLeave = this._moduleLeave.bind(this);
        this._moduleKeyDown = this._moduleKeyDown.bind(this);

        this.$message    = $('<div class="jmv-store-message"><div class="icon"></div><div class="text"></div></div>').appendTo(this.$el);

        let $searchBox = $('<div class="store-page-searchbox"><div class="search-icon"></div></div>').appendTo(this.$el);
        let searchAriaLabel = this.$el.hasClass('jmv-store-page-store') ? _('Search available modules') : _('Search installed modules');
        this.$search    = $(`<input class="search-text" type="text" spellcheck="true" placeholder="${_('Search')}" aria-label="${searchAriaLabel}"></input>`).appendTo($searchBox);
        this.$body    = $('<div class="jmv-store-body"></div>').appendTo(this.$el);
        this.$content = $(`<div class="jmv-store-content" aria-label="${_('Modules')}"></div>`).appendTo(this.$body);
        this.$loading = $('<div class="jmv-store-loading"></div>').appendTo(this.$body);
        let progressLabelId = _focusLoop.getNextAriaElementId('label');
        this.$installing = $(`<div class="jmv-store-installing" role="progressbar" aria-labelledby="${progressLabelId}" aria-valuenow="0"><h2 id="${progressLabelId}">Installing</h2><div class="jmv-store-progress"><div class="jmv-store-progress-bar"></div></div><div class="jmv-store-installing-description">Installing module</div><!--button class="jmv-store-cancel">Cancel</button--></div>`).appendTo(this.$body);
        this.$error   = $('<div class="jmv-store-error" aria-hidden="true" style="display:none;"><h2 class="jmv-store-error-message"></h2><div class="jmv-store-error-cause"></div><button class="jmv-store-error-retry">Retry</button></div>').appendTo(this.$body);

        this.moduleSelection = new selectionLoop('modules', this.$content[0], true);

        this.$content.on('focus', (event) => {
            let visibleItems = this.$content.find('.jmv-store-module:not(.hide-module)');
            if (visibleItems.length > 0)
                this.moduleSelection.highlightElement(visibleItems[0]);
        })

        this.$errorMessage = this.$error.find('.jmv-store-error-message');
        this.$errorCause   = this.$error.find('.jmv-store-error-cause');
        this.$errorRetry   = this.$error.find('.jmv-store-error-retry');

        this.$progressbar = this.$installing.find('.jmv-store-progress-bar');

        this.modules.on('change:modules', this._triggerRefresh, this);
        this.modules.on('moduleVisibilityChanged', this._triggerRefresh, this);

        this.$modules = $();
        this.$uninstall = $();
        this.$install = $();
        this.$visibility = $();

        this.$search.on('input', (event) => {
            if (this.searchingInProgress)
                clearTimeout(this.searchingInProgress);

            this.searchingInProgress = setTimeout(() => {
                this.markHTML();
                this.searchingInProgress = null;
            }, 600);
        });

        this.$search.on('focus', (event) => {
            this.$search.select();
        });

        this.modules.on('change:status', () => {
            this.$el.attr('data-status', this.modules.attributes.status);
        });

        this.modules.on('change:error', () => {
            let error = this.modules.attributes.error;

            if (error) {
                this.$error.attr('aria-hidden', 'false');
                this.$error[0].style.display = '';

                _focusLoop.speakMessage(_('Library error'));
                _focusLoop.speakMessage(error.cause);
                _focusLoop.speakMessage(error.message);

                this.$errorMessage.text(error.message);
                this.$errorCause.text(error.cause);
            }
            else {
                this.$error.attr('aria-hidden', 'true');
                this.$error[0].style.display = 'none';
            }
        });

        this.modules.on('change:progress', () => {
            let progress = this.modules.attributes.progress;
            let pc = parseInt(100 * progress[0] / progress[1]);
            this.$installing.attr('aria-valuenow', pc);
            this.$progressbar.css('width', '' + pc + '%');
        });

        this.modules.on('change:message', () => {
            this._updateMessage();
        });

        this.$errorRetry.on('click', () => {
            this.modules.retrieve();
    });

        this._events = new ProgressStream();

        (async () => {
            // event dispatcher
            for await (let event of this._events) {
                if (event.type === 'refresh')
                    await this._refresh();
            }
        })();

        this._triggerRefresh();
    },
    _triggerRefresh() {
        this._events.setProgress({ type: 'refresh' });
    },
    stopListening() {
        // technically not necessary, because this is never remove()d
        this._events.resolve();
        Backbone.View.prototype.stopListening(this, arguments);
    },
    _updateMessage() {
        let message = this.modules.attributes.message;
        if ( ! message) {
            let addRemove = this.settings.getSetting('permissions_library_add_remove');
            if (addRemove === false)
                message = _('Installing modules is not available on your plan');
        }

        if (message) {
            let $text = this.$message.find('.text');
            $text.text(message);
            this.$message.addClass('show');
        }
        else {
            this.$message.removeClass('show');
        }
    },

    markHTML() {
        let searchValue = this.$search.val().toLowerCase().trim();
        this.marker.unmark({
            done: () => {
                if (searchValue != '') {
                    this.$el.find('.jmv-store-module').addClass('hide-module');
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
                else
                    this.$el.find('.jmv-store-module').removeClass('hide-module');
            }
        });
    },

    async _refresh() {

        this.$uninstall.off();
        this.$visibility.off();
        this.$install.off();

        let scrollTop = this.$body.scrollTop();

        this.$content.find('.jmv-store-module').addClass('to-be-removed');

        this._updateMessage();

        let addRemove = this.settings.getSetting('permissions_library_add_remove', false);
        let showHide = this.settings.getSetting('permissions_library_show_hide', false);

        for (let module of this.modules) {

            let translator = await module.getTranslator();

            let version = Version.stringify(module.version, 3);

            let moduleLabel = translator(module.title);
            // This regex is used to trim off any leading shortname (as well as seperators) from the title
            // E.G The module title 'GAMLj - General Analyses for Linear Models' will be trimmed to 'General Analyses for Linear Models'.
            let re = new RegExp('^' + module.name + '([ :-]{1,3})', 'i');
            moduleLabel = moduleLabel.replace(re, '');
            if (module.name !== module.title)
                moduleLabel = `${ module.name } - ${ moduleLabel }`;

            let labelId = _focusLoop.getNextAriaElementId('label');

            let html = `
                <div class="jmv-store-module modules-list-item modules-auto-select" data-name="${ module.name }" tabindex="-1" aria-labelledby="${labelId}" role="listitem">
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
                        data-path="${ module.path }",
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


            let $module = this.$content.find(`.jmv-store-module[data-name=${ module.name }]`);
            if ($module.length === 0) {
                $module = $(html);
                $module.appendTo(this.$content);
            }
            else {
                $module.off('keyup', this._moduleEnter);
                $module.off('keydown', this._moduleKeyDown);
                $module.removeClass('to-be-removed');
                $module[0].outerHTML = html;
            }
            $module = this.$content.find(`.jmv-store-module[data-name=${ module.name }]`); 
            $module.on('keydown', this._moduleKeyDown);
            $module.on('keyup', this._moduleEnter);  // must be key up otherwise the internal buttons are clicked on key up after focus is moved

            $module.find('a').attr('tabindex', '-1');
        }

        this.$content.find('.to-be-removed').remove();

        this.markHTML();

        this.$uninstall = this.$content.find('.jmv-store-module-button[data-op="remove"]');
        this.$install = this.$content.find('.jmv-store-module-button[data-op="install"], .jmv-store-module-button[data-op="update"]');
        this.$visibility = this.$content.find('.jmv-store-module-button[data-op="show"], .jmv-store-module-button[data-op="hide"]');
        this.$modules   = this.$content.children();

        this.$uninstall.on('click', event => this._uninstallClicked(event));
        this.$install.on('click', event => this._installClicked(event));
        this.$visibility.on('click', event => this._visibilityClicked(event));

        this.$content.focus();
        this.$body.scrollTop(scrollTop);

    },
    _moduleLeave(event) {
        if (!event.currentTarget.contains(event.relatedTarget)) {
            $(event.target).find('[tabindex]').attr('tabindex', '-1');
            event.target.removeEventListener('focusout', this._moduleLeave);
        }
        
    },
    _moduleEnter(event) {
        if (event.keyCode === 13) {
            if (event.currentTarget === event.target) {
                event.target.addEventListener('focusout', this._moduleLeave);
                let $buttons = $(event.target).find('[tabindex]');
                $buttons.attr('tabindex', '0');
                $buttons[0].focus();
            }
            event.stopPropagation();
        }
        
    },
    _moduleKeyDown(event) {
        if (event.keyCode === 13) {
            event.stopPropagation();
        }
    },
    _installClicked(event) {
        let $target = $(event.target);
        let path = $target.attr('data-path');
        let name = $target.attr('data-name');
        this._install(path, name);
    },
    _visibilityClicked(event) {
        let $target = $(event.target);
        let name = $target.attr('data-name');
        this.modules.toggleModuleVisibility(name);
    },
    _install(path, name) {
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
    },
    _uninstallClicked(event) {
        let $target = $(event.target);
        let moduleName = $target.attr('data-name');
        let response = window.confirm(_('Really uninstall {m}?', {m:moduleName}), _('Confirm uninstall'));
        if (response)
            this._uninstall(moduleName);
    },
    _uninstall(moduleName) {
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
    },
    _notify(note) {
        this.trigger('notification', new Notify(note));
    }
});

export default PageModules;
