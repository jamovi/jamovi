
'use strict';

const run  = require('./utils').run;
const file = require('./utils').file;
const clone = require('./utils').clone;
const unclone = require('./utils').unclone;

const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');

describe('Should work with correct inputs:', () => {

    let wd = path.join(__dirname, '010-works');

    it('should display usage information', () => {
        let res = run();
        assert.equal(res.stdout, file('010-works/usage.txt'));
        assert.equal(res.stderr, '');
        assert.equal(res.status, 0);
    });

    it('should prepare successfully', () => {
        let copy = clone('new', wd);
        let res = run('--prepare ' + copy);
        assert.equal(res.stderr, '');
        assert.equal(res.status, 0);
        assert(fs.existsSync(copy + '/jamovi'));

        unclone('new', wd);
    });

    it('should build successfully', () => {
        fs.removeSync('new.jmo');
        let copy = clone('new', wd);

        let res = run('--build ' + copy);
        assert.equal(res.stderr, '');
        assert.equal(res.status, 0);
        assert(fs.existsSync(copy + '/build/R/new'));
        assert(fs.existsSync('new.jmo'));

        fs.removeSync('new.jmo');
        unclone('new', wd);
    });
});
