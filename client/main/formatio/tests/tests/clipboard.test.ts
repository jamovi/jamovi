// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';

import { clipboardData, clipboardDocData, clipboardFlavours, IClipboardData } from '../../clipboard';
import { jmv, R } from '../../../references';
import { IElement, IImage, ITable, IPreformatted, IGroup, ICell, html2Chunks } from '../../hydrate';

// the flavours each kind of copy is expected to have. these are as they were
// at cd340f35 (where the results view built them, cf. resultsview/main.ts's
// getcontent), except where noted:
//
//   an analysis, group, table, text  html + text
//   syntax                           text (now html too, see below)
//   a raster Image                   html + image
//   a vector Image                   html + image + svg
//   an Svg element                   html + image (its svg isn't offered)
//   the whole document               html (now text too, see below)
//
// the text was the elements' text nodes, one per line; it's now markdown

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';

function cell(html: string, align: ICell['align']): ICell {
    const chunks = html2Chunks(html);
    return { content: chunks.map(c => c.content).join(''), chunks, align };
}

function image(): IImage {
    return { type: 'image', title: 'Descriptives Plot', path: null, width: 400, height: 300, address: 'plot' };
}

function table(): ITable {
    return {
        type: 'table',
        title: 'Descriptives',
        nCols: 2,
        rows: [
            { type: 'title', cells: [ null, cell('len', 'c') ] },
            { type: 'body', cells: [ cell('N', 'l'), cell('60', 'r') ] },
        ],
    };
}

function syntax(): IPreformatted {
    return { type: 'preformatted', title: 'Syntax', content: 'jmv::descriptives(\n    data = data,\n    vars = len)', syntax: true };
}

function analysis(): IGroup {
    return { type: 'group', title: 'Descriptives', items: [ table(), image() ] };
}

// what's being copied, hydrated both ways (they're the same here, there
// being no Html results)
function copy(element: () => IElement, rendered: Parameters<typeof clipboardData>[2] = null, options = {}): IClipboardData {
    return clipboardData(element(), element(), rendered, options);
}

function flavours(data: IClipboardData): Array<string> {
    return Object.keys(data).sort();
}

describe('copying an image', () => {

    it('offers a raster Image as html and a png', () => {
        const data = copy(image, { image: PNG });
        expect(flavours(data)).toEqual([ 'html', 'image' ]);
        expect(data.image).toBe(PNG);
        // the html carries the same png, as a data uri
        const doc = new DOMParser().parseFromString(data.html!, 'text/html');
        expect(doc.querySelector('img')!.getAttribute('src')).toBe(PNG);
    });

    it('offers a vector Image as its svg too', () => {
        const data = copy(image, { image: PNG, svg: SVG, vector: true });
        expect(flavours(data)).toEqual([ 'html', 'image', 'svg' ]);
        expect(data.svg).toBe(SVG);
    });

    it('offers an Svg element as html and a png only', () => {
        // the results view gives its svg, but it isn't a vector Image
        const data = copy(image, { image: PNG, svg: SVG });
        expect(flavours(data)).toEqual([ 'html', 'image' ]);
    });

    it('has no text flavour, so it pastes as the image', () => {
        // (bf31e3e7 offered the html as the text, and no png, so chat apps
        // pasted the raw html, or just the title)
        expect(copy(image, { image: PNG }).text).toBeUndefined();
    });

    it('offers only the html when the image isn\'t rendered', () => {
        // (it may be hidden.) the png's key must be absent, not undefined:
        // electron's handler tests for 'image' in it
        const data = copy(image, { });
        expect(flavours(data)).toEqual([ 'html' ]);
        expect('image' in data).toBe(false);
    });
});

describe('copying other elements', () => {

    it('offers a table as html and text', () => {
        const data = copy(table);
        expect(flavours(data)).toEqual([ 'html', 'text' ]);
        expect(data.html).toContain('<table');
    });

    it('offers an analysis as html and text', () => {
        const data = copy(analysis, null);
        expect(flavours(data)).toEqual([ 'html', 'text' ]);
    });

    it('gives markdown as the text, not the html', () => {
        // (bf31e3e7 offered the html as the text too)
        const data = copy(analysis);
        expect(data.text).not.toContain('<');
        expect(data.text!.startsWith('# Descriptives\n\n**Descriptives**\n\n| ')).toBe(true);
        // an image within it is marked by its title
        expect(data.text).toContain('*[Descriptives Plot]*');
    });

    it('offers syntax as its plain text', () => {
        // differs from cd340f35, which offered no html for syntax. since
        // 7b3c670a it's in the html too, as a <pre>
        const data = copy(syntax, null, { showSyntax: true });
        expect(data.text).toBe(syntax().content);
        expect(data.html).toContain('<pre');
    });
});

describe('copying the whole document', () => {

    const items = () => [ { element: analysis(), level: 1 } ];

    it('offers html and text', () => {
        // differs from cd340f35, which offered only the html
        const data = clipboardDocData(items(), items(), { references: [ R, jmv ] });
        expect(flavours(data)).toEqual([ 'html', 'text' ]);
        expect(data.text).toContain('# References');
    });

    it('leaves out the references when they\'re hidden', () => {
        const data = clipboardDocData(items(), items(), { references: [ R, jmv ], showRefs: false });
        expect(data.text).not.toContain('# References');
        expect(data.html).not.toContain('References');
    });
});

describe('clipboard flavours', () => {

    it('maps each to its mime type', () => {
        const data = { html: '<p>x</p>', text: 'x', image: PNG, svg: SVG };
        expect(clipboardFlavours(data, true)).toEqual({
            'text/html': '<p>x</p>',
            'text/plain': 'x',
            'image/png': PNG,
            'image/svg+xml': SVG,
        });
    });

    it('leaves out the svg where the clipboard can\'t take it', () => {
        const data = { html: '<p>x</p>', image: PNG, svg: SVG };
        expect(Object.keys(clipboardFlavours(data, false)).sort()).toEqual([ 'image/png', 'text/html' ]);
    });

    it('leaves out what\'s empty', () => {
        expect(clipboardFlavours({ html: '', text: 'x' }, true)).toEqual({ 'text/plain': 'x' });
    });
});
