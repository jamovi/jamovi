// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';

import { latexify } from '../../latexify';
import { ITable, ICell, html2Chunks } from '../../hydrate';


// a hand-built cell, as hydrate would make it
function cell(html: string, align: ICell['align'], extra: Partial<ICell> = {}): ICell {
    const chunks = html2Chunks(html);
    return { content: chunks.map(c => c.content).join(''), chunks, align, ...extra };
}

describe('latexify tables', () => {

    it('superscripts a footnote letter, and renders a symbol exactly as given', () => {
        // hydrate.ts marks a footnote letter up itself ('<sup>a</sup>'), but
        // a symbol is already whatever it needs to be: plain ('*', or a
        // unicode superscript like '⁻'), or its own markup (jmv's
        // '<sup>μ</sup>' for linreg's estimated marginal means) --
        // neither should be superscripted again (cf. htmlify.ts, docxify.ts)
        const table: ITable = {
            type: 'table',
            title: 'A table',
            nCols: 1,
            rows: [
                { type: 'title', cells: [ cell('x', 'c') ] },
                { type: 'body', cells: [ cell('1.23', 'r', { sups: [ '*', '<sup>μ</sup>' ] }) ] },
                { type: 'body', cells: [ cell('< .001', 'r', { sups: [ '<sup>a</sup>' ] }) ] },
                { type: 'footnote', cells: [ cell('specific', 'l', { sups: [ '<sup>a</sup>' ] }) ] },
            ],
        };
        const tex = latexify(table);
        expect(tex).toContain('1.23*$^{\\mu}$');  // '*' stays plain, unlike the footnote letter below
        expect(tex).toContain('< .001$^{a}$');
        expect(tex).toContain('$^{a}$~specific');
    });
});
