// @vitest-environment jsdom

import path from 'node:path';
import fs from 'node:fs';

import { describe, it, expect } from 'vitest';

import { tableElement, tableSvg } from '../../imagify';
import { ITable } from '../../hydrate';

// (jsdom has no layout or canvas, so the drawing itself -- imagify() --
// can't be tested here; only the svg it draws)

function retrieveExpected(name: string): any {
    const filePath = path.join(__dirname, 'data', `${ name }.json`);
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

describe('imagify', () => {

    it('wraps the table in the page\'s look', () => {
        const table = retrieveExpected('anova-table') as ITable;
        const element = tableElement(table);
        expect(element.style.fontSize).toBe('12px');
        expect(element.style.backgroundColor).toBe('rgb(255, 255, 255)');
        // just the table -- not the empty paragraph htmlify follows it with
        expect(element.children.length).toBe(1);
        expect(element.firstElementChild!.tagName).toBe('TABLE');
    });

    it('makes the table a well-formed svg of the given size', () => {
        const table = retrieveExpected('descriptives-table') as ITable;
        const svg = tableSvg(tableElement(table), 320, 240);

        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        const root = doc.documentElement;
        expect(root.getAttribute('width')).toBe('320');
        expect(root.getAttribute('height')).toBe('240');

        // the table's within the <foreignObject>, as xhtml
        const foreign = root.getElementsByTagName('foreignObject')[0];
        expect(foreign.getAttribute('width')).toBe('320');
        const tables = foreign.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'table');
        expect(tables.length).toBe(1);
        expect(tables[0].textContent).toContain('Descriptives');
        expect(tables[0].textContent).toContain('Standard deviation');
    });

    it('escapes what isn\'t valid in xml', () => {
        const table: ITable = {
            type: 'table',
            title: 'A & B < C',
            nCols: 1,
            rows: [ { type: 'body', cells: [ { content: '< .001', chunks: [ { content: '< .001' } ], align: 'r' } ] } ],
        };
        const svg = tableSvg(tableElement(table), 100, 100);
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        expect(doc.querySelector('parsererror')).toBeNull();
        expect(doc.documentElement.textContent).toContain('A & B < C');
    });
});
