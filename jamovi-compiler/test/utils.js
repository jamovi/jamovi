
'use strict';

const path = require('path');
const child = require('child_process');
const fs = require('fs-extra');

let main = path.join(__dirname, '..', 'index.js')
let exe = process.execPath

const clone = function(name, wd) {
    wd = wd || process.cwd();
    let fullPath = path.join(wd, name);
    let clonePath = fullPath + '.copy';
    fs.copySync(fullPath, clonePath);
    return clonePath;
};

const unclone = function(name, wd) {
    wd = wd || process.cwd();
    let fullPath = path.join(wd, name);
    let clonePath = fullPath + '.copy';
    fs.removeSync(clonePath);
};

const run = function(args, wd) {
    if (args === undefined)
        args = '';
    wd = wd || process.cwd();

    args = args.split(/\s+/g);
    args.unshift(main);

    let ret = child.spawnSync(exe, args, { encoding: 'utf-8', cwd: wd });

    ret.stdout = ret.stdout.split('\n').slice(3).join('\n').trim();
    ret.stderr = ret.stderr.trim();

    return {
        stdout: ret.stdout,
        stderr: ret.stderr,
        status: ret.status
    };
};

const file = function(where) {
    let fullPath = path.join(__dirname, where);
    return fs.readFileSync(fullPath, { encoding: 'utf-8' });
};

module.exports = { run, file, clone, unclone };
