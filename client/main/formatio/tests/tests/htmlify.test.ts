// @vitest-environment jsdom

import path from 'path';
import fs from 'fs';

import { describe, it, expect } from 'vitest';

import { htmlify, createDoc } from '../../htmlify';
import { jmv, R } from '../../../references';
import { IElement, IText, IImage, ITable, ICell, html2Chunks } from '../../hydrate';


// a hand-built cell, as hydrate would make it
function cell(html: string, align: ICell['align'], extra: Partial<ICell> = {}): ICell {
    const chunks = html2Chunks(html);
    return { content: chunks.map(c => c.content).join(''), chunks, align, ...extra };
}

function retrieveExpected(name: string): any {
    const filePath = path.join(__dirname, 'data', `${ name }.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// the html as a document, for querying
function build(item: IElement, options?: Parameters<typeof htmlify>[1]): Document {
    return new DOMParser().parseFromString(htmlify(item, options), 'text/html');
}

describe('htmlify tables', () => {

    for (const name of ['anova-table', 'descriptives-table', 'corr-matrix']) {
        it(`produces a titled table for ${ name }`, () => {
            const table = retrieveExpected(name) as ITable;
            const doc = build(table);
            expect(doc.querySelectorAll('table').length).toBe(1);
            expect(doc.querySelector('thead th')!.textContent).toBe(table.title);
            // every row spans the full grid, counting cells spanning down from above
            const covered: Array<number> = [];  // columns covered by rowspans, in the rows to come
            for (const tr of Array.from(doc.querySelectorAll('tr'))) {
                let n = covered.shift() || 0;
                for (const td of Array.from(tr.children) as Array<HTMLTableCellElement>) {
                    n += td.colSpan;
                    for (let i = 0; i < td.rowSpan - 1; i++)
                        covered[i] = (covered[i] || 0) + td.colSpan;
                }
                expect(n).toBe(table.nCols);
            }
        });
    }

    it('keeps inline formatting in cells, and adds footnote superscripts', () => {
        // hydrate.ts marks a footnote letter up itself ('<sup>b</sup>'), as
        // it's the one piece of cell.sups with no markup of its own
        const table: ITable = {
            type: 'table',
            title: 'A table',
            nCols: 2,
            rows: [
                { type: 'title', cells: [ cell('p<sub>tukey</sub>', 'c'), cell('η²<sup>a</sup>', 'c') ] },
                { type: 'body', cells: [ cell('< .001', 'r', { sups: ['<sup>b</sup>'] }), cell('0.5', 'r') ] },
                { type: 'footnote', cells: [ cell('a note & more', 'l', { colSpan: 2, sups: ['note'] }) ] },
                { type: 'footnote', cells: [ cell('specific', 'l', { colSpan: 2, sups: ['<sup>b</sup>'] }) ] },
            ],
        };
        const doc = build(table);
        const ths = doc.querySelectorAll('thead th');
        expect(ths[1].querySelector('sub')!.textContent).toBe('tukey');
        expect(ths[2].querySelector('sup')!.textContent).toBe('a');
        const tds = doc.querySelectorAll<HTMLTableCellElement>('tbody td');
        expect(tds[0].textContent).toBe('< .001b');
        expect(tds[0].querySelector('sup')!.textContent).toBe('b');
        expect(tds[0].style.textAlign).toBe('right');
        expect(tds[2].textContent).toBe('Note. a note & more');
        expect(tds[2].querySelector('em')!.textContent).toBe('Note. ');
        expect(tds[3].textContent).toBe('b specific');
    });

    it('renders a symbol exactly as given, without superscripting it again', () => {
        // jmv symbols are usually plain text (e.g. significance stars, or a
        // unicode superscript like '⁻'), already whatever they need to
        // be; some (e.g. linreg's estimated marginal means) carry markup of
        // their own instead ('<sup>μ</sup>') -- neither should be
        // wrapped in another <sup>, unlike a footnote letter (see above)
        const table: ITable = {
            type: 'table',
            title: 'A table',
            nCols: 1,
            rows: [
                { type: 'title', cells: [ cell('x', 'c') ] },
                { type: 'body', cells: [ cell('1.23', 'r', { sups: [ '*', '<sup>μ</sup>' ] }) ] },
            ],
        };
        const doc = build(table);
        const td = doc.querySelector('tbody td')!;
        const sups = td.querySelectorAll('sup');
        expect(sups.length).toBe(1);  // only the markup symbol is a <sup>
        expect(sups[0].textContent).toBe('μ');
        expect(td.textContent).toBe('1.23*μ');  // no comma, and '*' stays plain
    });

    it('merges combined rows and spans super titles', () => {
        const table: ITable = {
            type: 'table',
            title: 'Spans',
            nCols: 3,
            rows: [
                { type: 'superTitle', cells: [ null, cell('Group', 'c', { colSpan: 2 }), cell('Group', 'c', { colSpan: 0 }) ] },
                { type: 'title', cells: [ cell('a', 'c'), cell('b', 'c'), cell('c', 'c') ] },
                { type: 'body', cells: [ cell('x', 'l', { rowSpan: 2 }), cell('1', 'r'), cell('2', 'r') ] },
                { type: 'body', cells: [ cell('x', 'l', { rowSpan: 0 }), cell('3', 'r'), cell('4', 'r') ] },
            ],
        };
        const doc = build(table);
        const superTitle = doc.querySelectorAll('thead tr')[1];
        expect(superTitle.children.length).toBe(2);
        expect((superTitle.children[1] as HTMLTableCellElement).colSpan).toBe(2);
        const body = doc.querySelectorAll('tbody tr');
        expect(body[0].children.length).toBe(3);
        expect((body[0].children[0] as HTMLTableCellElement).rowSpan).toBe(2);
        expect(body[1].children.length).toBe(2);
        expect(body[1].textContent).toBe('34');
        // the rule beneath the body runs under the spanning cell too
        const last = Array.from(doc.querySelectorAll('tbody td')) as Array<HTMLTableCellElement>;
        expect(last.map((c) => c.style.borderBottom !== '')).toEqual([ true, false, false, true, true ]);
    });

    it('rules above the body and below it, and sets groups apart', () => {
        const table: ITable = {
            type: 'table',
            title: 'Rules',
            nCols: 1,
            rows: [
                { type: 'title', cells: [ cell('a', 'c') ] },
                { type: 'body', cells: [ cell('1', 'r', { format: 1 }) ] },
                { type: 'body', cells: [ cell('2', 'r', { format: 8 }) ] },
                { type: 'body', cells: [ cell('3', 'r') ] },
                { type: 'footnote', cells: [ cell('n', 'l') ] },
            ],
        };
        const doc = build(table);
        const cells = Array.from(doc.querySelectorAll('th, td')) as Array<HTMLTableCellElement>;
        expect(cells.map((c) => c.style.borderBottom !== '')).toEqual([ true, true, false, false, true, false ]);
        expect(cells[2].style.paddingTop).toBe('8px');    // begins a group
        expect(cells[3].style.paddingLeft).toBe('24px');  // indented
    });
});

describe('htmlify figures', () => {

    const figure = (path: string | null): IImage => ({ type: 'image', title: 'A plot', path, width: 600, height: 400, address: '3/main/plot' });

    it('embeds the image from its path, when it has one', () => {
        const doc = build(figure('data:image/png;base64,AAAA'));
        const img = doc.querySelector('img')!;
        expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA');
        expect(img.width).toBe(600);
        expect(img.alt).toBe('A plot');
        expect(doc.body.textContent).toContain('A plot');
    });

    it('leaves the src off, rather than "null", when it has none', () => {
        const doc = build(figure(null));
        expect(doc.querySelector('img')!.hasAttribute('src')).toBe(false);
    });

    it('leaves the size to the image when it is not known (an svg element)', () => {
        const doc = build({ ...figure('plot.svg'), width: 0, height: 0 });
        const img = doc.querySelector('img')!;
        expect(img.hasAttribute('width')).toBe(false);
        expect(img.hasAttribute('height')).toBe(false);
        expect(img.getAttribute('src')).toBe('plot.svg');
    });
});

describe('htmlify text', () => {

    it('maps paragraphs to headings, lists, alignment and inline formats', () => {
        const text: IText = {
            type: 'text',
            paragraphs: [
                { chunks: [ { content: 'A heading' } ], attributes: { header: 1 } },
                { chunks: [
                    { content: 'bold', attributes: { bold: true } },
                    { content: ' and ' },
                    { content: 'a link', attributes: { link: 'https://www.jamovi.org/?a=1&b=2' } },
                ] },
                { chunks: [ { content: 'one' } ], attributes: { list: 'ordered' } },
                { chunks: [ { content: 'two' } ], attributes: { list: 'ordered' } },
                { chunks: [ { content: 'nested' } ], attributes: { list: 'ordered', indent: 1 } },
                { chunks: [ { content: 'bullet' } ], attributes: { list: 'bullet' } },
                { chunks: [ ] },
                { chunks: [ { content: 'centred' } ], attributes: { align: 'center' } },
                { chunks: [ { content: 'x', attributes: { script: 'super', color: '#ff0000' } } ] },
                { chunks: [ { content: 'code' } ], attributes: { codeBlock: true } },
            ],
        };
        const doc = build(text, { level: 2 });
        expect(doc.querySelector('h2')!.textContent).toBe('A heading');
        expect(doc.querySelector('strong')!.textContent).toBe('bold');
        expect(doc.querySelector('a')!.getAttribute('href')).toBe('https://www.jamovi.org/?a=1&b=2');
        // one ordered list, with a nested list inside its last item
        const ols = doc.querySelectorAll('ol');
        expect(ols.length).toBe(2);
        expect(ols[0].parentElement!.tagName).toBe('BODY');
        expect(ols[1].parentElement!.tagName).toBe('LI');
        expect(ols[1].textContent).toBe('nested');
        // a change of list type begins a new list
        expect(doc.querySelectorAll('ul').length).toBe(1);
        expect(doc.querySelectorAll('li').length).toBe(4);
        const ps = Array.from(doc.querySelectorAll('p'));
        expect(ps[1].querySelector('br')).not.toBeNull();  // the blank line
        expect(ps[2].style.textAlign).toBe('center');
        const sup = doc.querySelector('sup')!;
        expect(sup.textContent).toBe('x');
        expect((sup.parentElement as HTMLElement).style.color).toBe('rgb(255, 0, 0)');
        expect(doc.querySelector('pre')!.textContent).toBe('code');
        expect(doc.body.textContent).toContain('bold and a link');
    });

    it('keeps a notice together in a box, with its title', () => {
        const text: IText = {
            type: 'text',
            title: 'Warning',
            box: 2,
            paragraphs: [ { chunks: [ { content: 'something happened' } ] } ],
        };
        const doc = build(text);
        const box = doc.querySelector('div')!;
        expect(box.style.borderLeft).not.toBe('');
        expect(box.textContent).toContain('Warning');
        expect(box.textContent).toContain('something happened');
        expect(doc.querySelector('h1, h2, h3')).toBeNull();
    });
});

describe('htmlify groups and syntax', () => {

    it('numbers headings by depth, and includes syntax only when asked', () => {
        const group: IElement = {
            type: 'group',
            title: 'Analysis',
            items: [
                { type: 'group', title: 'Inner', items: [
                    { type: 'preformatted', content: 'x <- 1', syntax: true },
                    { type: 'preformatted', title: 'Output', content: 'a  b', syntax: false },
                ] },
            ],
        };
        let doc = build(group);
        expect(doc.querySelector('h1')!.textContent).toBe('Analysis');
        expect(doc.querySelector('h2')!.textContent).toBe('Inner');
        expect(doc.querySelector('h3')!.textContent).toBe('Output');
        expect(doc.querySelectorAll('pre').length).toBe(1);
        expect(doc.body.textContent).not.toContain('x <- 1');

        doc = build(group, { showSyntax: true });
        expect(doc.querySelectorAll('pre').length).toBe(2);
        expect(doc.body.textContent).toContain('x <- 1');
    });
});

describe('createDoc', () => {

    const table = (): ITable => ({
        type: 'table', title: 'T', nCols: 1, refs: [ 'jamovi' ],
        rows: [ { type: 'body', cells: [ cell('1', 'r') ] } ],
    });

    it('is a self-contained page, with the elements at their levels', () => {
        const items = [
            { element: { type: 'group', title: 'Results', items: [] } as IElement, level: 1 },
            { element: { type: 'group', title: 'Analysis', items: [ table() ] } as IElement, level: 2 },
        ];
        const html = createDoc(items, { generator: 'jamovi 2.7' });
        expect(html.startsWith('<!doctype html>')).toBe(true);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        expect(doc.querySelector('meta[charset]')).not.toBeNull();
        expect(doc.querySelector('meta[name="generator"]')!.getAttribute('content')).toBe('jamovi 2.7');
        expect(doc.querySelector('style')!.textContent).toContain('font-family');
        expect(doc.querySelector('h1')!.textContent).toBe('Results');
        expect(doc.querySelector('h2')!.textContent).toBe('Analysis');
        expect(doc.querySelectorAll('table').length).toBe(1);
    });

    it('numbers the references, and lists them at the end', () => {
        const doc = new DOMParser().parseFromString(createDoc([ { element: table() } ], { references: [ R, jmv ] }), 'text/html');
        // jamovi is the second reference, so the table is cited [2]
        expect(doc.querySelector('table + p')!.textContent).toBe('[2]');
        const headings = Array.from(doc.querySelectorAll('h1')).map((h) => h.textContent);
        expect(headings).toEqual([ 'References' ]);
        const refs = Array.from(doc.querySelectorAll('h1 ~ p')).map((p) => p.textContent);
        expect(refs.length).toBe(2);
        expect(refs[0]!.startsWith('[1] ')).toBe(true);
        expect(refs[1]!.startsWith('[2] ')).toBe(true);
        expect(refs[1]).toContain('jamovi');
        expect(doc.querySelector('h1 ~ p a')).not.toBeNull();  // the urls are links
    });

    it('leaves the references out when they are hidden', () => {
        const doc = new DOMParser().parseFromString(createDoc([ { element: table() } ], { references: [ R, jmv ], showRefs: false }), 'text/html');
        expect(doc.body.textContent).not.toContain('References');
        expect(doc.body.textContent).not.toContain('[2]');
    });

    it('cites by name when the reference is not in the list', () => {
        const doc = new DOMParser().parseFromString(createDoc([ { element: table() } ], { references: [ R ] }), 'text/html');
        expect(doc.querySelector('table + p')!.textContent).toBe('[jamovi]');
    });
});
