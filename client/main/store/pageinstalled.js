//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const host = require('../host');
const Notify = require('../notification');

const PageInstalled = Backbone.View.extend({
    className: 'PageInstalled',
    initialize: function() {

        this.$el.addClass('jmv-store-page-installed');

        this.$heading = $('<h2>Installed modules</h2>').appendTo(this.$el);
        this.$body    = $('<div class="body"></div>').appendTo(this.$el);
        this.$content = $('<div class="content"></div>').appendTo(this.$body);

        this.model.on('change:modules', this._refresh, this);
        this.$modules = $();
        this.$uninstall = $();
    },
    _refresh() {

        this.$modules.off();
        this.$uninstall.off();
        this.$content.empty();

        for (let module of this.model) {
            let html = '';
            html += '<div class="jmv-store-page-installed-module" data-name="' + module.name + '">';
            html += '    <h3>' + module.title + '</h3>';
            html += '    <div class="version">' + module.version.major + '.' + module.version.minor + '.' + module.version.revision + '</div>';
            html += '    <div class="description">' + module.description + '</div>';
            html += '    <div class="authors">' + module.authors.join(',') + '</div>';

            if ( ! module.isSystem)
                html += '<button class="uninstall" data-name="' + module.name + '">Uninstall</button>';

            html += '</div>';
            let $module = $(html);
            $module.appendTo(this.$content);
            $module.on('click', event => this._moduleClicked(event));
        }
        this.$uninstall = this.$content.find('.uninstall');
        this.$modules   = this.$content.children();

        this.$uninstall.on('click', event => this._uninstallClicked(event));
    },
    _uninstallClicked(event) {
        let $target = $(event.target);
        let moduleName = $target.attr('data-name');
        let response = window.confirm('Really uninstall ' + moduleName + '?', 'Confirm uninstall');
        if (response)
            this._uninstall(moduleName);
    },
    _uninstall(moduleName) {
        this.model.uninstall(moduleName)
            .then(
                ok => this._notify({
                    message: '' + moduleName + ' was uninstalled successfully',
                    title: 'Module uninstalled',
                    duration: 3000
                }),
                error => this._notify({
                    message: error.message,
                    title: 'Unable to uninstall module',
                    duration: 4000
                })
            );
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

module.exports = PageInstalled;
