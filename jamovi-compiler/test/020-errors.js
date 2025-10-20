
'use strict';

const run  = require('./utils').run;
const file = require('./utils').file;
const clone = require('./utils').clone;
const unclone = require('./utils').unclone;

const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');

describe('Should error with bad inputs:', () => {

    let wd = path.join(__dirname, '020-errors');

    it('should error with a non-existant path', () => {
        let res = run('--prepare something-which-doesnt-exist', wd);
        assert(res.stderr.match(/path '.*' does not exist/));
        assert.equal(res.status, 1);
    });

    it('should error with no DESCRIPTION file', () => {
        let res = run('--prepare 010-empty-dir', wd);
        assert.equal(res.stderr,
`DESCRIPTION file could not be found

Is the path specified an R/jamovi package?`);
        assert.equal(res.status, 1);
    });

    it('should error with no name', () => {
        let res = run('--prepare 020-no-name', wd);
        assert.equal(res.stderr, 'DESCRIPTION file does not contain a package name');
        assert.equal(res.status, 1);
    });

    it('should error with no description', () => {
        let res = run('--prepare 021-no-description', wd);
        assert.equal(res.stderr, 'DESCRIPTION file does not contain a description (irony much?)');
        assert.equal(res.status, 1);
    });

    it("should error with can't install", function() {
        this.timeout(60000);

        clone('030-cant-install', wd)

        let res = run('--build 030-cant-install.copy', wd);
        assert.equal(res.stderr, 'Could not build module');
        assert.equal(res.status, 1);

        unclone('030-cant-install', wd)
    });
});
