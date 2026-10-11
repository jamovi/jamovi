// @vitest-environment jsdom

import path from 'node:path';
import fs from 'node:fs';

import { describe, it, expect } from 'vitest';

import { markdownify, createDoc } from '../../markdownify';
import { jmv, R } from '../../../references';
import { IText, ITable, ICell, IParagraph, html2Chunks } from '../../hydrate';


// a hand-built cell, as hydrate would make it
function cell(html: string, align: ICell['align'], extra: Partial<ICell> = {}): ICell {
    const chunks = html2Chunks(html);
    return { content: chunks.map(c => c.content).join(''), chunks, align, ...extra };
}

function retrieveExpected(name: string): any {
    const filePath = path.join(__dirname, 'data', `${ name }.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// the lines of the table itself (those beginning with a pipe)
function tableLines(md: string): Array<string> {
    return md.split('\n').filter((line) => line.startsWith('|'));
}

// a row's cells, split at its unescaped pipes
function cellsOf(line: string): Array<string> {
    return line.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim());
}

function text(paragraphs: Array<IParagraph>, extra: Partial<IText> = {}): IText {
    return { type: 'text', paragraphs, ...extra };
}

describe('markdownify tables', () => {

    for (const name of ['anova-table', 'descriptives-table', 'corr-matrix']) {
        it(`produces a gfm table for ${ name }`, () => {
            const table = retrieveExpected(name) as ITable;
            const md = markdownify(table);
            expect(md.startsWith(`**${ table.title }**\n\n`)).toBe(true);
            const lines = tableLines(md);
            const nBody = table.rows.filter((r) => r.type === 'body').length;
            // a header, the rule beneath it, and the body
            expect(lines.length).toBe(nBody + 2);
            expect(lines[1]).toMatch(/^\|( :?-+:? \|)+$/);
            for (const line of lines)
                expect(cellsOf(line).length).toBe(table.nCols);
        });
    }

    it('aligns columns as their body cells are, and pads them to line up', () => {
        const md = markdownify(retrieveExpected('anova-table') as ITable);
        const lines = tableLines(md);
        expect(cellsOf(lines[1])[0]).toMatch(/^:-+$/);   // the row names, on the left
        expect(cellsOf(lines[1])[1]).toMatch(/^-+:$/);   // the values, on the right
        const widths = lines.map((line) => [ ...line ].length);
        expect(new Set(widths).size).toBe(1);
    });

    it('folds super titles into the column titles beneath them', () => {
        const table: ITable = {
            type: 'table',
            title: 'Estimates',
            nCols: 3,
            rows: [
                { type: 'superTitle', cells: [ null, cell('95% CI', 'c', { colSpan: 2 }), cell('95% CI', 'c', { colSpan: 0 }) ] },
                { type: 'title', cells: [ cell('Estimate', 'c'), cell('Lower', 'c'), cell('Upper', 'c') ] },
                { type: 'body', cells: [ cell('1.0', 'r'), cell('0.5', 'r'), cell('1.5', 'r') ] },
            ],
        };
        const header = cellsOf(tableLines(markdownify(table))[0]);
        expect(header).toEqual([ 'Estimate', '95% CI Lower', '95% CI Upper' ]);
    });

    it('shows a cell spanning down once, at the top', () => {
        const table: ITable = {
            type: 'table',
            title: 'T',
            nCols: 2,
            rows: [
                { type: 'title', cells: [ cell('', 'c'), cell('x', 'c') ] },
                { type: 'body', cells: [ cell('len', 'l', { rowSpan: 2 }), cell('1', 'r') ] },
                { type: 'body', cells: [ cell('len', 'l', { rowSpan: 0 }), cell('2', 'r') ] },
            ],
        };
        const lines = tableLines(markdownify(table));
        expect(cellsOf(lines[2])[0]).toBe('len');
        expect(cellsOf(lines[3])[0]).toBe('');
    });

    it('adds footnote markers and symbols, and the notes beneath', () => {
        const table: ITable = {
            type: 'table',
            title: 'A table',
            nCols: 2,
            rows: [
                { type: 'title', cells: [ cell('p<sub>tukey</sub>', 'c'), cell('η²', 'c') ] },
                { type: 'body', cells: [ cell('< .001', 'r', { sups: [ '<sup>a</sup>' ] }), cell('0.578', 'r', { sups: [ '***', '<sup>μ</sup>' ] }) ] },
                { type: 'footnote', cells: [ cell('Some note', 'l', { sups: [ 'note' ] }) ] },
                { type: 'footnote', cells: [ cell('specific', 'l', { sups: [ '<sup>a</sup>' ] }) ] },
            ],
        };
        const md = markdownify(table);
        const lines = tableLines(md);
        // no unicode subscript for 'y', so it's written out
        expect(cellsOf(lines[0])).toEqual([ 'p_tukey', 'η²' ]);
        expect(cellsOf(lines[2])).toEqual([ '< .001ᵃ', '0.578***^μ' ]);
        expect(md).toContain('\n\n*Note.* Some note\n\nᵃ specific');
    });

    it('escapes pipes and newlines within a cell', () => {
        const table: ITable = {
            type: 'table',
            title: 'T',
            nCols: 1,
            rows: [
                { type: 'title', cells: [ cell('a | b', 'c') ] },
                { type: 'body', cells: [ { content: 'one\ntwo', chunks: [ { content: 'one\ntwo' } ], align: 'l' } ] },
            ],
        };
        const lines = tableLines(markdownify(table));
        expect(cellsOf(lines[0])).toEqual([ 'a \\| b' ]);
        expect(cellsOf(lines[2])).toEqual([ 'one two' ]);
    });
});

describe('markdownify other elements', () => {

    it('gives groups headings, nested a level beneath their parent', () => {
        const md = markdownify({
            type: 'group',
            title: 'Analysis',
            items: [ { type: 'group', title: 'Inner', items: [ text([ { chunks: [ { content: 'hi' } ] } ]) ] } ],
        });
        expect(md).toBe('# Analysis\n\n## Inner\n\nhi');
    });

    it('marks an image by its title', () => {
        const md = markdownify({ type: 'image', title: 'Descriptives Plot', path: 'data:image/png;base64,AAAA', width: 1, height: 1, address: 'a' });
        expect(md).toBe('*[Descriptives Plot]*');
    });

    it('fences preformatted text, and leaves out syntax unless shown', () => {
        const syntax = { type: 'preformatted' as const, content: 'jmv::ttestIS(\n    data = data)\n', syntax: true };
        expect(markdownify(syntax)).toBe('');
        expect(markdownify(syntax, { showSyntax: true })).toBe('```\njmv::ttestIS(\n    data = data)\n```');
        const code = { type: 'preformatted' as const, content: 'a ``` b', syntax: false };
        expect(markdownify(code)).toBe('````\na ``` b\n````');
    });

    it('renders inline formatting', () => {
        const md = markdownify(text([ { chunks: html2Chunks('<strong>bold </strong>and <em>italic</em>, <s>gone</s>, <code>x_1</code> and <a href="https://jamovi.org">a link</a>') } ]));
        expect(md).toBe('**bold** and *italic*, ~~gone~~, `x_1` and [a link](https://jamovi.org)');
    });

    it('escapes markdown in text, but not underscores within words', () => {
        const md = markdownify(text([ { chunks: [ { content: '*stars* [x] snake_case _y_ <b>' } ] } ]));
        expect(md).toBe('\\*stars\\* \\[x\\] snake_case \\_y\\_ \\<b>');
        expect(markdownify(text([ { chunks: [ { content: '# not a heading' } ] } ]))).toBe('\\# not a heading');
        expect(markdownify(text([ { chunks: [ { content: '1. not a list' } ] } ]))).toBe('1\\. not a list');
    });

    it('produces lists, nested by indent, and code blocks', () => {
        const md = markdownify(text([
            { chunks: [ { content: 'one' } ], attributes: { list: 'ordered' } },
            { chunks: [ { content: 'nested' } ], attributes: { list: 'bullet', indent: 1 } },
            { chunks: [ { content: 'two' } ], attributes: { list: 'ordered' } },
            { chunks: [ { content: 'x <- 1' } ], attributes: { codeBlock: true } },
            { chunks: [ { content: 'y <- 2' } ], attributes: { codeBlock: true } },
            { chunks: [ { content: 'Heading' } ], attributes: { header: 1 } },
        ]), { level: 2 });
        expect(md).toBe('1. one\n    - nested\n2. two\n\n```\nx <- 1\ny <- 2\n```\n\n## Heading');
    });

    it('puts a notice in a blockquote, with its title', () => {
        const md = markdownify(text([ { chunks: [ { content: 'first' } ] }, { chunks: [ { content: 'second' } ] } ], { box: 2, title: 'Warning' }));
        expect(md).toBe('> **Warning**\n>\n> first\n>\n> second');
    });
});

describe('createDoc', () => {

    const table = (): ITable => ({
        type: 'table',
        title: 'T',
        nCols: 1,
        rows: [ { type: 'body', cells: [ cell('1', 'r') ] } ],
        refs: [ jmv.name ],
    });

    it('numbers the references, and lists them at the end', () => {
        const md = createDoc([ { element: table() } ], { references: [ R, jmv ] });
        expect(md).toContain('\n\n[2]\n\n# References\n\n[1] ');
        expect(md.split('\n').filter((line) => /^\[\d\] /.test(line)).length).toBe(2);
    });

    it('leaves out the references when hidden', () => {
        const md = createDoc([ { element: table() } ], { references: [ R, jmv ], showRefs: false });
        expect(md).not.toContain('References');
        expect(md).not.toContain('[2]');
    });
});
