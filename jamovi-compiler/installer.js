
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const child_process = require('child_process');

const isJExe = function(exe) {
    return fs.existsSync(exe) && fs.statSync(exe).isFile();
};

const find = function(jamovi_home) {

    let exe;

    if (jamovi_home === 'flatpak') {
        return 'flatpak run org.jamovi.jamovi'
    }

    if (jamovi_home !== undefined) {
        jamovi_home = path.resolve(jamovi_home);
        exe = path.join(jamovi_home, 'jamovi');
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home, 'jamovi.exe');
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home, 'bin', 'jamovi');
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home, 'bin', 'jamovi.exe');
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home, 'Contents', 'MacOS', 'jamovi')
        if (isJExe(exe))
            return exe;
        exe = path.join(jamovi_home + '.app', 'Contents', 'MacOS', 'jamovi')
        if (isJExe(exe))
            return exe;
        throw 'jamovi could not be found at: ' + jamovi_home;
    }

    if (process.platform === 'darwin') {
        exe = '/Applications/jamovi.app/Contents/MacOS/jamovi';
        if (isJExe(exe))
            return exe;
    }

    if (process.platform === 'win32') {

    }

    if (process.platform === 'linux') {
        exe = '/usr/lib/jamovi/bin/jamovi';
        if (isJExe(exe))
            return exe;
        exe = '/usr/bin/jamovi';
        if (isJExe(exe))
            return exe;

    }

    throw 'jamovi could not be found!';
};

const check = function(jamovi_home) {

    let exe;
    let args;

    if (jamovi_home === 'flatpak') {
        exe = '/usr/bin/flatpak';
        args = [ 'run', 'org.jamovi.jamovi', '--version' ];
    }
    else {
        exe = find(jamovi_home);
        args = [ '--version' ];
    }

    let response = child_process.spawnSync(
        exe,
        args,
        {
            stdio: [ 'ignore', 'pipe', 'inherit' ],
            encoding: 'utf-8'
        });

    if (response.stdout === null) {
        throw 'jamovi did not respond';
    }
    else {
        let match = response.stdout.match('^\r?\n?([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)\r?\n');

        if (match) {

            let mas = parseInt(match[1]);
            let maj = parseInt(match[2]);
            let min = parseInt(match[3]);
            let rev = parseInt(match[4]);

            if (mas < 1 || (mas === 1 && maj < 1))
                throw 'a newer version of jamovi is required, please update to the newest version';
            if (mas > 2 || (mas === 2 && maj > 7))
                throw 'a newer version of the jamovi-compiler (or jmvtools) is required';

            if (process.platform === 'darwin') {
                let m = exe.match(/^(.+)\/Contents\/MacOS\/jamovi$/);
                if (m)
                    console.log(`jamovi ${ mas }.${ maj }.${ min } found at ${ m[1] }`);
                else
                    console.log(`jamovi ${ mas }.${ maj }.${ min } found at ${ exe }`);
            }
            else {
                console.log(`jamovi ${ mas }.${ maj }.${ min } found at ${ exe }`);
            }

            return `${ mas }.${ maj }.${ min }`;
        }
        else {
            console.log(response.stdout + '\n')
            throw 'jamovi could not be accessed';
        }
    }
};


const install = function(pth, jamovi_home) {

    let cmd;
    if (jamovi_home === 'flatpak')
        cmd = util.format('/usr/bin/flatpak run org.jamovi.jamovi --install "%s"', pth);
    else
        cmd = util.format('"%s" --install "%s"', find(jamovi_home), pth);

    console.log('Installing ' + pth);

    try {
        child_process.execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
        console.log('Module installed successfully');
    }
    catch (e) {
        console.log(e)
        throw 'Could not install module';
    }
};

module.exports = { find, check, install };
