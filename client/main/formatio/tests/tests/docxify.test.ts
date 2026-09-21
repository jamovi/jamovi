// @vitest-environment jsdom

import path from 'path';
import fs from 'fs';

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';

import { createDoc, IDocItem, IDocOptions } from '../../docxify';
import { IElement, IText, IImage, ITable, ICell, html2Chunks } from '../../hydrate';
import { jmv, R } from '../../../references';


// a hand-built cell, as hydrate would make it
function cell(html: string, align: ICell['align'], extra: Partial<ICell> = {}): ICell {
    const chunks = html2Chunks(html);
    return { content: chunks.map(c => c.content).join(''), chunks, align, ...extra };
}

function retrieveExpected(name: string): any {
    const filePath = path.join(__dirname, 'data', `${ name }.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// a 1x1 png
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>';

interface IPackage {
    document: Document;   // word/document.xml, parsed
    xml: string;          // word/document.xml, as text
    text: string;         // all the document's text
    files: Array<string>;
}

// builds the document, and takes it apart again
async function build(items: Array<IDocItem | IElement>, options?: IDocOptions): Promise<IPackage> {
    const docItems = items.map((item) => ('element' in item) ? item : { element: item });
    const bytes = await createDoc(docItems, options);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')!.async('string');
    // the document must be well-formed xml, or word refuses to open it
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const error = document.querySelector('parsererror');
    if (error)
        throw new Error(error.textContent || 'parse error');
    const text = Array.from(document.getElementsByTagNameNS('*', 't')).map((t) => t.textContent).join('');
    return { document, xml, text, files: Object.keys(zip.files) };
}

describe('docxify tables', () => {

    for (const name of ['anova-table', 'descriptives-table', 'corr-matrix']) {
        it(`produces a well-formed table for ${ name }`, async () => {
            const pkg = await build([ retrieveExpected(name) ]);
            expect(pkg.document.getElementsByTagNameNS('*', 'tbl').length).toBe(1);
            // titled, as on screen, but not numbered
            expect(pkg.xml).toContain('<w:pStyle w:val="Caption"/>');
            expect(pkg.xml).not.toContain('SEQ');
        });
    }

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
        expect(pkg.xml).toContain('<w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">a</w:t>');
        expect(pkg.xml).toContain('<w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">b</w:t>');
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
        expect(pkg.text).toBe('A tablex1.23*μ');  // no comma between sups
        expect(pkg.xml).not.toContain('<w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">*</w:t>');
        expect(pkg.xml).toContain('<w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">μ</w:t>');
        expect(pkg.xml).not.toContain('w:val="subscript"');
    });

    it('merges combined rows and spans super titles', async () => {
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
        expect(pkg.xml).toContain('<w:gridSpan w:val="2"/>');
        expect(pkg.xml).toContain('<w:vMerge w:val="restart"/>');
        expect(pkg.xml).toContain('<w:vMerge w:val="continue"/>');
        // every row spans the full grid
        for (const tr of Array.from(pkg.document.getElementsByTagNameNS('*', 'tr'))) {
            let n = 0;
            for (const tc of Array.from(tr.getElementsByTagNameNS('*', 'tc'))) {
                const span = tc.getElementsByTagNameNS('*', 'gridSpan')[0];
                n += span ? parseInt(span.getAttribute('w:val') || '1') : 1;
            }
            expect(n).toBe(3);
        }
    });
});

describe('docxify figures', () => {

    const figure = (address: string): IImage => ({ type: 'image', title: 'A plot', path: null, width: 1000, height: 500, address });

    it('embeds the png from the figure source, scaled to the page', async () => {
        const figures = async () => ({ png: PNG });
        const pkg = await build([ figure('3/main/plot') ], { figures });
        expect(pkg.files.some((f) => f.startsWith('word/media/') && f.endsWith('.png'))).toBe(true);
        // scaled to the text width (9026 twips ≈ 602px ≈ 5.73M emu), keeping its aspect
        expect(pkg.xml).toMatch(/<wp:extent cx="573\d{4}" cy="286\d{4}"\/>/);
        expect(pkg.text).toContain('A plot');
        expect(pkg.text).not.toContain('Figure 1');
    });

    it('embeds a vector plot as svg, with the png as fallback', async () => {
        const figures = async () => ({ png: PNG, svg: SVG });
        const pkg = await build([ figure('3/main/plot') ], { figures });
        expect(pkg.files.some((f) => f.endsWith('.svg'))).toBe(true);
        expect(pkg.files.some((f) => f.endsWith('.png'))).toBe(true);
        expect(pkg.xml).toContain('asvg:svgBlip');
    });

    it('leaves a note where the figure could not be had', async () => {
        const figures = async () => null;
        const pkg = await build([ figure('3/main/plot') ], { figures });
        expect(pkg.text).toContain('could not be exported');
        expect(pkg.files.some((f) => f.startsWith('word/media/'))).toBe(false);
    });

    it('passes the figure its address', async () => {
        const seen: Array<string> = [];
        const figures = async (address: string) => { seen.push(address); return null; };
        await build([ figure('3/main/plot'), figure('4/other') ], { figures });
        expect(seen).toEqual([ '3/main/plot', '4/other' ]);
    });
});

describe('docxify text', () => {

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
        expect(pkg.xml).toContain('<w:pStyle w:val="Heading2"/>');
        expect(pkg.xml).toContain('<w:b/>');
        expect(pkg.xml).toMatch(/<w:hyperlink [^>]*r:id="/);
        expect(pkg.xml).toContain('<w:numPr>');
        expect(pkg.xml).toContain('<w:jc w:val="center"/>');
        expect(pkg.xml).toContain('<w:color w:val="FF0000"/>');
        expect(pkg.text).toContain('bold and a link');
    });

    it('gives each ordered list its own numbering, so each starts at 1', async () => {
        const list = (item: string): IText => ({
            type: 'text', paragraphs: [ { chunks: [ { content: item } ], attributes: { list: 'ordered' } } ],
        });
        const gap: IText = { type: 'text', paragraphs: [ { chunks: [ { content: 'gap' } ] } ] };
        const group: IElement = { type: 'group', title: 'G', items: [ list('a'), gap, list('b') ] };
        const pkg = await build([ group, list('c') ]);
        const numIds = Array.from(pkg.xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)).map((m) => m[1]);
        expect(new Set(numIds).size).toBe(3);
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
        expect((pkg.xml.match(/<w:pBdr>/g) || []).length).toBe(2);
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
        expect(pkg.xml).toContain('<w:pStyle w:val="ReferenceNumbers"/>');
        expect(pkg.text).toContain('References');
        expect(pkg.text).toContain('[1] R Core Team');
        expect(pkg.xml).toContain('<w:pStyle w:val="References"/>');
    });

    it('leaves out citations and the reference list when refs are hidden', async () => {
        const table: ITable = { type: 'table', title: 'T', nCols: 1, refs: ['jmv'], rows: [ { type: 'body', cells: [ cell('1', 'r') ] } ] };
        const text: IText = { type: 'text', refs: ['jmv'], paragraphs: [ { chunks: [ { content: 'note' } ] } ] };
        const pkg = await build([ table, text ], { references: [ R, jmv ], showRefs: false });
        expect(pkg.text).toContain('T');
        expect(pkg.text).not.toContain('[2]');
        expect(pkg.text).not.toContain('References');
        expect(pkg.xml).not.toContain('<w:pStyle w:val="ReferenceNumbers"/>');
        expect(pkg.xml).not.toContain('<w:pStyle w:val="References"/>');
    });

    it('produces a complete package', async () => {
        const pkg = await build([ retrieveExpected('anova-table') ]);
        for (const name of [ '[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml' ])
            expect(pkg.files).toContain(name);
    });
});
