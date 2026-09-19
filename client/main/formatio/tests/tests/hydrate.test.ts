// @vitest-environment jsdom


import path from 'path';
import fs from 'fs';

import { describe, it } from 'vitest';
import { expect } from 'chai';

import ProtoBuf from 'protobufjs';

import { hydrate } from '../../hydrate';

const protoPath = path.join(__dirname, '../../../../../server/jamovi/server/jamovi.proto');
const protoDefn = fs.readFileSync(protoPath);
const builder = ProtoBuf.loadProto(protoDefn);
const Messages = builder.build().jamovi.coms;


function retrievePB(name: string): any {
    const filePath = path.join(__dirname, 'data', `${ name }.bin`);
    const blob = fs.readFileSync(filePath);
    return Messages.ResultsElement.decode(blob);
}

function retrieveExpected(name: string): any {
    const filePath = path.join(__dirname, 'data', `${ name }.json`);
    return require(filePath);
}

describe('hydration of ANOVA table', function () {

    const expected = retrieveExpected('anova-table');
    const pb = retrievePB('anova-table');
    const hydrated = hydrate(pb);

    it('should be correct', function () {
        expect(hydrated).to.be.deep.equal(expected)
    });
});

describe('hydration of Descriptives table', function () {

    const expected = retrieveExpected('descriptives-table');
    const pb = retrievePB('descriptives-table');
    const hydrated = hydrate(pb);

    it('should be correct', function () {
        expect(hydrated).to.be.deep.equal(expected)
    });
});

describe('hydration of Correlation Matrix', function () {

    const expected = retrieveExpected('corr-matrix');
    const pb = retrievePB('corr-matrix');
    const hydrated = hydrate(pb);

    it('should be correct', function () {
        expect(hydrated).to.be.deep.equal(expected)
    });
});

// a hand-built table: super titles over plain and folded columns
function tablePB(columns: Array<{ name: string, superTitle?: string, values: Array<string> }>) {
    return {
        name: 'table',
        title: 'A table',
        visible: 0,
        table: {
            notes: [],
            columns: columns.map((column) => ({
                name: column.name,
                title: column.name,
                superTitle: column.superTitle || '',
                type: 'Text',
                format: '',
                visible: 0,
                combineBelow: false,
                cells: column.values.map((value) => ({ cellType: 's', s: value, footnotes: [], symbols: [], format: 0 })),
            })),
        },
    };
}

describe('hydration of cell text', function () {

    it('parses inline html into chunks, with the plain text alongside', function () {
        const pb = tablePB([ { name: 'p', values: ['< .001'] } ]);
        pb.table.columns[0].title = 'p<sub>tukey</sub>';
        const table: any = hydrate(pb);
        expect(table.rows[0].cells[0]).to.deep.equal({
            content: 'ptukey',
            chunks: [ { content: 'p' }, { content: 'tukey', attributes: { script: 'sub' } } ],
            align: 'c',
        });
        expect(table.rows[1].cells[0].content).to.equal('< .001');
        expect(table.rows[1].cells[0].chunks).to.deep.equal([ { content: '< .001' } ]);
    });
});

describe('hydration of super titles', function () {

    it('gives one entry per column, with covered columns spanned (colSpan 0)', function () {
        const pb = tablePB([
            { name: 'a', values: ['1'] },
            { name: 'b', superTitle: 'Group', values: ['2'] },
            { name: 'c', superTitle: 'Group', values: ['3'] },
            { name: 'd', values: ['4'] },
        ]);
        const table: any = hydrate(pb);
        const row = table.rows[0];
        expect(row.type).to.equal('superTitle');
        expect(row.cells).to.deep.equal([
            null,
            { content: 'Group', chunks: [ { content: 'Group' } ], colSpan: 2, align: 'c' },
            { content: 'Group', chunks: [ { content: 'Group' } ], colSpan: 0, align: 'c' },
            null,
        ]);
    });

    it('counts a span over folded columns after folding', function () {
        // est[a] and est[b] fold into one column 'est', so the span is 2, not 3
        const pb = tablePB([
            { name: 'name', values: ['x', 'x'] },
            { name: 'est[a]', superTitle: 'Estimate', values: ['1', '3'] },
            { name: 'est[b]', superTitle: 'Estimate', values: ['2', '4'] },
            { name: 'se', superTitle: 'Estimate', values: ['0.1', '0.2'] },
        ]);
        const table: any = hydrate(pb);
        expect(table.nCols).to.equal(3);
        expect(table.rows[0].cells).to.deep.equal([
            null,
            { content: 'Estimate', chunks: [ { content: 'Estimate' } ], colSpan: 2, align: 'c' },
            { content: 'Estimate', chunks: [ { content: 'Estimate' } ], colSpan: 0, align: 'c' },
        ]);
    });
});

describe('hydration of figures', function () {

    it('carries the resource path of an image', function () {
        const pb = { name: 'plot', title: 'A plot', image: { width: 500, height: 400, path: '3 anova/resources/plot.png' } };
        const image: any = hydrate(pb, [], {}, false, 3);
        expect(image).to.deep.equal({
            type: 'image', title: 'A plot', path: null, width: 500, height: 400,
            address: '3', resource: '3 anova/resources/plot.png',
        });
    });

    it('hydrates an svg element as an image of unknown size', function () {
        const pb = { name: 'plot', title: 'An svg', svg: { content: '<svg/>', scripts: [], stylesheets: [], path: '3 anova/resources/plot.svg' } };
        const image: any = hydrate(pb, [], {}, false, 3);
        expect(image).to.deep.equal({
            type: 'image', title: 'An svg', path: null, width: 0, height: 0,
            address: '3', resource: '3 anova/resources/plot.svg',
        });
    });

    it('leaves the resource off when the figure has not been rendered', function () {
        const image: any = hydrate({ name: 'plot', svg: { content: '', scripts: [], stylesheets: [], path: '' } });
        expect(image).to.not.have.property('resource');
    });
});
