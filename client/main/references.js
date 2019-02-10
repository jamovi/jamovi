
'use strict';

class References extends HTMLElement {
    constructor() {
        super();

        this._analyses = null;
        this._refs = [ ];
        this._modules = new Set();
        this._numbers = null;

        this._root = this.attachShadow({ mode: 'open' });

        let style = document.createElement('style');
        style.textContent = this._css();
        this._root.appendChild(style);

        let heading = document.createElement('h1');
        heading.textContent = 'References';

        this._body = document.createElement('div');
        this._body.className += ' body';

        this._root.appendChild(heading);
        this._root.appendChild(this._body);
    }

    setAnalyses(analyses) {
        this._analyses = analyses;
    }

    getNumbers() {
        if (this._numbers)
            return this._numbers;
        let numbers = { jmv: { } };
        for (let module of this._modules)
            numbers[module] = { };
        for (let i = 0; i < this._refs.length; i++) {
            let ref = this._refs[i];
            for (let address of ref.addresses)
                numbers[address.module][address.name] = (i + 1);
        }
        this._numbers = numbers;
        return this._numbers;
    }

    n() {
        return this._refs.length;
    }

    activate() {
        this._root.host.className += ' activated';
    }

    deactivate() {
        this._root.host.className = this._root.host.className.split(' ').filter((x) => x != 'activated').join(' ');
    }

    nSelected() {
        let refElems = [...this._body.querySelectorAll('jmv-reference')];
        let n = refElems.reduce((count, elem) => count + (elem.selected ? 1 : 0), 0);
        return n;
    }

    selectAll() {
        let refElems = this._body.querySelectorAll('jmv-reference');
        for (let elem of refElems)
            elem.select();
    }

    clearSelection() {
        let refElems = this._body.querySelectorAll('jmv-reference');
        for (let elem of refElems)
            elem.unselect();
    }

    asHTML() {
        let noneSelected = (this.nSelected() === 0);
        let pieces = [ ];
        let refElems = this._body.querySelectorAll('jmv-reference');
        for (let elem of refElems) {
            if (noneSelected || elem.selected)
                pieces.push(elem.asHTML());
        }
        return `<p>${ pieces.join('</p><p>') }</p>`;
    }

    asText() {
        let noneSelected = (this.nSelected() === 0);
        let pieces = [ ];
        let refElems = this._body.querySelectorAll('jmv-reference');
        for (let elem of refElems) {
            if (noneSelected || elem.selected)
                pieces.push(elem.asText());
        }
        return pieces.join('\n');
    }

    update() {

        let refs = [ ];
        let modules = new Set();

        refs.push(this.resolve('jmv', {
            name: 'jamovi',
            authors: { complete: 'The jamovi project' },
            year: 2019,
            title: 'jamovi',
            publisher: '(Version 0.9) [Computer Software]. Retrieved from https://www.jamovi.org',
            url: 'https://www.jamovi.org',
        }));

        for (let analysis of this._analyses) {
            if (analysis.deleted)
                continue;
            modules.add(analysis.ns);
            for (let ref of analysis.references) {
                refs.push(this.resolve(analysis.ns, ref));
            }
        }

        for (let i = 0; i < refs.length - 1; i++) {
            let r1 = refs[i];
            if (r1 === null)
                continue;
            for (let j = i + 1; j < refs.length; j++) {
                let r2 = refs[j];
                if (r2 === null)
                    continue;
                if (r1.text === r2.text) {
                    r1.addresses.push(...r2.addresses);
                    refs[j] = null;
                }
            }
            r1.addresses = [...new Set(r1.addresses)];
        }

        refs = refs.filter((x) => x !== null);

        this._body.innerHTML = '';

        for (let i = 0; i < refs.length; i++) {
            let ref = refs[i];
            let el = document.createElement('jmv-reference');
            el.setup(i + 1, ref.text);
            this._body.appendChild(el);
        }

        this._refs = refs;
        this._modules = modules;
        this._numbers = null;
    }

    resolve(moduleName, ref) {

        let pub = ref.publisher;
        if (pub.endsWith(ref.url)) {
            let noUrl = pub.substring(0, pub.length - ref.url.length);
            pub = `${ noUrl }<a href="${ ref.url }" target="_blank">${ ref.url }</a>`;
        }
        else if (ref.url) {
            pub = `${ pub }. <a href="${ ref.url }" target="_blank">link</a>`;
        }

        return {
            addresses: [ { module: moduleName, name: ref.name } ],
            text: `${ ref.authors.complete } (${ref.year}). <em>${ ref.title }</em>. ${ pub }.`,
            url: ref.url,
        };
    }

    _css() {
        return `
            :host {
                display: block ;
                padding: 8px 12px ;
            }

            div > * {
                margin-top: 4px ;
            }

            h1 {
                font-size: 160%;
                color: #3E6DA9;
                white-space: nowrap;
                font-weight: bold ;
            }
        `;
    }
}

class Reference extends HTMLElement {
    constructor() {
        super();

        this._reference = null;
        this.selected = false;

        this._root = this.attachShadow({ mode: 'open' });

        this._root.innerHTML = `
            <style>
                :host {
                    display: block ;
                }

                .body {
                    padding: 4px ;
                    border: 2px solid transparent ;
                }

                .body[data-checked='1'] {
                    background-color: #B5CAEF ;
                    border: 2px solid #8BA4D6;
                }

                input {
                    margin-right: 6px ;
                }

                span.num {
                    font-weight: bold ;
                    margin-right: 6px ;
                }

                span.ref {
                    line-height: 150% ;
                }
            </style>
            <p class="body">
                <input type="checkbox">
                <span class="num"></span>
                <span class="ref"></span>
            </p>
        `;

        this._cont = this._root.querySelector('.body');
        this._checkbox = this._root.querySelector('input');
        this._text = this._root.querySelector('span.ref');
        this._number = this._root.querySelector('span.num');

        this._checkbox.addEventListener('change', () => {
            this.setSelected(this._checkbox.checked);
        });
    }

    setup(number, text, url) {
        this._number.textContent = `[${ number }]`;
        this._text.textContent = text;
        text = this._text.innerHTML;
        text = text.replace(/&lt;em&gt;/g, '<em>');
        text = text.replace(/&lt;\/em&gt;/g, '</em>');
        text = text.replace(/&lt;a (.*)&gt;(.*)&lt;\/a&gt;/g, '<a $1>$2</a>');
        this._text.innerHTML = text;
    }

    asHTML() {
        return this._text.innerHTML;
    }

    asText() {
        return this._text.textContent;
    }

    select() {
        this.setSelected(true);
    }

    unselect() {
        this.setSelected(false);
    }

    setSelected(selected) {
        this.selected = selected;
        this._checkbox.checked = selected;
        this._cont.dataset.checked = (selected ? '1' : '0');
    }
}

customElements.define('jmv-references', References);
customElements.define('jmv-reference', Reference);

module.exports = {  };
