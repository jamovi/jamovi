// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';

import { hydrate, ITable, IText } from '../../hydrate';

// a results table, as the engine sends it (cf. jamovi.proto's ResultsTable).
// a cell is a string, a number (a double), or { i: n } (an integer)
function column(name: string, type: string, cells: Array<any>, extra: any = {}): any {
    return {
        name, title: name, type, format: '', superTitle: '', visible: 0,
        combineBelow: false, ...extra,
        cells: cells.map((value) => {
            if (typeof value === 'object')
                return { cellType: 'i', i: value.i, footnotes: [], symbols: [], format: 0 };
            const cellType = (typeof value === 'string') ? 's' : 'd';
            return { cellType, [cellType]: value, footnotes: [], symbols: [], format: 0 };
        }),
    };
}

function hydrateTable(columns: Array<any>): ITable {
    return hydrate({ name: 't', title: 'T', visible: 0, table: { columns, notes: [] } }) as ITable;
}

function bodyContents(table: ITable): Array<Array<string | null>> {
    return table.rows
        .filter((row) => row.type === 'body')
        .map((row) => row.cells.map((cell) => cell ? cell.content : null));
}

describe('hydration of tables', () => {

    it('formats a column to three significant figures, from its smallest value', () => {
        const table = hydrateTable([ column('x', 'number', [ 2426.43, 108.32 ]) ]);
        expect(bodyContents(table)).toEqual([ [ '2426' ], [ '108' ] ]);
    });

    it('shows integers as they are, whatever the column\'s format', () => {
        const table = hydrateTable([ column('x', 'number', [ { i: 60 }, 18.81 ]) ]);
        expect(bodyContents(table)).toEqual([ [ '60' ], [ '18.8' ] ]);
    });

    it('combines equal cells in a combineBelow column, when not folded', () => {
        const table = hydrateTable([
            column('a', 'text', [ 'x', 'x', 'y' ], { combineBelow: true }),
            column('b', 'number', [ 1.5, 2.5, 3.5 ]),
        ]);
        const spans = table.rows
            .filter((row) => row.type === 'body')
            .map((row) => row.cells[0]?.rowSpan);
        expect(spans).toEqual([ 2, 0, undefined ]);
    });

    it('puts an unfolded column in the first row of each fold', () => {
        const table = hydrateTable([
            column('a', 'text', [ 'x' ]),
            column('b[r]', 'number', [ 0.5 ]),
            column('b[p]', 'number', [ 0.25 ]),
        ]);
        expect(bodyContents(table)).toEqual([ [ 'x', '0.500' ], [ null, '0.250' ] ]);
    });

    it('begins a group with the first row of each fold, and ends it with the last', () => {
        const table = hydrateTable([
            column('b[r]', 'number', [ 0.5, 0.75 ]),
            column('b[s]', 'number', [ 0.1, 0.2 ]),
            column('b[p]', 'number', [ 0.25, 0.5 ]),
        ]);
        const formats = table.rows
            .filter((row) => row.type === 'body')
            .map((row) => row.cells[0]?.format);
        expect(formats).toEqual([ 1, undefined, 2, 1, undefined, 2 ]);
    });
});

describe('hydration of notices', () => {

    it('puts an error in a box of its own', () => {
        const text = hydrate({ name: 'n', title: 'Error', visible: 0, notice: { type: 0, content: 'Oops' } }) as IText;
        expect(text.box).toBe(4);
    });
});
