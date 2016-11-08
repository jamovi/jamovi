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

const PageSideload = Backbone.View.extend({
    className: 'PageSideload',
    initialize() {

        this.$el.addClass('jmv-store-page-sideload');

        this.$heading = $('<h2>Sideload module</h2>').appendTo(this.$el);

        this.$drop = $('<div class="jmv-store-page-installed-drop"><span class="mif-file-upload"></span></div>')
            .appendTo(this.$el)
            .on('click', event => this._dropClicked());
    },
    _dropClicked(event) {
        if (host.isElectron) {

            const remote = window.require('electron').remote;
            const dialog = remote.dialog;

            let filters = [ { name: 'jamovi modules', extensions: ['jmo']} ];

            dialog.showOpenDialog({
                filters: filters,
                properties: [ 'openFile' ]},
                fileNames => {
                    if ( ! fileNames)
                        return;
                    let path = fileNames[0].replace(/\\/g, '/');
                    this.model.install(path).then(
                        () => this._installSuccess(),
                        error => this._installFailure(error));
            });
        }
    },
    _installSuccess() {
        this.trigger('notification', new Notify({
            title: 'Module installed successfully',
            message: '',
            duration: 3000
        }));
        this.trigger('close');
    },
    _installFailure(error) {
        this.trigger('notification', new Notify({
            message: error.message,
            title: 'Unable to install module',
            duration: 4000
        }));
    },
});

module.exports = PageSideload;
