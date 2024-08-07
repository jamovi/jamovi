
'use strict';

class RefTable {
    constructor() {
        this.table = {};
        this.mode = 'bottom';
        this._listeners = { };
    }

    setup(table, mode) {
        this.table = table;
        this.mode = mode;
        this.dispatchEvent(new CustomEvent('changed'));
    }

    addEventListener(name, callback) {
        if (name in this._listeners)
            this._listeners[name].push(callback);
        else
            this._listeners[name] = [ callback ];
    }

    dispatchEvent(event) {
        let listeners = this._listeners[event.type];
        if (listeners) {
            for (let listener of listeners)
                listener(event);
        }
    }
}

const css = `

    .body {
        text-align: right ;
        font-size: 80% ;
    }

    span.num {
        font-weight: bold ;
        margin-right: 6px ;
    }
`;

class ReferenceNumbers extends HTMLElement {
    constructor() {
        super();

        this._refTable = null;
        this._refs = [ ];

        this._root = this.attachShadow({ mode: 'open' });
        this._root.innerHTML = `
            <style>
                ${ css }
            </style>
            <div class="body">
            </div>
        `;

        this._body = this._root.querySelector('div.body');
    }

    setTable(refTable) {
        this._refTable = refTable;
        this._refTable.addEventListener('changed', () => this.update());
    }

    setRefs(refs) {
        this._refs = refs;
        this.update();
    }

    count() {
        return this._refs.length;
    }

    hasVisibleContent() {
        return this._refs.length > 0 && this._refTable.mode !== 'hidden';
    }

    update() {
        this._body.innerHTML = '';

        if (this._refTable.mode === 'hidden')
            return;
        if ( ! this._refs)
            return;

        for (let ref of this._refs) {
            let number = 0;
            if (ref in this._refTable.table)
                number = this._refTable.table[ref];
            this._body.insertAdjacentHTML('beforeend', `
                <span class="num" aria-label="Reference ${number}">[${ number }]</span>
            `);
        }
    }
}

customElements.define('jmv-reference-numbers', ReferenceNumbers);

module.exports = RefTable;
