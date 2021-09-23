//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const host = require('../host');
const Notify = require('../notification');

const PageSideload = Backbone.View.extend({
    className: 'PageSideload',
    initialize() {

        this.$el.addClass('jmv-store-page-sideload');
        this.$body = $('<div class="jmv-store-body"></div>').appendTo(this.$el);
        this.$drop = $('<div class="jmv-store-page-installed-drop"><span class="mif-file-upload"></span></div>')
            .appendTo(this.$body)
            .on('click', event => this._dropClicked());
    },
    async _dropClicked(event) {
        if (host.isElectron) {

            let filters = [ { name: _('jamovi modules'), extensions: ['jmo']} ];
            let result = await host.showOpenDialog({ filters });

            if ( ! result.cancelled) {
                let file = result.files[0];
                try {
                    await this.model.install(file);
                    this._installSuccess();
                }
                catch (e) {
                    this._installFailure(e);
                }
            }
        }
    },
    _installSuccess() {
        this.trigger('notification', new Notify({
            title: _('Module installed successfully'),
            message: '',
            duration: 3000,
            type: 'success'
        }));
        this.trigger('close');
    },
    _installFailure(error) {
        this.trigger('notification', new Notify({
            message: error.message,
            title: _('Unable to install module'),
            duration: 4000,
            type: 'error'
        }));
    },
});

module.exports = PageSideload;
