//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

import host from '../host';
import { Modules } from '../modules';
import Notify from '../notification';
import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

class PageSideload extends HTMLElement {
    model: Modules;
    $body: HTMLElement;
    $drop: HTMLButtonElement;

    constructor(model: Modules) {
        super();

        this.model = model;
        this.classList.add('PageSideload');
        this.classList.add('jmv-store-page-sideload');
        this.setAttribute('role', 'tabpanel');
        this.$body = HTML.parse('<div class="jmv-store-body"></div>');
        this.append(this.$body);
        this.$drop = HTML.parse<HTMLButtonElement>('<button class="jmv-store-page-installed-drop" tabindex="-1"><span class="mif-file-upload"></span></button>');
        this.$body.append(this.$drop);
        this.$drop.addEventListener('click', event => this._dropClicked());
    }

    async _dropClicked() {
        if (host.isElectron) {

            let filters = [ { name: _('jamovi modules'), extensions: ['jmo']} ];
            let result = await host.showOpenDialog({ filters });

            if ( ! result.cancelled) {
                const path = result.paths[0];
                try {
                    await this.model.install(path);
                    this._installSuccess();
                }
                catch (e) {
                    this._installFailure(e);
                }
            }

            this.$drop.focus();
        }
    }

    _installSuccess() {
        this.dispatchEvent(new CustomEvent('notification', { detail: new Notify({
            title: _('Module installed successfully'),
            message: '',
            duration: 3000,
            type: 'success'
        }), bubbles: true}));
        this.dispatchEvent(new CustomEvent('close'));
    }

    _installFailure(error) {
        this.dispatchEvent(new CustomEvent('notification', { detail: new Notify({
            message: error.message,
            title: _('Unable to install module'),
            duration: 4000,
            type: 'error'
        }), bubbles: true}));
    }
}

customElements.define('jmv-sideload', PageSideload);

export default PageSideload;
