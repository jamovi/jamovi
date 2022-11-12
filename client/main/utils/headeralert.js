
'use strict';

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
        this._text.innerText = _('Your web browser prevented jamovi from opening a data set');

        this._explain = document.createElement('div');
        this._explain.id = 'explanation';
        this._explain.innerText = _('(This is a quirk of Safari and iPads)');

        this._content.appendChild(this._text);
        this._content.appendChild(this._button);
        this._content.appendChild(this._explain);
    }

    notify(event) {
        this._url = event.url;
        if (this._timeoutId)
            clearTimeout(this._timeoutId);
        this._timeoutId = setTimeout(() => this.hide(), 20000);
        this._host.classList.add('visible');
    }

    open() {
        window.open(this._url, '_blank');
        this.hide();
        if (this._timeoutId)
            clearTimeout(this._timeoutId);
    }

    hide() {
        this._host.classList.remove('visible');
    }

    _css() {
        return `
            :host {
                display: block ;
                width: 100% ;
                background-color: orange ;
                border-bottom: 1px solid #333333 ;
                overflow: hidden ;
                
                height: 0px ;

                /* no transition when hiding, because after opening a
                   new tab, the hide transition is delayed until the
                   user navigates back to the tab ... (so you see it
                   transitioning away even though you haven't interacted
                   with that tab for some time */
                transition: unset ;
            }

            :host(.visible) {
                height: 40px ;
                transition: all .1s ;
            }

            #content {
                padding: 8px ;
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
