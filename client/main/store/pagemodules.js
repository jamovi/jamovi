//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const $ = require('jquery');
const Markjs = require('mark.js');
const Backbone = require('backbone');
Backbone.$ = $;

const Notify = require('../notification');
const Version = require('../utils/version');
const ProgressStream = require('../utils/progressstream');


const PageModules = Backbone.View.extend({
    className: 'PageModules',
    initialize: function() {

        this.modules = this.model.modules;
        this.settings = this.model.settings;

        this.settings.on('change:permissions_library_show_hide', () => this._triggerRefresh());
        this.settings.on('change:permissions_library_add_remove', () => this._triggerRefresh());

        this.$el.addClass('jmv-store-page-installed');

        this.marker = new Markjs(this.$el[0]);

        this.$message    = $('<div class="jmv-store-message"><div class="icon"></div><div class="text"></div></div>').appendTo(this.$el);

        let $searchBox = $('<div class="store-page-searchbox"><div class="search-icon"></div></div>').appendTo(this.$el);
        this.$search    = $(`<input class="search-text" type="textbox" placeholder="${_('Search')}"></input>`).appendTo($searchBox);
        this.$body    = $('<div class="jmv-store-body"></div>').appendTo(this.$el);
        this.$content = $('<div class="jmv-store-content"></div>').appendTo(this.$body);
        this.$loading = $('<div class="jmv-store-loading"></div>').appendTo(this.$body);
        this.$installing = $('<div class="jmv-store-installing"><h2>Installing</h2><div class="jmv-store-progress"><div class="jmv-store-progress-bar"></div></div><div class="jmv-store-installing-description">Installing module</div><!--button class="jmv-store-cancel">Cancel</button--></div>').appendTo(this.$body);
        this.$error   = $('<div class="jmv-store-error"><h2 class="jmv-store-error-message"></h2><div class="jmv-store-error-cause"></div><button class="jmv-store-error-retry">Retry</button></div>').appendTo(this.$body);

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
            if ( ! this.searchTimer) {
                clearTimeout(this.searchTimer);
                this.searchTimer = setTimeout(() => {
                    this.searchTimer = null;
                    this.markHTML();
                }, 1000);
            }
        });

        this.$search.on('focus', (event) => {
            this.$search.select();
        });

        this.modules.on('change:status', () => {
            this.$el.attr('data-status', this.modules.attributes.status);
        });

        this.modules.on('change:error', () => {
            this.$errorMessage.text(this.modules.attributes.error.message);
            this.$errorCause.text(this.modules.attributes.error.cause);
        });

        this.modules.on('change:progress', () => {
            let progress = this.modules.attributes.progress;
            let pc = parseInt(100 * progress[0] / progress[1]);
            this.$progressbar.css('width', '' + pc + '%');
        });

        this.modules.on('change:message', () => {
            this._updateMessage();
        });

        this.$errorRetry.on('click', () => this.modules.retrieve());

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

        this.$content.find('.jmv-store-module').addClass('to-be-removed');

        this._updateMessage();

        let addRemove = this.settings.getSetting('permissions_library_add_remove', false);
        let showHide = this.settings.getSetting('permissions_library_show_hide', false);

        for (let module of this.modules) {

            let translator = await module.getTranslator();

            let version = Version.stringify(module.version, 3);

            let label = translator(module.title);
            // This regex is used to trim off any leading shortname (as well as seperators) from the title
            // E.G The module title 'GAMLj - General Analyses for Linear Models' will be trimmed to 'General Analyses for Linear Models'.
            let re = new RegExp('^' + module.name + '([ :-]{1,3})', 'i');
            label = label.replace(re, '');
            if (module.name !== module.title)
                label = `${ module.name } - ${ label }`;

            let html = `
                <div class="jmv-store-module" data-name="${ module.name }">
                    <div class="jmv-store-module-lhs">
                        <div class="jmv-store-module-icon"></div>
                    </div>
                    <div class="jmv-store-module-rhs">
                        <h2 class="mark-search">${ label }<span class="version">${ version }</span></h2>
                        <div class="authors">${module.authors.join(', ')}</div>
                        <div class="description">${module.description}</div>`;

            for (let op of module.ops) {
                let disabled = (op === 'installed' || op === 'old' || op === 'incompatible');
                let label = '';
                switch(op) {
                    case 'remove':
                        if ( ! addRemove)
                            continue;
                        label = _('Remove');
                    break;
                    case 'install':
                        if ( ! addRemove)
                            continue;
                        label = _('Install');
                    break;
                    case 'installed':
                        label = _('Installed');
                    break;
                    case 'unavailable':
                        label = _('Unavailable');
                    break;
                    case 'update':
                        if ( ! addRemove)
                            continue;
                        label = _('Update');
                    break;
                    case 'old':
                        label = _('Requires a newer version of jamovi');
                    break;
                    case 'incompatible':
                        label = _('Installed version is incompatible');
                    break;
                    case 'show':
                        if ( ! showHide)
                            continue;
                        label = _('Show');
                    break;
                    case 'hide':
                        if ( ! showHide)
                            continue;
                        label = _('Hide');
                    break;
                }

                html += `
                    <button
                        ${ disabled ? 'disabled' : '' }
                        data-path="${ module.path }",
                        data-name="${ module.name }"
                        data-op="${ op }"
                        class="jmv-store-module-button"
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
                $module.removeClass('to-be-removed');
                $module[0].outerHTML = html;
            }
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

    },
    _installClicked(event) {
        let $target = $(event.target);
        let path = $target.attr('data-path');
        this._install(path);
    },
    _visibilityClicked(event) {
        let $target = $(event.target);
        let name = $target.attr('data-name');
        this.modules.toggleModuleVisibility(name);
    },
    _install(path) {
        return this.modules.install(path)
            .then(() => {
                this._notify({
                    title: _('Module installed'),
                    message: _('Module was installed successfully'),
                    duration: 3000,
                    type: 'success'
                });
            }, error => {
                this._notify({
                    title: _('Unable to install module'),
                    message: error.cause,
                    duration: 4000,
                    type: 'error'
                 });
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
            }, error => {
                this._notify({
                    title: _('Unable to uninstall module'),
                    message: error.message,
                    duration: 4000,
                    type: 'error'
                });
            });
    },
    _notify(note) {
        this.trigger('notification', new Notify(note));
    }
});

module.exports = PageModules;
