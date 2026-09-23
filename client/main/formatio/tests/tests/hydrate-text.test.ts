// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';

import { hydrate, IText, IGroup, ITable, IVerbatimHtml } from '../../hydrate';

// an annotation (a quill delta) is hydrated as the text above an element;
// an empty group is the simplest thing to hang one off
function fromDelta(ops: Array<any>): IText {
    const pb = { name: 'g', title: 'G', visible: 0, group: { elements: [] } };
    return hydrate(pb, { values: { 'results//topText': { ops } } }) as IText;
}

describe('hydration of annotations (quill deltas)', () => {

    it('splits lines into paragraphs, with inline formatting on chunks', () => {
        const text = fromDelta([
            { insert: 'plain ' },
            { insert: 'bold', attributes: { bold: true } },
            { insert: '\nsecond\n' },
        ]);
        expect(text.paragraphs).toEqual([
            { chunks: [ { content: 'plain ' }, { content: 'bold', attributes: { bold: true } } ] },
            { chunks: [ { content: 'second' } ] },
        ]);
    });

    it('takes paragraph formatting from the newline that ends the line', () => {
        const text = fromDelta([
            { insert: 'A heading' },
            { insert: '\n', attributes: { header: 2 } },
            { insert: 'one' },
            { insert: '\n', attributes: { list: 'ordered' } },
            { insert: 'nested' },
            { insert: '\n', attributes: { list: 'ordered', indent: 1 } },
            { insert: 'x <- 1' },
            { insert: '\n', attributes: { 'code-block': true } },
            { insert: 'centred' },
            { insert: '\n', attributes: { align: 'center', direction: 'ltr' } },
        ]);
        expect(text.paragraphs.map(p => p.attributes)).toEqual([
            { header: 1 },  // quill's h2, relative to the analysis
            { list: 'ordered' },
            { list: 'ordered', indent: 1 },
            { codeBlock: true },
            { align: 'center' },
        ]);
    });

    it("doesn't record the default alignment", () => {
        const text = fromDelta([ { insert: 'a' }, { insert: '\n', attributes: { align: 'start' } } ]);
        expect(text.paragraphs[0].attributes).toBeUndefined();
    });

    it("adds a scheme to a link typed without one (the link dialog doesn't require it)", () => {
        const text = fromDelta([
            { insert: 'jamovi', attributes: { link: 'www.jamovi.org' } },
            { insert: '\n' },
        ]);
        expect(text.paragraphs[0].chunks).toEqual([
            { content: 'jamovi', attributes: { link: 'https://www.jamovi.org' } },
        ]);
    });

    it('keeps blank lines, and embeds formulas as chunks', () => {
        const text = fromDelta([
            { insert: 'a\n\n' },
            { insert: { formula: 'x^2' } },
            { insert: '\n' },
        ]);
        expect(text.paragraphs).toEqual([
            { chunks: [ { content: 'a' } ] },
            { chunks: [] },
            { chunks: [ { content: 'x^2', attributes: { formula: true } } ] },
        ]);
    });
});

describe('hydration of html and markdown elements', () => {

    it('begins a paragraph at each block element', () => {
        const text = hydrate({ name: 'h', visible: 0, html: { content:
            '<h3>Title</h3>\n<p>Some <em>italic</em> and <a href="https://x.y/?a=1&amp;b=2">a link</a>.</p>\n<ul><li>one</li><li>two</li></ul>'
        } }) as IText;
        expect(text.paragraphs).toEqual([
            { chunks: [ { content: 'Title' } ], attributes: { header: 3 } },
            { chunks: [
                { content: 'Some ' },
                { content: 'italic', attributes: { italic: true } },
                { content: ' and ' },
                { content: 'a link', attributes: { link: 'https://x.y/?a=1&b=2' } },
                { content: '.' },
            ] },
            { chunks: [ { content: 'one' } ], attributes: { list: 'bullet' } },
            { chunks: [ { content: 'two' } ], attributes: { list: 'bullet' } },
        ]);
    });

    it('hydrates a markdown text element the same way', () => {
        const text = hydrate({ name: 't', visible: 0, text: '## Heading\n\nA **bold** word.\n\n1. first\n2. second\n' }) as IText;
        // richMarkdown() strips headings, as the live view does
        expect(text.paragraphs[0]).toEqual({ chunks: [ { content: 'Heading' } ] });
        expect(text.paragraphs[1].chunks).toEqual([ { content: 'A ' }, { content: 'bold', attributes: { bold: true } }, { content: ' word.' } ]);
        expect(text.paragraphs.slice(2).map(p => p.attributes)).toEqual([ { list: 'ordered' }, { list: 'ordered' } ]);
    });

    it('adds a scheme to an html link typed without one, but leaves a fragment or root-relative path alone', () => {
        const text = hydrate({ name: 'h', visible: 0, html: { content:
            '<p><a href="www.jamovi.org">a</a> <a href="#x">b</a> <a href="/x">c</a> <a href="mailto:x@y.z">d</a></p>'
        } }) as IText;
        expect(text.paragraphs[0].chunks).toEqual([
            { content: 'a', attributes: { link: 'https://www.jamovi.org' } },
            { content: ' ' },
            { content: 'b', attributes: { link: '#x' } },
            { content: ' ' },
            { content: 'c', attributes: { link: '/x' } },
            { content: ' ' },
            { content: 'd', attributes: { link: 'mailto:x@y.z' } },
        ]);
    });

    it('treats text with no block wrapper as one paragraph', () => {
        const text = hydrate({ name: 'h', visible: 0, html: { content: '<strong>Note:</strong> p < .05' } }) as IText;
        expect(text.paragraphs).toEqual([
            { chunks: [ { content: 'Note:', attributes: { bold: true } }, { content: ' p < .05' } ] },
        ]);
    });
});

// an Html result's <table> (e.g. from R's gt/gtsummary) used to be flattened
// into disconnected lines of text, losing its structure entirely (issue
// #1867); it's now kept as a real ITable, so it survives copy/export
describe('hydration of html tables', () => {

    it('keeps a plain table as an ITable, rather than flattening it into text', () => {
        const table = hydrate({ name: 'h', visible: 0, html: { content:
            '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
            '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
        } }) as ITable;
        expect(table.type).toBe('table');
        expect(table.nCols).toBe(2);
        expect(table.rows.map(r => r.type)).toEqual([ 'title', 'body' ]);
        expect(table.rows[0].cells.map(c => c && c.content)).toEqual([ 'A', 'B' ]);
        expect(table.rows[1].cells.map(c => c && c.content)).toEqual([ '1', '2' ]);
    });

    it('wraps text and a table together in a group, when both are present', () => {
        const group = hydrate({ name: 'h', visible: 0, html: { content:
            '<p>Some text</p><table><tr><td>x</td></tr></table>'
        } }) as IGroup;
        expect(group.type).toBe('group');
        expect(group.title).toBeUndefined();
        expect(group.items.map(i => i.type)).toEqual([ 'text', 'table' ]);
    });

    it('honours colspan, spreading it across covered columns (colSpan 0)', () => {
        const table = hydrate({ name: 'h', visible: 0, html: { content:
            '<table><tr><th colspan="2">Group</th></tr><tr><td>a</td><td>b</td></tr></table>'
        } }) as ITable;
        expect(table.nCols).toBe(2);
        expect(table.rows[0].cells).toEqual([
            { content: 'Group', chunks: [ { content: 'Group' } ], align: 'c', colSpan: 2 },
            { content: 'Group', chunks: [ { content: 'Group' } ], align: 'c', colSpan: 0 },
        ]);
    });

    it('honours rowspan, marking the covered rows below (rowSpan 0)', () => {
        const table = hydrate({ name: 'h', visible: 0, html: { content:
            '<table><tr><td rowspan="2">x</td><td>1</td></tr><tr><td>2</td></tr></table>'
        } }) as ITable;
        expect(table.nCols).toBe(2);
        expect(table.rows[0].cells[0]).toEqual({ content: 'x', chunks: [ { content: 'x' } ], align: 'l', rowSpan: 2 });
        expect(table.rows[1].cells[0]).toEqual({ content: 'x', chunks: [ { content: 'x' } ], align: 'l', rowSpan: 0 });
        expect(table.rows[1].cells[1]).toEqual({ content: '2', chunks: [ { content: '2' } ], align: 'l' });
    });

    it('is passed through verbatim instead, when verbatimHtml is requested', () => {
        const content = '<table class="gt_table"><tr><td style="color:red">x</td></tr></table>';
        const raw = hydrate({ name: 'h', visible: 0, html: { content } }, { verbatimHtml: true }) as IVerbatimHtml;
        expect(raw).toEqual({ type: 'html', content });
    });
});
