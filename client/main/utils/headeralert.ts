
'use strict';

import { TimedOut } from '../errors';
import { WindowOpenFailEvent } from '../host';
import { Future } from './common';


export class HeaderAlert extends HTMLElement {

    _root: ShadowRoot;
    _host: Element;
    _url: string;
    _future: Future<unknown>
    _timeoutId: NodeJS.Timeout;

    constructor() {
        super();

        this._url = null;

        this._root = this.attachShadow({ mode: 'open' });
        this._host = this._root.host;

        let style = document.createElement('style');
        style.innerText = this._css();
        this._root.appendChild(style);

        const _content = document.createElement('div');
        _content.id = 'content';
        this._root.appendChild(_content);

        const _button = document.createElement('button');
        _button.id = 'open-button';
        _button.innerText = _('Try again');
        _button.addEventListener('click', (event) => this.open());

        const _text = document.createElement('div');
        _text.id = 'text';
        _text.innerText = _('Your web browser prevented jamovi from opening a new tab');

        const _explain = document.createElement('div');
        _explain.id = 'explanation';
        _explain.innerText = _('(This is a quirk of Safari and iPads)');

        _content.appendChild(_text);
        _content.appendChild(_button);
        _content.appendChild(_explain);
    }

    notify(event: WindowOpenFailEvent) {
        this._url = event.url;
        this._future = event.future;
        if (this._timeoutId)
            clearTimeout(this._timeoutId);
        this._timeoutId = setTimeout(() => this.timeout(), 20000);
        this._host.classList.add('visible');
    }

    open() {
        const win = window.open(this._url, '_blank');
        this._future.resolve(win);
        this._future = null;
        this.hide();
        if (this._timeoutId) {
            clearTimeout(this._timeoutId);
            this._timeoutId = null;
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
export default HeaderAlert;
