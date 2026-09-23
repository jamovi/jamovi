// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';

import { createDoc, IDocItem, IDocOptions } from '../../odtify';
import { IElement, IText, IImage, ITable, ICell, html2Chunks } from '../../hydrate';
import { jmv, R } from '../../../references';


// a hand-built cell, as hydrate would make it
function cell(html: string, align: ICell['align'], extra: Partial<ICell> = {}): ICell {
    const chunks = html2Chunks(html);
    return { content: chunks.map(c => c.content).join(''), chunks, align, ...extra };
}

// a 1x1 png
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

interface IPackage {
    document: Document;   // content.xml, parsed
    xml: string;          // content.xml, as text
    text: string;         // all the document's text
    files: Array<string>;
    mimetype: string;
}

// builds the document, and takes it apart again
async function build(items: Array<IDocItem | IElement>, options?: IDocOptions): Promise<IPackage> {
    const docItems = items.map((item) => ('element' in item) ? item : { element: item });
    const bytes = await createDoc(docItems, options);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('content.xml')!.async('string');
    const mimetype = await zip.file('mimetype')!.async('string');
    // the document must be well-formed xml, or LibreOffice refuses to open it
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const error = document.querySelector('parsererror');
    if (error)
        throw new Error(error.textContent || 'parse error');
    const text = Array.from(document.getElementsByTagNameNS('*', 'p'))
        .concat(Array.from(document.getElementsByTagNameNS('*', 'h')))
        .map((p) => p.textContent).join('');
    return { document, xml, text, files: Object.keys(zip.files), mimetype };
}

describe('odtify tables', () => {

    it('treats a bare < in a cell as text, and <sup> as a superscript', async () => {
        // hydrate.ts marks a footnote letter up itself ('<sup>b</sup>'), as
        // it's the one piece of cell.sups with no markup of its own
        const table: ITable = {
            type: 'table',
            title: 'A table',
            nCols: 2,
            rows: [
                { type: 'title', cells: [ cell('p', 'c'), cell('η²<sup>a</sup>', 'c') ] },
                { type: 'body', cells: [ cell('< .001', 'r', { sups: ['<sup>b</sup>'] }), cell('0.5', 'r') ] },
                { type: 'footnote', cells: [ cell('a note & more', 'l', { colSpan: 2, sups: ['note'] }) ] },
            ],
        };
        const pkg = await build([ table ]);
        expect(pkg.text).toContain('< .001');
        expect(pkg.text).toContain('a note & more');
        expect(pkg.xml).toContain('style:text-position="super 58%"');
        expect(pkg.text).toContain('Note. ');
    });

    it('renders a symbol exactly as given, without superscripting it again', async () => {
        // jmv symbols are usually plain text (e.g. significance stars, or a
        // unicode superscript like '⁻'), already whatever they need to
        // be; some (e.g. linreg's estimated marginal means) carry markup of
        // their own instead ('<sup>μ</sup>') -- neither should be
        // wrapped in another superscript run, unlike a footnote letter
        const table: ITable = {
            type: 'table',
            title: 'A table',
            nCols: 1,
            rows: [
                { type: 'title', cells: [ cell('x', 'c') ] },
                { type: 'body', cells: [ cell('1.23', 'r', { sups: [ '*', '<sup>μ</sup>' ] }) ] },
            ],
        };
        const pkg = await build([ table ]);
        expect(pkg.text).toBe('A tablex1.23*μ');  // no separator between sups
        expect(pkg.xml).toContain('style:text-position="super 58%"');
        expect(pkg.xml).not.toContain('sub 58%');
    });

    it('merges combined rows and spans super titles, keeping every row on the full grid', async () => {
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
        const pkg = await build([ table ]);
        expect(pkg.xml).toContain('table:number-columns-spanned="2"');
        expect(pkg.xml).toContain('table:number-rows-spanned="2"');
        expect(pkg.xml).toContain('<table:covered-table-cell');

        // every row spans the full grid, whether by real cells, a
        // columns-spanned cell, or covered-table-cell placeholders
        for (const tr of Array.from(pkg.document.getElementsByTagNameNS('*', 'table-row'))) {
            let n = 0;
            for (const tc of Array.from(tr.children)) {
                const spanned = tc.getAttributeNS('*', 'number-columns-spanned') || tc.getAttribute('table:number-columns-spanned');
                const repeated = tc.getAttributeNS('*', 'number-columns-repeated') || tc.getAttribute('table:number-columns-repeated');
                n += parseInt(spanned || repeated || '1');
            }
            expect(n).toBe(3);
        }
    });

    it('draws a rule above the table, below the column titles, and below the last body row', async () => {
        const table: ITable = {
            type: 'table', title: 'T', nCols: 1,
            rows: [
                { type: 'title', cells: [ cell('x', 'c') ] },
                { type: 'body', cells: [ cell('1', 'r') ] },
                { type: 'body', cells: [ cell('2', 'r') ] },
            ],
        };
        const pkg = await build([ table ]);
        // top (title row) + bottom (title row) + bottom (last body row) = 3
        // distinct cell styles carrying a border, each used once. the rule
        // beneath the body is the heavier one
        expect((pkg.xml.match(/fo:border-top="1pt solid #000000"/g) || []).length).toBe(1);
        expect((pkg.xml.match(/fo:border-bottom="1pt solid #000000"/g) || []).length).toBe(1);
        expect((pkg.xml.match(/fo:border-bottom="2pt solid #000000"/g) || []).length).toBe(1);
    });
});

describe('odtify figures', () => {

    const figure = (address: string): IImage => ({ type: 'image', title: 'A plot', path: null, width: 1000, height: 500, address });

    it('embeds the png from the figure source, scaled to the page', async () => {
        const figures = async () => ({ png: PNG });
        const pkg = await build([ figure('3/main/plot') ], { figures });
        expect(pkg.xml).toContain('office:binary-data');
        // scaled to the text width (451.3pt), keeping its aspect
        expect(pkg.xml).toContain('svg:width="451.3pt" svg:height="225.65pt"');
        expect(pkg.text).toContain('A plot');
        expect(pkg.text).not.toContain('Figure 1');
    });

    it('leaves a note where the figure could not be exported', async () => {
        const figures = async () => null;
        const pkg = await build([ figure('3/main/plot') ], { figures });
        expect(pkg.text).toContain('could not be exported');
        expect(pkg.xml).not.toContain('draw:frame');
    });

    it('passes the figure its address', async () => {
        const seen: Array<string> = [];
        const figures = async (address: string) => { seen.push(address); return null; };
        await build([ figure('3/main/plot'), figure('4/other') ], { figures });
        expect(seen).toEqual([ '3/main/plot', '4/other' ]);
    });
});

describe('odtify text', () => {

    it('maps paragraphs to headings, lists, alignment and runs', async () => {
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
                { chunks: [ { content: 'centred' } ], attributes: { align: 'center' } },
                { chunks: [ { content: 'x', attributes: { script: 'super', color: '#ff0000' } } ] },
            ],
        };
        const pkg = await build([ { element: text, level: 2 } ]);
        expect(pkg.xml).toContain('text:style-name="Heading_2"');
        expect(pkg.xml).toContain('fo:font-weight="bold"');
        expect(pkg.xml).toMatch(/<text:a [^>]*xlink:href="/);
        expect(pkg.xml).toContain('<text:list-item>');
        expect(pkg.xml).toContain('fo:text-align="center"');
        expect(pkg.xml).toContain('fo:color="#FF0000"');
        expect(pkg.text).toContain('bold and a link');
    });

    it('gives each list a fresh <text:list>, so ODF numbers it from 1', async () => {
        const list = (item: string): IText => ({
            type: 'text', paragraphs: [ { chunks: [ { content: item } ], attributes: { list: 'ordered' } } ],
        });
        const gap: IText = { type: 'text', paragraphs: [ { chunks: [ { content: 'gap' } ] } ] };
        const group: IElement = { type: 'group', title: 'G', items: [ list('a'), gap, list('b') ] };
        const pkg = await build([ group, list('c') ]);
        const lists = pkg.xml.match(/<text:list text:style-name="ListNumber">/g) || [];
        expect(lists.length).toBe(3);
    });

    it('keeps a notice together in a box, with its title', async () => {
        const text: IText = {
            type: 'text',
            title: 'Warning',
            box: 2,
            paragraphs: [ { chunks: [ { content: 'something happened' } ] } ],
        };
        const pkg = await build([ text ]);
        expect(pkg.xml).not.toContain('Heading');
        expect(pkg.xml).toContain('text:style-name="Notice2"');
        expect(pkg.text).toContain('Warning');
    });
});

describe('createDoc', () => {

    it('numbers citations and adds a reference list', async () => {
        const table: ITable = { type: 'table', title: 'T', nCols: 1, refs: ['jmv'], rows: [ { type: 'body', cells: [ cell('1', 'r') ] } ] };
        const references = [ R, jmv, { ...jmv, name: 'jmv', title: 'The jamovi module' } ];
        const pkg = await build([ table ], { references });
        expect(pkg.text).toContain('T');
        expect(pkg.text).toContain('[3]');
        expect(pkg.xml).toContain('text:style-name="ReferenceNumbers"');
        expect(pkg.text).toContain('References');
        expect(pkg.text).toContain('[1] R Core Team');
        expect(pkg.xml).toContain('text:style-name="References"');
    });

    it('leaves out citations and the reference list when refs are hidden', async () => {
        const table: ITable = { type: 'table', title: 'T', nCols: 1, refs: ['jmv'], rows: [ { type: 'body', cells: [ cell('1', 'r') ] } ] };
        const text: IText = { type: 'text', refs: ['jmv'], paragraphs: [ { chunks: [ { content: 'note' } ] } ] };
        const pkg = await build([ table, text ], { references: [ R, jmv ], showRefs: false });
        expect(pkg.text).toContain('T');
        expect(pkg.text).not.toContain('[2]');
        expect(pkg.text).not.toContain('References');
        expect(pkg.xml).not.toContain('text:style-name="ReferenceNumbers"');
        expect(pkg.xml).not.toContain('text:style-name="References"');
    });

    it('produces a complete, valid ODF package', async () => {
        const table: ITable = { type: 'table', title: 'T', nCols: 1, rows: [ { type: 'body', cells: [ cell('1', 'r') ] } ] };
        const pkg = await build([ table ]);
        for (const name of [ 'mimetype', 'META-INF/manifest.xml', 'content.xml', 'styles.xml', 'meta.xml' ])
            expect(pkg.files).toContain(name);
        // the mimetype entry must come first, verbatim, for a bare sniff to
        // recognise the package as ODF
        expect(pkg.files[0]).toBe('mimetype');
        expect(pkg.mimetype).toBe('application/vnd.oasis.opendocument.text');
    });
});
