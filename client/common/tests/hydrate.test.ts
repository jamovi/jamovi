
import path from 'path';
import fs from 'fs';

import { describe, it } from 'vitest';
import { expect } from 'chai';

import ProtoBuf from 'protobufjs';

import { hydrate } from '../hydrate';

const protoPath = path.join(__dirname, '../../assets/coms.proto');
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

describe('hydration of ANOVA results', function () {

    const expected = retrieveExpected('anova-results');
    const pb = retrievePB('anova-results');
    const hydrated = hydrate(pb);

    const json = JSON.stringify(hydrated, null, 2);
    console.log(json);
    //fs.writeFileSync('/Users/c3113592/Downloads/anova-results.json', json);

    it('should be correct', function () {
        expect(hydrated).to.be.deep.equal(expected)
    });
});
