// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';

import { hydrate, IText } from '../../hydrate';

// an annotation (a quill delta) is hydrated as the text above an element;
// an empty group is the simplest thing to hang one off
function fromDelta(ops: Array<any>): IText {
    const pb = { name: 'g', title: 'G', visible: 0, group: { elements: [] } };
    return hydrate(pb, [], { 'results//topText': { ops } }) as IText;
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

    it('treats text with no block wrapper as one paragraph', () => {
        const text = hydrate({ name: 'h', visible: 0, html: { content: '<strong>Note:</strong> p < .05' } }) as IText;
        expect(text.paragraphs).toEqual([
            { chunks: [ { content: 'Note:', attributes: { bold: true } }, { content: ' p < .05' } ] },
        ]);
    });
});
