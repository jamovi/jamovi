
'use strict';

const host = require('./host');


class InfoBox extends HTMLElement {

    static get observedAttributes() {
        return ['title', 'message', 'message-src', 'status'];
    }

    constructor() {
        super();

        this._complete = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });

        this._root = this.attachShadow({ mode: 'open' });
        this._host = this._root.host;

        this._root.innerHTML = `
            <style>
                ${ this._css() }
            </style>
            <div class="body">
                <div class="local">
                    <slot>
                        <h1>Hi,</h1>
                        <div class="content">
                        </div>
                        <button>OK</button>
                    </slot>
                </div>
                <div class="remote" style="display: none">
                </div>
            </div>`;

        this._body = this._root.querySelector('.body');
        this._local = this._body.querySelector('.local');
        this._remote = this._body.querySelector('.remote');
        this._heading = this._body.querySelector('h1');
        this._content = this._body.querySelector('.content');
        this._button = this._body.querySelector('button');

        this._button.addEventListener('click', () => this.clicked());
        window.addEventListener('message', (event) => this.onMessage(event));
    }

    setup(info) {
        this._host.setAttribute('title', info.title || '');
        this._host.setAttribute('message', info.message || '');
        this._host.setAttribute('message-src', info['message-src'] || '');
        this._host.setAttribute('status', info.status || '');
    }

    complete() {
        return this._complete;
    }

    clicked() {
        switch (this._host.getAttribute('status')) {
        case 'terminated':
            host.closeWindow();
            break;
        case 'disconnected':
            window.location.reload();
            break;
        default:
            this._host.parentNode.removeChild(this._host);
            break;
        }
    }

    onMessage(event) {
        if (this._iframe && event.source === this._iframe.contentWindow) {
            let data = event.data;
            if (data.status === 'complete') {
                this._host.style.display = 'none';
                this._resolve();
            }
        }
    }

    attributeChangedCallback(name, old, value) {
        if (name === 'message-src' || name === undefined) {
            let src = this._host.getAttribute('message-src');
            if (src) {
                this._local.style.display = 'none';
                this._remote.style.display = null;

                if (this._iframe)
                    this._remote.removeChild(this._iframe);
                this._iframe = document.createElement('iframe');
                this._iframe.sandbox = 'allow-scripts allow-popups';
                this._remote.appendChild(this._iframe);

                // i could simply assign src to the src attribute
                // of the iframe, but then i can't access the
                // 'contentDocument' of the iframe. so i use a fetch
                // and assign the response to the srcdoc attribute
                // instead:

                fetch(src).then((response) => {
                    return response.text();
                }).then((text) => {
                    this._iframe.setAttribute('srcdoc', text);
                });

                this._iframe.addEventListener('load', (event) => {
                    // let height = this._iframe.contentDocument.body.scrollHeight;
                    // height = Math.min(600, height);
                    let height = 500 ;
                    let width = 450;
                    this._body.style.height = `${ height }px`;
                    this._body.style.width = `${ width }px`;
                }, { once: true });
            }
            else {
                this._local.style.display = null;
                this._remote.style.display = 'none';
            }
        }

        if (name === 'title' || name === 'message'
                || name == 'status' || name === undefined) {

            this._heading.textContent = this._host.getAttribute('title');
            this._content.textContent = this._host.getAttribute('message');
            switch (this._host.getAttribute('status')) {
            case 'terminated':
                this._button.textContent = 'Close';
                break;
            case 'disconnected':
                this._button.textContent = 'Retry';
                break;
            default:
                this._button.textContent = 'OK';
                break;
            }
        }
    }

    _css() {
        return `
            :host {
                position: fixed;
                left: 0 ;
                top: 0 ;
                bottom: 0 ;
                right: 0 ;
                z-index: 300;
                display: flex ;
                align-items: center;
                justify-content: center;
                padding: 24px ;
                color: #333333 ;
                background-color: rgba(0, 0, 0, 0.4) ;
            }

            div.body {
                position: relative ;
                max-width: 540px ;
                box-sizing: border-box ;
                background-color: white ;
                border: 1px solid #888888 ;
                display: flex ;
                flex-direction: column ;
                justify-content: center ;
                transition: all 1s ;
                height: 300px ;
                width: 300px ;
                overflow: hidden ;
            }

            div.local {
                padding: 0 24px 24px ;
                margin-top: 12px ;
            }

            div.remote {
                height: 100% ;
                width: 450px ;
            }

            iframe {
                border: none ;
                width: 100% ;
                height: 100% ;
            }
        `;
    }

}

customElements.define('jmv-infobox', InfoBox);
