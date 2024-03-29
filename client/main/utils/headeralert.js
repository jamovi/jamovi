
'use strict';

import { TimedOut } from '../errors';


class HeaderAlert extends HTMLElement {

    constructor() {
        super();

        this._url = null;

        this._root = this.attachShadow({ mode: 'open' });
        this._host = this._root.host;

        let style = document.createElement('style');
        style.innerText = this._css();
        this._root.appendChild(style);

        this._content = document.createElement('div');
        this._content.id = 'content';
        this._root.appendChild(this._content);

        this._button = document.createElement('button');
        this._button.id = 'open-button';
        this._button.innerText = _('Try again');
        this._button.addEventListener('click', (event) => this.open());

        this._text = document.createElement('div');
        this._text.id = 'text';
        this._text.innerText = _('Your web browser prevented jamovi from opening a new tab');

        this._explain = document.createElement('div');
        this._explain.id = 'explanation';
        this._explain.innerText = _('(This is a quirk of Safari and iPads)');

        this._content.appendChild(this._text);
        this._content.appendChild(this._button);
        this._content.appendChild(this._explain);
    }

    notify(event) {
        this._url = event.url;
        this._future = event.future;
        if (this._timeoutId)
            clearTimeout(this._timeoutId);
        this._timeoutId = setTimeout(() => this.timeout(), 20000);
        this._host.classList.add('visible');
    }

    open(message) {
        const win = window.open(this._url, '_blank');
        this._future.resolve(win);
        this._future = null;
        this.hide();
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    timeout() {
        if (this._future)
            this._future.reject(new TimedOut());
        this.hide();
    }

    hide() {
        this._host.classList.remove('visible');
    }

    _css() {
        return `
            :host {
                display: none ;
                width: 100% ;
                background-color: orange ;
                overflow: hidden ;

                height: 0px ;
                z-index: 100 ;

                /* no transition when hiding, because after opening a
                   new tab, the hide transition is delayed until the
                   user navigates back to the tab ... (so you see it
                   transitioning away even though you haven't interacted
                   with that tab for some time */
                transition: unset ;
            }

            :host(.visible) {
                display: block ;
                height: 40px ;
                /* border-bottom: 1px solid #333333 ;*/
                transition: all .2s ;
            }

            #content {
                padding: 10px ;
            }

            #text, #explanation {
                display: inline-block ;
            }

            #open-button {
                padding: 4px 12px ;
                margin: auto 12px ;
            }
        `;
    }

}

customElements.define('jmv-headeralert', HeaderAlert);
module.exports = HeaderAlert;
