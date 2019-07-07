//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const Notify = require('../notification');
const Version = require('../utils/version');

const PageModules = Backbone.View.extend({
    className: 'PageModules',
    initialize: function() {

        this.modules = this.model.modules;
        this.settings = this.model.settings;

        this.$el.addClass('jmv-store-page-installed');

        this.$body    = $('<div class="jmv-store-body"></div>').appendTo(this.$el);
        this.$content = $('<div class="jmv-store-content"></div>').appendTo(this.$body);
        this.$loading = $('<div class="jmv-store-loading"></div>').appendTo(this.$body);
        this.$installing = $('<div class="jmv-store-installing"><h2>Installing</h2><div class="jmv-store-progress"><div class="jmv-store-progress-bar"></div></div><div class="jmv-store-installing-description">Installing module</div><!--button class="jmv-store-cancel">Cancel</button--></div>').appendTo(this.$body);
        this.$error   = $('<div class="jmv-store-error"><h2 class="jmv-store-error-message"></h2><div class="jmv-store-error-cause"></div><button class="jmv-store-error-retry">Retry</button></div>').appendTo(this.$body);

        this.$errorMessage = this.$error.find('.jmv-store-error-message');
        this.$errorCause   = this.$error.find('.jmv-store-error-cause');
        this.$errorRetry   = this.$error.find('.jmv-store-error-retry');

        this.$progressbar = this.$installing.find('.jmv-store-progress-bar');

        this.modules.on('change:modules', this._refresh, this);
        this.modules.on('moduleVisibilityChanged', this._refresh, this);

        this.$modules = $();
        this.$uninstall = $();
        this.$install = $();
        this.$visibility = $();

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

        this.$errorRetry.on('click', () => this.modules.retrieve());

        this._refresh();
    },
    _refresh() {

        this.$modules.off();
        this.$uninstall.off();
        this.$visibility.off();
        this.$install.off();
        this.$content.empty();

        for (let module of this.modules) {

            let version = Version.stringify(module.version, 3);

            let html = '';
            html += '<div class="jmv-store-module" data-name="' + module.name + '">';
            html += '<div class="jmv-store-module-lhs">';
            html += '<div class="jmv-store-module-icon"></div>';
            html += '</div>';
            html += '<div class="jmv-store-module-rhs">';
            html += '    <h2>' + module.title + '<span class="version">' + version + '</span></h2>';
            html += '    <div class="authors">' + module.authors.join(', ') + '</div>';
            html += '    <div class="description">' + module.description + '</div>';

            if (this.settings.getSetting('mode', 'normal') !== 'demo') {
                for (let op of module.ops) {
                    let disabled = (op === 'installed' ? ' disabled' : '');
                    html += '<button' + disabled +' data-path="' + module.path + '", data-name="' + module.name + '" data-op="' + op + '" class="jmv-store-module-button"><span class="label"></span></button>';
                }
            }

            html += '</div>';
            html += '</div>';
            let $module = $(html);
            $module.appendTo(this.$content);
            $module.on('click', event => this._moduleClicked(event));
        }
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
                    title: 'Module installed',
                    message: 'module was installed successfully',
                    duration: 3000,
                    type: 'success'
                });
            }, error => {
                this._notify({
                    title: 'Unable to install module',
                    message: error.cause,
                    duration: 4000,
                    type: 'error'
                 });
            });
    },
    _uninstallClicked(event) {
        let $target = $(event.target);
        let moduleName = $target.attr('data-name');
        let response = window.confirm('Really uninstall ' + moduleName + '?', 'Confirm uninstall');
        if (response)
            this._uninstall(moduleName);
    },
    _uninstall(moduleName) {
        this.modules.uninstall(moduleName)
            .then(ok => {
                this._notify({
                    title: 'Module uninstalled',
                    message: '' + moduleName + ' was uninstalled successfully',
                    duration: 3000,
                    type: 'success'
                });
            }, error => {
                this._notify({
                    title: 'Unable to uninstall module',
                    message: error.message,
                    duration: 4000,
                    type: 'error'
                });
            });
    },
    _notify(note) {
        this.trigger('notification', new Notify(note));
    },
    _moduleClicked(event) {
        let $target = $(event.target);
        let $module = $target.closest(this.$modules);
        this.$modules.removeClass('selected');
        $module.addClass('selected');
    },
});

module.exports = PageModules;
