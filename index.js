#!/usr/bin/env node

'use strict';

console.log('\njamovi compiler\n');

require('log-node')();

const path = require('path');
const fs = require('fs-extra');
const browserify = require('browserify');
const yaml = require('js-yaml');
const JSZip = require('jszip');
const walkSync = require('walk-sync');
const CLA = require('command-line-args');
const needle = require('needle');
const Log = require('log');
const _ = require('underscore');
const child_process = require('child_process');

const ARGS = [
    { name: 'build',   alias: 'b', type: String },
    { name: 'prepare', alias: 'p', type: String },
    { name: 'install', alias: 'i', type: String },
    { name: 'check',   alias: 'c', type: Boolean },
    { name: 'home',  type: String },
    { name: 'rhome', type: String },
    { name: 'rlibs', type: String },
    { name: 'to',    type: String },
    { name: 'rpath', type: String },
    { name: 'debug', type: Boolean },
    { name: 'jmo',   type: String },
    { name: 'mirror', type: String },
    { name: 'patch-version', type: Boolean },
    { name: 'skip-remotes', type: Boolean },
    { name: 'skip-deps', type: Boolean },
    { name: 'i18n', type: String },
    { name: 'create', type: String },
    { name: 'update', type: String },
    { name: 'verbose', type: Boolean },
    { name: 'index', type: Number },
    { name: 'assume-app-version', type: String },
    { name: 'build-hash', type: String },
];

const temp = require('temp');
temp.track();

const compiler = require('./compiler');
const uicompiler = require('./uicompiler');
const compileR = require('./compilerr');
const parseR = require('./parser');
const utils = require('./utils');
const installer = require('./installer');
const sourcify = require('./sourcify');
const i18n = require('./i18n');

(async function() {

try {

    let usage = 'Usage:\n';
    usage += '    jmc --build path\n';
    usage += '    jmc --prepare path\n';
    usage += '    jmc --install path     [--home path]\n';
    usage += '    jmc --check            [--home path]\n';
    usage += '\n';
    usage += '    jmc --i18n path  --create code     [--verbose]\n';
    usage += '                     --update [code]   [--verbose]\n';

    let isBuilding = true;
    let isInstalling = false;
    let isInstallingTo = false;

    const args = CLA(ARGS);

    let log = require('log');

    let srcDir;
    let installDir;

    if (args.check) {
        installer.check(args.home);
        process.exit(0);
    }
    else if (args.install) {

        srcDir = args.install;

        if ( ! args.to) {
            isBuilding = true;
            isInstalling = true;
            isInstallingTo = false;
        }
        else {
            installDir = args.to;
            isBuilding = false;
            isInstalling = false;
            isInstallingTo = true;
        }
    }
    else if (args.build) {
        isBuilding = true;
        isInstallingTo = false;
        srcDir = args.build;
    }
    else if (args.prepare) {
        isBuilding = false;
        isInstallingTo = false;
        srcDir = args.prepare;
    }
    else if (args.i18n) {
        srcDir = args.i18n;
        srcDir = path.resolve(srcDir);
        if ( ! utils.exists(srcDir))
            throw "path '%s' does not exist\n".replace('%s', srcDir);

        let defDir = path.join(srcDir, 'jamovi');

        if (args.create === null) {
            throw `A language code has not been specified.
            Usage: jmc --i18n path  --create code`;
        }
        else if (args.create) {
            let code = args.create.toLowerCase();
            if (code === 'catalog')
                code = 'c';
            i18n.create(code, defDir, srcDir, args.verbose);
        }
        else if (args.update === null || args.update) {
            let code = null;
            if (args.update) {
                code = args.update.toLowerCase();
                if (code === 'catalog')
                    code = 'c';
            }
            i18n.update(code, defDir, srcDir, args.verbose);
        }
        else {
            i18n.list(defDir);
        }

        process.exit(0);
    }
    else {
        console.log(usage);
        process.exit(0);
    }

    let appVersion;
    if (args['assume-app-version'])
        appVersion = args['assume-app-version'];
    else
        appVersion = installer.check(args.home);

    let paths;
    let platName;

    if (process.platform === 'win32') {
        let exe = installer.find(args.home);
        let bin  = path.dirname(exe);
        let home = path.dirname(bin);
        let rHome = path.join(home, 'Frameworks', 'R');
        let rExe  = path.join(rHome, 'bin', 'x64', 'R.exe');
        let rLibs = `${ path.join(home, 'Resources', 'modules', 'base', 'R')}`;
        paths = { home, rHome, rExe, rLibs };
        platName = 'win64';
    }
    else if (process.platform === 'darwin') {
        let exe = installer.find(args.home);
        let bin  = path.dirname(exe);
        let home = path.dirname(bin);
        let rHome = path.join(home, 'Frameworks', 'R.framework', 'Versions', 'Current', 'Resources');
        const rExe = path.join(rHome, 'bin', 'R');
        let rLibs = `${ path.join(home, 'Resources', 'modules', 'base', 'R')}`;
        paths = { home, rHome, rExe, rLibs };
        platName = 'macos';
    }
    else if (args.home === 'flatpak') {
        let home = 'flatpak';
        let rHome = '/app/lib/R';
        let rLibs = '/app/lib/R/library:/app/lib/jamovi/modules/jmv/R';
        let rExe = 'flatpak" run --devel org.jamovi.jamovi "-R';
        paths = { home, rHome, rExe, rLibs };
        platName = 'linux';
    }
    else {
        let exe = installer.find(args.home);
        let bin  = path.dirname(exe);
        let home = path.dirname(bin);
        let rHome;
        if (args.rhome)
            rHome = args.rhome;
        else
            rHome = path.join(home, 'lib/R');
        let rExe = path.join(rHome, 'bin', 'R');
        let rLibs = '/usr/local/lib/R/library:/usr/lib/jamovi/modules/jmv/R';
        paths = { home, rHome, rExe, rLibs };
        platName = 'linux';
    }

    paths.rLibs += `${ path.delimiter }${ path.join(paths.home, 'Resources', 'modules', 'jmv', 'R')}`;

    if (args.rlibs)
        paths.rLibs = `${ args.rlibs }${ path.delimiter }${ paths.rLibs }`;

    let env = Object.assign({}, process.env);
    env['R_HOME'] = paths.rHome;

    let rVersionOutput;
    if (process.platform === 'win32') {
        // on windows, R outputs version, etc. stuff to stderr, which execSync doesn't catch
        // so we have to use spawnSync instead
        rVersionOutput = child_process.spawnSync(paths.rExe, ['--version'], { encoding: 'UTF-8', env: env }).stderr;
    }
    else {
        // on linux, we use 'flatpak org.jamovi.jamovi ....' as the cmd, which is why
        // i'm using execSync, rather than spawnSync
        let cmd = '"' + paths.rExe + '" --version'
        rVersionOutput = child_process.execSync(cmd, { encoding: 'UTF-8', env: env });
    }

    let rVersion = /^R version ([0-9]+\.[0-9]+\.[0-9]+)/.exec(rVersionOutput);
    let rArch = '';

    if (rVersion === null && process.platform === 'win32') {
        rVersion = [ undefined, '3.4.1' ];
    }

    if (rVersion === null)
        throw 'unable to determine R version';
    rVersion = rVersion[1];

    const versionParts = /^([0-9]+)\.([0-9]+)/.exec(rVersion);
    const versionAsInt = 100 * parseInt(versionParts[1]) + parseInt(versionParts[2]);

    let rVersionAndArch = rVersion;
    if (versionAsInt > 401) {  // R > 4.1
        let arch = /Platform: ([^-]+)/.exec(rVersionOutput)[1];
        if (arch === 'aarch64')
            rArch = 'arm64';
        else if (arch == 'x86_64')
            rArch = 'x64';
        rVersionAndArch = `${ rVersion }-${ rArch }`;
    }

    let mirror;
    let skipRemotes = args['skip-remotes'];

    if (args.mirror) {
        mirror = args.mirror;
    }

    srcDir = path.resolve(srcDir);

    if ( ! utils.exists(srcDir))
        throw "path '%s' does not exist\n".replace('%s', srcDir);

    if (isInstallingTo) {
        installDir = path.resolve(installDir);
        if ( ! utils.exists(installDir))
            throw "path '%s' does not exist\n".replace('%s', installDir);
    }

    let defDir = path.join(srcDir, 'jamovi');
    let rDir = path.join(srcDir, 'R');
    let jsBuildDir = path.join(srcDir, 'build', 'js');
    let jsSrcDir = path.join(defDir, 'js');
    let packageInfoPath = path.join(defDir, '0000.yaml');
    let refsPath = path.join(defDir, '00refs.yaml');

    let packageInfo;

    if (utils.exists(packageInfoPath)) {
        let content = fs.readFileSync(packageInfoPath);
        packageInfo = yaml.load(content);
        if ('jms' in packageInfo) {
            if (packageInfo.jms !== '1.0')
                throw 'this module requires a newer jmc';
        }
        else {
            packageInfo.jms = '1.0';
        }
    }
    else {
        packageInfo = parseR(srcDir);
    }

    if (args['patch-version'])
        packageInfo.version = appVersion;

    if ( ! ('usesNative' in packageInfo))
        packageInfo.usesNative = true;

    if ( ! ('minApp' in packageInfo))
        packageInfo.minApp = '1.0.8';

    const minAppAsArray = packageInfo.minApp.split('.').map(x => parseInt(x))
    const minAppAsInt = (10000 * minAppAsArray[0]) + 100 * (minAppAsArray[1] || 0) + (minAppAsArray[2] || 0)

    const appVersionAsArray = appVersion.split('.').map(x => parseInt(x))
    const appVersionAsInt = (10000 * appVersionAsArray[0]) + 100 * (appVersionAsArray[1] || 0) + (appVersionAsArray[2] || 0)

    if (minAppAsInt > appVersionAsInt)
        throw `This module requires a newer version of jamovi (minApp: ${ packageInfo.minApp } > ${ appVersion })`;

    if (args['build-hash'])
        packageInfo['build-hash'] = args['build-hash'];

    if (packageInfo.name === 'jmv')
        packageInfo.index = 0;
    else if (packageInfo.name === 'scatr')
        packageInfo.index = 1;
    else if (args.index)
        packageInfo.index = args.index;
    else
        delete packageInfo.index;

    let refs = undefined;
    if (utils.exists(refsPath)) {
        let content = fs.readFileSync(refsPath);
        refs = yaml.load(content).refs;
    }

    if ( ! utils.exists(defDir))
        fs.mkdirSync(defDir);

    if ( ! utils.exists(rDir))
        fs.mkdirSync(rDir);

    if (utils.exists(jsSrcDir)) {
        fs.removeSync(jsBuildDir);
        fs.copySync(jsSrcDir, jsBuildDir);
    }
    else {
        fs.emptyDirSync(jsBuildDir);
    }

    let files = fs.readdirSync(defDir);


    let modDir;
    let uiOutDir;
    let yamlOutDir;
    let i18nOutDir;

    if (isInstallingTo) {
        modDir = path.join(installDir, packageInfo.name);
        fs.emptyDirSync(modDir);
    }
    else {
        modDir = temp.mkdirSync(packageInfo.name);
    }

    uiOutDir = path.join(modDir, 'ui');
    if ( ! utils.exists(uiOutDir))
        fs.mkdirSync(uiOutDir);
    yamlOutDir = path.join(modDir, 'analyses');
    if ( ! utils.exists(yamlOutDir))
        fs.mkdirSync(yamlOutDir);
    i18nOutDir = path.join(srcDir, 'inst/i18n');
    fs.emptyDirSync(i18nOutDir);

    if (isBuilding || isInstallingTo) {
        let i18nDir = path.join(defDir, 'i18n');
        if (utils.exists(i18nDir)) {
            i18n.load(i18nDir);
            let codes = [ ];
            for (let code in i18n.translations) {
                if (code === 'c') //don't create json file of catalog
                    continue;

                let data = i18n.translations[code];
                codes.push(code);
                let i18nFile = code + '.json';
                fs.writeFileSync(path.join(i18nOutDir, i18nFile), JSON.stringify(data, null, 4));
                console.log(`wrote: ${i18nFile}`);

            }
            if ( ! codes.includes('en'))
                codes.unshift('en')
            packageInfo.languages = codes;
        }
    }

    for (let file of files) {

        if (file.endsWith('.a.yaml')) {
            let analysisPath = path.join(defDir, file);
            let basename = path.basename(analysisPath, '.a.yaml');
            let resultsPath = path.join(defDir, basename + '.r.yaml');
            let uiPath = path.join(defDir, basename + '.u.yaml');
            let jsPath = path.join(jsSrcDir, basename + '.js');
            let hOutPath = path.join(rDir, basename + '.h.R');
            let bOutPath = path.join(rDir, basename + '.b.R');
            let sOutPath = path.join(jsBuildDir, basename + '.src.js');
            let uOutPath = path.join(uiOutDir, basename + '.js');

            let hTemplPath = path.join(__dirname, 'header.template');
            let bTemplPath = path.join(__dirname, 'body.template');
            let sTemplPath = path.join(__dirname, 'src.template');

            compiler(packageInfo.name, analysisPath, resultsPath, hTemplPath, hOutPath, refs);
            console.log('wrote: ' + path.basename(hOutPath));

            if ( ! utils.exists(bOutPath)) {
                compiler(packageInfo.name, analysisPath, resultsPath, bTemplPath, bOutPath, refs);
                console.log('wrote: ' + path.basename(bOutPath));
            }

            uicompiler(analysisPath, uiPath, jsPath, basename, sTemplPath, sOutPath);

            if (isBuilding || isInstallingTo) {

                let stream = fs.createWriteStream(uOutPath);

                await new Promise((resolve) => {
                    browserify(sOutPath, { standalone: 'module' })
                        .bundle().pipe(stream);
                    stream.on('close', resolve);
                });

                let content = fs.readFileSync(analysisPath);
                fs.writeFileSync(path.join(yamlOutDir, basename + '.a.yaml'), content);

                if (utils.exists(resultsPath)) {
                    content = fs.readFileSync(resultsPath);
                    fs.writeFileSync(path.join(yamlOutDir, basename + '.r.yaml'), content);
                }

                console.log('wrote: ' + path.basename(uOutPath));
            }

            let content = fs.readFileSync(analysisPath, 'utf-8');
            let analysis = yaml.load(content);

            let uijs = '';
            if (utils.exists(uOutPath))
                uijs = fs.readFileSync(uOutPath, 'utf-8');

            let title = ('title' in analysis ? analysis.title : analyis.name);
            let aObj = {
                title: title,
                name: analysis.name,
                ns: packageInfo.name,
                options: analysis.options,
                uijs: uijs,
            };

            if ('category' in analysis)
                aObj.category = analysis.category;
            else
                aObj.category = 'analyses';

            if ('menuGroup' in analysis)
                aObj.menuGroup = analysis.menuGroup;
            else
                aObj.menuGroup = packageInfo.name;

            if ('menuSubgroup' in analysis)
                aObj.menuSubgroup = analysis.menuSubgroup;

            if ('menuTitle' in analysis)
                aObj.menuTitle = analysis.menuTitle;
            else
                aObj.menuTitle = title;

            if ('menuSubtitle' in analysis)
                aObj.menuSubtitle = analysis.menuSubtitle;
            if (analysis.description) {
                if (typeof analysis.description === 'string')
                    aObj.description = analysis.description.split('\n\n')[0];
                else if (typeof analysis.description.main === 'string')
                    aObj.description = analysis.description.main.split('\n\n')[0];
            }
            if (analysis.hidden === true)
                aObj.hidden = true;
            if (analysis.arbitraryCode) {
                if (rVersion === '4.1.2') {  // 2.3+
                    // jamovi 2.3.0 -> 2.3.7 fail with arbitrary code
                    // so i'm introducing arbitraryCode2 for 2.3.8+
                    // once we next update R, we won't need to do this
                    // any more.
                    aObj.arbitraryCode2 = true;
                }
                else {
                    aObj.arbitraryCode = true;
                }
            }

            let found = false;
            for (let existing of packageInfo.analyses) {
                if (existing.name === analysis.name) {
                    Object.assign(existing, aObj);
                    found = true;
                    break;
                }
            }
            if (found === false)
                packageInfo.analyses.push(aObj);
        }
    }

    try {

        console.log('writing module meta');

        let pOutPath = path.join(rDir, '00jmv.R');

        if (refs) {
            let pOutPath = path.join(rDir, '00jmv.R');
            let pTemplPath = path.join(__dirname, 'pkg.template');

            let template = fs.readFileSync(pTemplPath, 'utf-8');
            let compiler = _.template(template);

            let object = { refs: refs, imports: { sourcify } };
            let content = compiler(object);

            fs.writeFileSync(pOutPath, content);
            console.log('wrote: 00jmv.R');
        }
        else if (fs.existsSync(pOutPath)) {
            fs.unlinkSync(pOutPath);
        }

        if (packageInfo.datasets) {
            for (let dataset of packageInfo.datasets) {
                let from = path.join(srcDir, 'data', dataset.path);
                let to = path.join(modDir, 'data', dataset.path);
                fs.copySync(from, to);
                console.log('copied', dataset.path);
            }
        }

        let indexPath = path.join(defDir, '0000.yaml');

        if (packageInfo.date instanceof Date)
            packageInfo.date = packageInfo.date.toISOString().slice(0,10)

        let packageInfoLite = JSON.parse(JSON.stringify(packageInfo));

        if ('languages' in packageInfoLite)
            delete packageInfoLite.languages;

        for (let analysis of packageInfoLite.analyses) {
            delete analysis.options;
            delete analysis.uijs;
        }

        let content = '---\n' + yaml.dump(packageInfoLite) + '\n...\n';
        fs.writeFileSync(indexPath, content);
        console.log('wrote: 0000.yaml');

        if (isBuilding || isInstallingTo) {

            packageInfoLite.rVersion = rVersionAndArch;
            content = '---\n' + yaml.dump(packageInfoLite) + '\n...\n';

            fs.writeFileSync(path.join(modDir, 'jamovi.yaml'), content);
            console.log('wrote: jamovi.yaml');

            packageInfo.rVersion = rVersionAndArch;
            content = '---\n' + yaml.dump(packageInfo) + '\n...\n';

            fs.writeFileSync(path.join(modDir, 'jamovi-full.yaml'), content);
            console.log('wrote: jamovi-full.yaml');

            try {
                content = fs.readFileSync(refsPath);
                fs.writeFileSync(path.join(modDir, 'refs.yaml'), content);
            }
            catch (e) {
                // do nothing
            }

            log.debug('compiling R package');
            compileR(srcDir, modDir, paths, packageInfo, rVersion, rArch, log, { mirror, skipRemotes, skipDeps: args['skip-deps'] });
            log.debug('compiled');

            if (isBuilding) {

                log.debug('building .jmo')

                let zipPath;
                if (args.jmo)
                    zipPath = args.jmo
                else
                    zipPath = `${ packageInfo.name }_${ packageInfo.version }.jmo`;

                log.debug(`building ${ zipPath }`);

                let zip = new JSZip();
                let paths = walkSync(modDir, { directories: false });

                for (let relPath of paths) {
                    relPath = relPath.replace(/\\/g, '/');
                    if (relPath.startsWith('R/BH'))
                        continue;
                    log.debug(`archiving ${ relPath }`);
                    let archivePath = packageInfo.name + '/' + relPath;
                    let fullPath = path.join(modDir, relPath);
                    let contents = fs.readFileSync(fullPath);
                    zip.file(archivePath, contents);
                    log.debug('archived');
                }

                log.debug('zipping');
                zipPath = await new Promise((resolve, reject) => {
                    zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }).then(content => {
                        fs.writeFileSync(zipPath, content);
                        console.log('wrote module: ' + path.basename(zipPath) + '\n');
                        resolve(zipPath);
                    }, err => fs.writeSync(2, err))
                });
                log.debug('zipped');

                if (isInstalling) {
                    log.debug('installing');
                    installer.install(zipPath, args.home);
                    log.debug('installed');
                }
            }
        }
    }
    catch (e) {
        fs.writeSync(2, '\n');
        if (typeof(e) === 'string') {
            fs.writeSync(2, e);
        }
        else if ('message' in e) {
            fs.writeSync(2, e.message);
            if (args.debug)
                fs.writeSync(2, e.stack)
        }
        else {
            fs.writeSync(2, e);
        }
        fs.writeSync(2, '\n\n');
        process.exit(1);
    }

}
catch (e) {
    fs.writeSync(2, '\n');
    if (typeof(e) === 'string') {
        fs.writeSync(2, e);
    }
    else if ('message' in e) {
        fs.writeSync(2, e.stack)
        fs.writeSync(2, '\n\n');
        fs.writeSync(2, e.message);
    }
    else {
        fs.writeSync(2, e);
    }
    fs.writeSync(2, '\n\n');
    process.exit(1);
}

process.exit(0);

})();
