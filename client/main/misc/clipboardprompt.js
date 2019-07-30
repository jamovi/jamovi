
'use strict';

class ClipboardPrompt extends HTMLElement {

    constructor() {
        super();

        this._root = this.attachShadow({ mode: 'open' });
        this._host = this._root.host;

        let modifier = (window.navigator === 'MacIntel' ? '&#8984;' : 'Ctrl');

        this._root.innerHTML = `
            <style>
                .content {
                    height: 0 ;
                    overflow: hidden ;
                }
            </style>
            <div>
                <h1>Copy</h1>
                <p>The content has been prepared, and can be copied with the button below, or by pressing <em>${ modifier }+C</em> on your keyboard</p>
                <button class="copy">Copy</button>
                <p><a href="#" target="_blank">Why is this additional step necessary?</a></p>
                <p></p>
                <div contenteditable="true" class="content"></div>
            </div>`;

        this._body = this._root.querySelector('div');
        this._copy = this._body.querySelector('.copy');
        this._textarea = this._body.querySelector('.content');

        this._copy.addEventListener('click', (event) => this._copyClicked());
    }

    copy(content) {
        this._textarea.innerHTML = content;
        this._selectContent();
        return new Promise((resolve, reject) => {
            this._resolve = resolve;
        });
    }

    _selectContent() {
        var selection = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(this._textarea);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    _copyClicked() {
        this._selectContent();
        let success = document.execCommand('copy');
        this._resolve();
    }

}

customElements.define('jmv-clipboardprompt', ClipboardPrompt);
