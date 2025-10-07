
'use strict';

import focusLoop from '../common/focusloop';
import Analyses from './analyses';


interface IReferenceDetails {
    addresses: {
        module: string;
        name: string;
    }[];
    text: any;
    url: string;
}

export interface Authors {
     complete: string;
}

export interface IReference {
    name: string;
    type: string;
    authors: Authors;
    year: number;
    title: string;
    publisher: string;
    url: string;
    volume?: string;
    issue?: string;
    pages?: string;
    year2?: string;
    extra?: string;
}

export class References extends HTMLElement {
    _root: ShadowRoot;
    _body: HTMLDivElement;
    _analyses: Analyses;
    _refs: IReferenceDetails[];
    _modules: Set<string>;
    _numbers: { [module: string]: { [name: string]: number } };

    constructor() {
        super();

        this._analyses = null;
        this._refs = [ ];
        this._modules = new Set<string>();
        this._numbers = null;

        this._root = this.attachShadow({ mode: 'open' });

        let labelId = focusLoop.getNextAriaElementId('label');

        let style = document.createElement('style');
        style.textContent = this._css();
        this._root.appendChild(style);

        this._root.host.addEventListener('keydown', (event: KeyboardEvent) => {
            if (event.altKey && event.code === 'ArrowDown') {
                focusLoop.enterFocusLoop(this._body);
            }
        });

        let heading = document.createElement('h1');
        heading.textContent = _('References');
        heading.setAttribute('id', labelId);

        this._body = document.createElement('div');
        this._body.className += ' body';
        this._body.setAttribute('role', 'list');
        this._body.setAttribute('aria-labelledby', labelId);

        this._root.appendChild(heading);
        this._root.appendChild(this._body);
        
        focusLoop.addFocusLoop(this._body, { level: 1 });
    }

    setAnalyses(analyses) {
        this._analyses = analyses;
    }

    getAllNumbers() {
        if ( ! this._numbers) {
            let numbers = { jmv: { }, R: { } };
            for (let module of this._modules)
                numbers[module] = { };
            for (let i = 0; i < this._refs.length; i++) {
                let ref = this._refs[i];
                for (let address of ref.addresses)
                    numbers[address.module][address.name] = (i + 1);
            }
            this._numbers = numbers;
        }

        return this._numbers;
    }
    
    getNumbers(ns: string) {
        const numbers = this.getAllNumbers();

        let nums = numbers[ns];
        if (nums === undefined)
            return { };
        else
            return nums;
    }

    n() {
        return this._refs.length;
    }

    activate() {
        this._root.host.classList.add('activated');
    }

    deactivate() {
        this._root.host.classList.remove('activated');
    }

    select() {
        this._body.classList.add('selected');
    }

    deselect() {
        this._body.classList.remove('selected');
        this.clearSelection();
    }

    nSelected() {
        let refElems = [...this._body.querySelectorAll<Reference>('jmv-reference')];
        let n = refElems.reduce((count, elem) => count + (elem.selected ? 1 : 0), 0);
        return n;
    }

    selectAll() {
        let refElems = this._body.querySelectorAll<Reference>('jmv-reference');
        for (let elem of refElems)
            elem.select();
    }

    clearSelection() {
        let refElems = this._body.querySelectorAll<Reference>('jmv-reference');
        for (let elem of refElems)
            elem.unselect();
    }

    asHTML() {
        let noneSelected = (this.nSelected() === 0);
        let pieces = [ ];
        let refElems = this._body.querySelectorAll<Reference>('jmv-reference');
        for (let elem of refElems) {
            if (noneSelected || elem.selected)
                pieces.push(elem.asHTML());
        }
        return `<p>${ pieces.join('</p><p>') }</p>`;
    }

    asText() {
        let noneSelected = (this.nSelected() === 0);
        let pieces = [ ];
        let refElems = this._body.querySelectorAll<Reference>('jmv-reference');
        for (let elem of refElems) {
            if (noneSelected || elem.selected)
                pieces.push(elem.asText());
        }
        return pieces.join('\n');
    }

    update() {

        let refs = [ ];
        let modules = new Set<string>();

        refs.push(this.resolve('jmv', {
            name: 'jamovi',
            type: 'software',
            authors: { complete: 'The jamovi project' },
            year: 2025,
            title: 'jamovi',
            publisher: '(Version 2.7) [Computer Software]. Retrieved from https://www.jamovi.org',
            url: 'https://www.jamovi.org',
        }));

        const R = {
            name: 'R',
            type: 'software',
            authors: { complete: 'R Core Team' },
            year: 2025,
            title: 'R: A Language and environment for statistical computing',
            publisher: '(Version 4.5) [Computer software]. Retrieved from https://cran.r-project.org',
            url: 'https://cran.r-project.org',
            extra: 'R packages retrieved from CRAN snapshot 2025-05-25'
        };

        refs.push(this.resolve('R', R));

        for (let analysis of this._analyses) {
            modules.add(analysis.ns);
            for (let ref of analysis.references) {
                if (ref.name === 'R')
                    // keep all R refs in sync
                    refs.push(this.resolve(analysis.ns, R));
                else
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

        let refElemets = this._body.querySelectorAll('jmv-reference');
        refElemets.forEach((refElement) => {
            refElement.removeEventListener('keydown', this.refKeyDown);
        });

        this._body.innerHTML = '';

        let firstRef = null;
        for (let i = 0; i < refs.length; i++) {
            let ref = refs[i];
            let el = document.createElement('jmv-reference') as Reference;
            el.setup(i + 1, ref.text);
            el.setAttribute('role', 'listitem');
            el.setAttribute('tabindex', '0');
            el.addEventListener('keydown', this.refKeyDown);
            if ( ! firstRef)
                firstRef = el;
            this._body.appendChild(el);
        }

        this._refs = refs;
        this._modules = modules;
        this._numbers = null;
    }

    refKeyDown(event) {
        if (event.code === 'Space') 
            event.target.setSelected( ! event.target.selected);
    }

    resolve(moduleName: string, ref: IReference) {

        // the proto addresses changed
        if (ref.authors === null || typeof(ref.authors) !== 'object')
            return {
                addresses: [ { module: moduleName, name: ref.name } ],
                text: '',
                url: ref.url,
            };

        let pub = ref.publisher;
        if (pub.endsWith(ref.url)) {
            let noUrl = pub.substring(0, pub.length - ref.url.length);
            pub = `${ noUrl }<a href="${ ref.url }" target="_blank">${ ref.url }</a>`;
        }
        else if (ref.url) {
            pub = `${ pub }. <a href="${ ref.url }" target="_blank">link</a>`;
        }

        let text;

        let year = ref.year2;
        if ( ! year)
            year = ref.year.toString();

        if (ref.type === 'article') {
            let volume = '';
            let pages = '';
            let issue = '';
            if (ref.volume)
                volume = `, ${ ref.volume }`;
            if (ref.issue)
                issue = `(${ ref.issue })`;
            if (ref.pages)
                pages = `, ${ ref.pages }`;

            text = `${ ref.authors.complete } (${ year }). ${ ref.title }. <em>${ pub }${ volume }</em>${ issue }${ pages }.`;
        }
        else {
            text = `${ ref.authors.complete } (${ year }). <em>${ ref.title }</em>. ${ pub }.`;
        }

        if (ref.extra)
            text += ` (${ ref.extra }).`;

        return {
            addresses: [ { module: moduleName, name: ref.name } ],
            text: text,
            url: ref.url,
        };
    }

    _css() {
        return `
            :host {
                display: block ;
                padding: 8px 12px ;
            }

            :host[data-selected] {
                background-color: red ;
            }

            .body jmv-reference {
                --checkbox-opacity: 0 ;
            }

            .body.selected jmv-reference {
                --checkbox-opacity: 1 ;
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

export class Reference extends HTMLElement {
    selected: boolean;
    _root: ShadowRoot;

    _cont: HTMLElement;
    _checkbox: HTMLInputElement;
    _text: HTMLElement;
    _number: HTMLElement;

    constructor() {
        super();

        this.selected = false;

        this._root = this.attachShadow({ mode: 'open' });

        this._root.innerHTML = `
            <style>
                :host {
                    display: block ;
                }

                .body {
                    padding: 2px ;
                    border: 2px solid transparent ;
                    display: grid ;
                    grid-template-columns: auto auto 1fr ;
                }

                .body[data-checked='1'] {
                    background-color: #B5CAEF ;
                    border: 2px solid #8BA4D6;
                }

                input {
                    margin-inline-end: 6px ;
                    opacity: var(--checkbox-opacity, 1);
                    transition: opacity .3s ;
                }

                span.num {
                    font-weight: bold ;
                    margin-inline-end: 6px ;
                    line-height: 150% ;
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

    setup(number: number, text: string) {
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

    setSelected(selected: boolean) {
        this.selected = selected;
        this._checkbox.checked = selected;
        this._cont.dataset.checked = (selected ? '1' : '0');
    }
}

customElements.define('jmv-references', References);
customElements.define('jmv-reference', Reference);

export default {  };
