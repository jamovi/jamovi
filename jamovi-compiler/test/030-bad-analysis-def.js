
'use strict';

const run  = require('./utils').run;
const setwd = require('./utils').setwd;
const clone = require('./utils').clone;
const unclone = require('./utils').unclone;

const assert = require('assert');
const path = require('path');
const fs = require('fs-extra');

describe('Should error with bad a.yaml:', () => {

    let wd = path.join(__dirname, '030-bad-analysis-def');

    it('should error with malformed yaml', () => {
        clone('010-bad-a-yaml', wd)

        let res = run('--prepare 010-bad-a-yaml.copy', wd);
        assert(res.stderr.startsWith("Unable to compile 'badayaml.a.yaml'"));
        assert.equal(res.status, 1);

        unclone('010-bad-a-yaml', wd)
    });

    it('should error with missing name', () => {
        clone('020-missing-name', wd)

        let res = run('--prepare 020-missing-name.copy', wd);
        assert.equal(res.stderr,
`Unable to compile 'badayaml.a.yaml':
	analysis.name does not match pattern "^[A-Za-z][A-Za-z0-9]*$"
	analysis.version does not match pattern "^[0-9]+\\\\.[0-9]+\\\\.[0-9]+$"
	analysis requires property "menuGroup"`);
        assert.equal(res.status, 1);

        unclone('020-missing-name', wd)
    });
});
