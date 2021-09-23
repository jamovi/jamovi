
'use strict';

const host = require('./host');
const keyboardJS = require('keyboardjs');


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
                        <div class="heading">
                            <div class="icon"></div>
                            <div class="title">${_('Hi')}</div>
                        </div>
                        <div class="content"></div>
                        <div class="button-box"><button>${_('OK')}</button></div>
                    </slot>
                </div>
                <div class="remote" style="display: none">
                </div>
                <div class="cancel">
                </div>
                <div class="indicator"></div>
            </div>`;

        this._body = this._root.querySelector('.body');
        this._local = this._body.querySelector('.local');
        this._remote = this._body.querySelector('.remote');
        this._heading = this._body.querySelector('.heading .title');
        this._content = this._body.querySelector('.content');
        this._button = this._body.querySelector('.button-box button');
        this._cancel = this._body.querySelector('.cancel');
        this._indicator = this._body.querySelector('.indicator');

        this._cancel.addEventListener('click', () => this.hide());
        this._host.addEventListener('click', (event) => this._backgroundClicked(event));
        this._host.addEventListener('keydown', (event) => this._onKeyDown(event));

        this._button.addEventListener('click', () => this.clicked());
        window.addEventListener('message', (event) => this.onMessage(event));
    }

    setup(info, params) {

        if (this._visible
                && info.title === this._displayInfo.title
                && info.message === this._displayInfo.message
                && info.status === this._displayInfo.status
                && info['message-src'] === this._displayInfo['message-src'])
            return;

        if (params === undefined)
            params = { };

        if (this._visible)
            this.hide();

        this._visible = true;
        this._processEnterKey = false;

        this._displayInfo = info;
        let show = true;

        if (info['message-src']) {

            if (params.cancelable === undefined)
                params.cancelable = false;

            this._local.classList.remove('external');
            this._body.classList.add('initial-size');
            this._host.setAttribute('message-src', info['message-src'] || '');
            this._indicator.style.display = null;
        }
        else {
            this._indicator.style.display = 'none';

            if (params.cancelable === undefined)
                params.cancelable = true;

            this._local.classList.add('external');

            if (status.message || info.title) {
                this._host.setAttribute('title', info.title || '');
                this._host.setAttribute('message', info.message || '');
                this._host.setAttribute('status', info.status || '');
                params.cancelable = info.cancelable === undefined ? false : info.cancelable;
                this._processEnterKey = true;
            }
            else if (this._isElement(info)) {
                this.appendChild(info);
            }
            else {
                show = false;
            }
        }

        if (show) {
            keyboardJS.pause('infobox');
            this._host.style.display = null;
            setTimeout(() => {
                this._body.style.opacity = 1;
                this._host.style.opacity = 1;
            }, 10);
        }

        this._cancelable = params.cancelable;

        if (this._cancelable)
            this._cancel.style.display = null;
        else
            this._cancel.style.display = 'none';

    }

    _isElement(item){
      return ( typeof HTMLElement === "object" ? item instanceof HTMLElement : //DOM2
            item && typeof item === "object" && item !== null && item.nodeType === 1 && typeof item.nodeName==="string");
    }

    hide() {
        if (this._visible === false)
            return;

        this._visible = false;
        if (this._isElement(this._displayInfo))
            this.removeChild(this._displayInfo);
        else {
            this._host.setAttribute('title', '');
            this._host.setAttribute('message', '');
            this._host.setAttribute('status', '');
            this._host.setAttribute('message-src', '');
        }
        this._displayInfo = null;

        this.clearCSS();

        this._body.classList.remove('initial-size');

        this._host.style.display = 'none';
        this._host.style.opacity = null;
        this._body.style.opacity = null;
        this._processEnterKey = false;
        keyboardJS.resume('infobox');
    }

    complete() {
        return this._complete;
    }

    _onKeyDown(event) {
        var keypressed = event.keyCode || event.which;
        if (this._processEnterKey && keypressed === 13) { // enter key
            this.clicked();
            event.preventDefault();
            event.stopPropagation();
        }
        else if (keypressed === 27) { // escape key
            if (this._cancelable) {
                this.hide();
                event.preventDefault();
                event.stopPropagation();
            }
        }
    }

    clicked() {

        switch (this._host.getAttribute('status')) {
            case 'terminated':
                this.hide();
                host.closeWindow();
                break;
            case 'disconnected':
                this.hide();
                window.location.reload();
                break;
            default:
                this.hide();
                this._host.parentNode.removeChild(this._host);
                break;
        }
    }

    _backgroundClicked(e) {
        if (this._visible && this._cancelable) {
            if ((e.pageX >= this._body.offsetLeft && e.pageX <= this._body.offsetLeft + this._body.offsetWidth && e.pageY >= this._body.offsetTop && e.pageY <= this._body.offsetTop + this._body.offsetHeight) === false) {
                this.hide();
            }
        }
    }

    onMessage(event) {
        if (this._iframe && event.source === this._iframe.contentWindow) {
            let data = event.data;
            if (data.status === 'complete') {
                this.hide();
                this._resolve();
            }
            if (data.status === 'show') {
                this._indicator.style.display = 'none';
                this._css = data.css;
                for (let style in data.css) {
                    this._body.style[style] = data.css[style];
                }
                this._iframe.contentWindow.focus();
            }
        }
    }

    clearCSS() {
        if (this._css) {
            for (let style in this._css) {
                this._body.style[style] = '';
            }
        }
        this._css = [];
    }

    attributeChangedCallback(name, old, value) {
        this._local.style.display = 'none';
        this._remote.style.display = 'none';

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
            }
        }
        else if (name === 'title' || name === 'message' || name === 'status' || name === undefined) {

            this._local.style.display = null;
            this._remote.style.display = 'none';

            this._heading.textContent = this._host.getAttribute('title');
            this._content.textContent = this._host.getAttribute('message');
            switch (this._host.getAttribute('status')) {
            case 'terminated':
                this._button.textContent = 'Close';
                break;
            case 'disconnected':
                this._button.textContent = 'Refresh';
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
                opacity: 0;
                transition: opacity 0.2s;
            }

            div.body {
                position: relative ;
                max-width: 540px ;
                box-sizing: border-box ;
                background-color: #f9f9f9;
                border: 1px solid #888888 ;
                display: flex ;
                flex-direction: column ;
                justify-content: center ;
                transition: width 1s, height 1s, opacity .2s ;
                opacity: 0;
                overflow: hidden ;
                box-shadow: 0px 0px 10px #777777;
            }

            div.local {
                margin: 20px;
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

            .heading {
                display: flex;
                align-items: center;
            }

            .heading .title {
                font-size: 130%;
                margin-left: 11px;
            }

            .heading .icon {
                height: 30px;
                width: 30px;
                background-repeat: no-repeat;
                background-size: 100%;
                background-position: center;
                background-image: url("data:image/svg+xml,%3Csvg fill='%23eac282' height='30px' viewBox='0 0 24 24' width='30px' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h24v24H0z' fill='none'/%3E%3Cpath d='M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'/%3E%3C/svg%3E");
                margin-right: 10px;
            }

            .content {
                margin-top: 20px;
                line-height: 1.4;
            }

            .button-box {
                display: flex;
                justify-content: center;
                margin-top: 20px;
            }

            .button-box button {
                width: 80px;
                line-height: 25px;
                background-color: #3E6DA9;
                color: white;
                border: 1px solid transparent;
                border-radius: 2px;
            }

            .button-box button:hover {
                background-color: #224a80;
            }

            .cancel {
                position: absolute;
                top: 10px;
                right: 10px;
                width: 18px;
                height: 18px;
                background-repeat: no-repeat;
                background-size: 50%;
                background-position: center;
                background-image: url("data:image/svg+xml, %3Csvg xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns%23' xmlns='http://www.w3.org/2000/svg' height='10' width='10' version='1.1' xmlns:cc='http://creativecommons.org/ns%23' xmlns:dc='http://purl.org/dc/elements/1.1/' viewBox='0 0 10 10'%3E%3Cg transform='translate(0 -1042.4)' stroke='%23777777' stroke-linecap='round' stroke-width='1.2' fill='none'%3E%3Cpath d='m0.48949 1051.9c8.9785-8.9782 9.021-9.0209 9.021-9.0209'/%3E%3Cpath d='m9.5105 1051.9c-8.9785-8.9782-9.021-9.0209-9.021-9.0209'/%3E%3C/g%3E%3C/svg%3E");
            }

            .cancel:hover {
                background-color: #dedede;
            }

            .indicator {
                position: absolute;
                top: 50%;
                left: 50%;
                margin-top: -15px;
                margin-left: -15px;
                width: 30px;
                height: 30px;
                z-index: 100;
                background-repeat: no-repeat;
                background-size: 100%;
                background-position: center;
                background-image: url("data:image/svg+xml,%3C%3Fxml version='1.0' encoding='utf-8'%3F%3E%3Csvg width='32px' height='32px' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='xMidYMid' class='uil-ring'%3E%3Crect x='0' y='0' width='100' height='100' fill='none' class='bk'%3E%3C/rect%3E%3Ccircle cx='50' cy='50' r='40' stroke-dasharray='163.36281798666926 87.9645943005142' stroke='%233e6da9' fill='none' stroke-width='20'%3E%3CanimateTransform attributeName='transform' type='rotate' values='0 50 50;180 50 50;360 50 50;' keyTimes='0;0.5;1' dur='1s' repeatCount='indefinite' begin='0s'%3E%3C/animateTransform%3E%3C/circle%3E%3C/svg%3E");
            }

        `;
    }

}

customElements.define('jmv-infobox', InfoBox);
