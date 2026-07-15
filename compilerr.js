
'use strict';

import path from 'path';
import fs from 'fs-extra';
import util from 'util';
import { execSync as sh } from 'child_process';
import process from 'process';

import snapshots from './snapshots.js';

import temp from 'temp';
temp.track();

const compile = function(srcDir, moduleDir, paths, packageInfo, rVersion, rArch, log, options) {

    options = options || {};

    let rDir = path.join(moduleDir, 'R');
    let tempPath = path.join(srcDir, 'temp');

    let platform;
    switch (process.platform) {
    case 'win32':
        platform = 'win64';
        break;
    case 'darwin':
        platform = 'macos';
        break;
    default:
        platform = 'linux';
        break;
    }

    let snapshot = snapshots[rVersion];

    if (snapshot.arch_urls)
        snapshot = Object.assign({}, snapshot, { mran_url: snapshot.arch_urls[rArch] })

    let included = (packageInfo.name === 'jmv' ? snapshot.base_packages : snapshot.jmv_packages);
    let buildDir = path.join(srcDir, 'build', `R${ packageInfo.rVersion }-${ platform }`);
    let mirror = options.mirror || snapshot.mran_url;

    try {
        log.debug('checking existence of ' + buildDir);
        fs.statSync(buildDir);
        log.debug('exists');
    }
    catch (e) {
        log.debug(e.message);
        log.debug('creating ' + buildDir);
        fs.mkdirsSync(buildDir);
        log.debug('created');
    }

    log.debug('reading dir ' + buildDir);
    let installed = fs.readdirSync(buildDir);
    log.debug('read');

    log.debug('reading DESCRIPTION');
    let descPath = path.join(srcDir, 'DESCRIPTION');
    let desc = fs.readFileSync(descPath, 'utf-8');
    desc += '\n';  // add a newline to the end to help the regexes below
    log.debug('read');
    desc = desc.replace(/\t/g, ' ');
    desc = desc.replace(/\r?\n /g, ' ');

    let depends = desc.match(/\nDepends\s*:\s*(.*)\r?\n/);
    let imports = desc.match(/\nImports\s*:\s*(.*)\r?\n/);
    let suggests = desc.match(/\nSuggests\s*:\s*(.*)\r?\n/);
    let linkingTo = desc.match(/\nLinkingTo\s*:\s*(.*)\r?\n/);
    let remotes = desc.match(/\nRemotes\s*:\s*(.*)\r?\n/);

    if (depends !== null) {
        depends = depends[1];
        depends = depends.match(/([A-Za-z][A-Za-z0-9_\.]*)/g);
    }
    else {
        depends = [ ];
    }

    if (imports !== null) {
        imports = imports[1];
        imports = imports.match(/([A-Za-z][A-Za-z0-9_\.]*)/g);
    }
    else {
        imports = [ ];
    }

    if (suggests !== null) {
        suggests = suggests[1];
        suggests = suggests.match(/([A-Za-z][A-Za-z0-9_\.]*)/g);
    }
    else {
        suggests = [ ];
    }

    if (linkingTo !== null) {
        linkingTo = linkingTo[1];
        linkingTo = linkingTo.match(/([A-Za-z][A-Za-z0-9_\.]*)/g);
    }
    else {
        linkingTo = [ ];
    }

    if (remotes !== null) {
        remotes = remotes[1];
        remotes = remotes.match(/([A-Za-z0-9\#_\./@-]+)/g);
    }
    else {
        remotes = [ ];
    }

    depends = depends.concat(imports);
    depends = depends.concat(suggests);
    depends = depends.concat(linkingTo);
    // extract package names from remote specs (e.g. 'user/SomePackage@v1.0' -> 'SomePackage')
    // so they aren't installed from CRAN — they'll be handled by the remotes install below
    let remotePackageNames = remotes.map(remote => {
        let parts = remote.split('/');
        let name = parts[parts.length - 1];
        return name.replace(/@.*$/, '');
    });

    depends = depends.filter(x => included.indexOf(x) === -1);
    depends = depends.filter(x => installed.indexOf(x) === -1);
    depends = depends.filter(x => remotePackageNames.indexOf(x) === -1);
    // remove duplicates
    depends = Array.from(new Set(depends));

    let cmd;

    let env = process.env;
    env.R_LIBS = buildDir;
    env.R_LIBS_SITE = paths.rLibs;
    env.R_LIBS_USER = 'notthere';
    env.R_REMOTES_NO_ERRORS_FROM_WARNINGS = '1';
    env.DOWNLOAD_STATIC_LIBV8 = '1';

    if (paths.rHome) {
        env.R_HOME = paths.rHome;

        if (process.platform === 'darwin') {
            env.R_SHARE_DIR = path.join(paths.rHome, 'share');
        }
    }

    log.debug('setting up environment', env);

    let installType = 'getOption(\'pkgType\')'
    //if (process.platform === 'win32')
    //    installType = '\'win.binary\''

    if (depends.length > 0 && options.skipDeps !== true) {
        console.log('Installing dependencies');
        console.log(depends.join(', '));

        let dataArg = "'--no-data', "
        for (let dep of depends) {
            if (['rnaturalearth', 'rnaturalearthhires'].includes(dep)) {
                // requires data
                dataArg = '';
                break;
            }
        }


        depends = depends.join("','");

        let mirrors = mirror.split(',').map(x => `'${x}'`).join(',');

        cmd = `"${ paths.rExe }" --vanilla --slave -e "utils::install.packages(c('${ depends }'), lib='${ buildDir }', type=${ installType }, repos=c(${ mirrors }), INSTALL_opts=c(${ dataArg }'--no-help', '--no-demo', '--no-html', '--no-docs', '--no-multiarch'))"`;
        cmd = cmd.replace(/\\/g, '/');
        try {
            sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
        }
        catch(e) {
            throw 'Failed to install dependencies';
        }
    }

    if (remotes.length > 0 && options.skipRemotes !== true) {
        console.log('Installing remotes');
        console.log(remotes.join(', '));

        const remotesDelay = (options.remotesDelay || 0) * 1000;

        for (let i = 0; i < remotes.length; i++) {
            let remote = remotes[i];

            // skip if a package of this name was already present in buildDir at
            // the start of the run.
            const packageName = remotePackageNames[i];
            if (installed.indexOf(packageName) !== -1) {
                console.log(`${ remote }: '${ packageName }' already installed, skipping`);
                continue;
            }

            if (i > 0 && remotesDelay > 0) {
                log.debug(`waiting ${ options.remotesDelay }s before installing next remote`);
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, remotesDelay);
            }

            // download the source tarball straight from github's codeload
            // archive endpoint rather than going through install_github/pak.
            // codeload is served like a git clone, so it doesn't count against
            // the REST API rate limit, and installing a plain tarball needs no
            // pak/rtools (only a compiler, and only if the package has compiled
            // code — which install_github would have needed too).
            //
            // remote looks like 'owner/repo', 'owner/repo@ref', or with an
            // optional 'github::' type prefix and/or '/subdir'. ref covers a
            // branch, tag, or commit sha. an unknown default branch is fine:
            // 'HEAD' resolves to its tip on codeload. note: '@*release'
            // tag-globs and '#pull' pull-request refs aren't handled.
            let spec = remote.replace(/^[a-z]+::/i, '');
            let ref = 'HEAD';
            const at = spec.indexOf('@');
            if (at !== -1) {
                ref = spec.substring(at + 1);
                spec = spec.substring(0, at);
            }
            const [ owner, repo, ...subdirParts ] = spec.split('/');
            const subdir = subdirParts.join('/');
            const url = `https://github.com/${ owner }/${ repo }/archive/${ ref }.tar.gz`;

            const subdirArg = subdir ? `subdir='${ subdir }', ` : '';
            // dependencies=NA pulls the remote's hard deps (Depends/Imports/
            // LinkingTo) from the CRAN mirror, not the github API, so there's no
            // rate-limit regression; only the remote tarball comes from codeload.
            let mirrors = mirror.split(',').map(x => `'${x}'`).join(',');
            const rExpr = `remotes::install_url('${ url }', lib='${ buildDir }', ${ subdirArg }type=${ installType }, repos=c(${ mirrors }), INSTALL_opts=c('--no-data', '--no-help', '--no-demo', '--no-html', '--no-docs', '--no-multiarch'), dependencies=NA, upgrade=FALSE)`;
            cmd = `"${ paths.rExe }" --vanilla --slave -e "${ rExpr }"`;
            cmd = cmd.replace(/\\/g, '/');
            try {
                sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
            }
            catch(e) {
                throw 'Failed to install remotes';
            }
        }
    }

    if (remotes.length + depends.length > 0
            && process.platform === 'darwin'
            && fs.existsSync('/usr/bin/install_name_tool')) {

        log.debug('fixing paths')

        let installed = fs.readdirSync(buildDir);

        // resolve the actual R.framework version directory name (e.g. '4.6'
        // or, on older releases, '4.5-arm64'). CRAN dropped the arch suffix
        // from the version dir in R 4.6, so we can't simply append it — read
        // it from the R being used, falling back to the old scheme if that
        // lookup fails.
        let rv;
        try {
            // paths.rHome is .../R.framework/Versions/Current/Resources, so its
            // parent is the 'Current' symlink pointing at the real version dir
            rv = path.basename(fs.realpathSync(path.dirname(paths.rHome)));
        }
        catch (e) {
            rv = rVersion.substring(0,3);
            if (rArch === 'x64')
                rv = `${ rv }-x86_64`;
            else if (rArch === 'arm64')
                rv = `${ rv }-arm64`;
        }

        const libDir = `@executable_path/../Frameworks/R.framework/Versions/${ rv }/Resources/lib`;

        // basenames of the libraries that ship inside the bundled R.framework;
        // any dependency with one of these names must be redirected to run
        // from within the jamovi bundle, wherever it currently points
        const relocatable = new Set([
            'libR.dylib',
            'libRlapack.dylib',
            'libRblas.dylib',
            'libgfortran.5.dylib',
            'libquadmath.0.dylib',
            'libXrender.1.dylib',
            'libomp.dylib',
        ]);

        for (let pkg of installed) {

            const so1 = pkg + '.so';
            const so2 = pkg.replace(/\./g, '') + '.so';
            const so3 = pkg.replace(/\./g, '_') + '.so';

            let pkgPath;
            const pkgPath1 = path.join(buildDir, pkg, 'libs', so1);
            const pkgPath2 = path.join(buildDir, pkg, 'libs', so2);
            const pkgPath3 = path.join(buildDir, pkg, 'libs', so3);

            if (fs.existsSync(pkgPath1))
                pkgPath = pkgPath1;
            else if (fs.existsSync(pkgPath2))
                pkgPath = pkgPath2;
            else if (fs.existsSync(pkgPath3))
                pkgPath = pkgPath3;

            if (pkgPath) {

                log.debug('patching ' + pkgPath);

                // read the binary's actual dependencies rather than guessing
                // their paths — the version/arch segment and install location
                // vary across R releases, so a hard-coded 'from' path silently
                // fails to match and install_name_tool does nothing
                let deps = '';
                try {
                    deps = sh(util.format('/usr/bin/otool -L "%s"', pkgPath), { encoding: 'utf-8' });
                }
                catch (e) {
                    log.debug('could not read dependencies for ' + pkgPath);
                }

                for (let line of deps.split('\n')) {
                    const match = line.match(/^\s+(\S+)\s+\(compatibility/);
                    if (match === null)
                        continue;
                    const dep = match[1];
                    if (dep.startsWith('@'))
                        continue;  // already relocated
                    if ( ! relocatable.has(path.basename(dep)))
                        continue;
                    const to = `${ libDir }/${ path.basename(dep) }`;
                    cmd = util.format('/usr/bin/install_name_tool -change %s %s "%s"', dep, to, pkgPath);
                    sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
                }

                let dSymPath = pkgPath + '.dSYM';
                if (fs.existsSync(dSymPath))
                    fs.removeSync(dSymPath);
            }

        }

        log.debug('paths fixed')
    }

    let SHLIB_EXT = '.so';
    if (process.platform === 'win32')
        SHLIB_EXT = '.dll';
    let dllPath = path.join(srcDir, 'src', packageInfo.name + SHLIB_EXT);

    if ( ! fs.existsSync(path.join(srcDir, 'src'))) {
        log.debug('no src directory found - no compilation');
    }
    else if (fs.existsSync(dllPath)) {
        log.debug('src directory found, but binary already built');
    }
    else {
        log.debug('src directory found - compilation will begin!');
        log.debug('building binaries');

        let srcs = [ ];
        for (let child of fs.readdirSync(path.join(srcDir, 'src'))) {
            if (child.match(/.+\.([cfmM]|cc|cpp|f90|f95|mm)$/g))
                srcs.push(child);
        }

        let srcPaths = srcs.map(src => '"' + path.join(srcDir, 'src', src) + '"').join(' ');
        let incPaths = linkingTo.map(pkg => '-I"' + path.join(buildDir, pkg, 'include') + '"').join(' ');
        incPaths += ' ' + linkingTo.map(pkg => '-I"' + path.join(paths.rHome, 'library', pkg, 'include') + '"').join(' ');

        log.debug('setting CLINK_CPPFLAGS=' + incPaths);
        env['CLINK_CPPFLAGS'] = incPaths;

        cmd = util.format('"%s" CMD SHLIB -o "%s" %s', paths.rExe, dllPath, srcPaths);

        log.debug('running command:\n' + cmd);
        sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
        log.debug('build complete');
    }

    log.debug('creating temp dir');
    fs.emptydirSync(tempPath);
    log.debug('created');

    log.debug('copying src to temp');
    for (let child of fs.readdirSync(srcDir)) {
        if (child.startsWith('.'))
            continue;
        if (child === 'temp')
            continue;
        if (child === 'build')
            continue;
        if (child.startsWith('build-'))
            continue;
        if (child === '.git')
            continue;
        if (child.endsWith('.jmo'))
            continue;
        let src = path.join(srcDir, child);
        let dest = path.join(tempPath, child);
        log.debug('copying ' + child);
        fs.copySync(src, dest);
        log.debug('copied');
    }
    log.debug('all files copied to temp')

    let toAppend = ''
    for (let analysis of packageInfo.analyses)
        toAppend += util.format('\nexport(%sClass)\nexport(%sOptions)\n', analysis.name, analysis.name)

    let tempNAMESPACE = path.join(tempPath, 'NAMESPACE');
    log.debug('appending to NAMESPACE');
    fs.appendFileSync(tempNAMESPACE, toAppend);
    log.debug('appended');

    try {
        if (paths.rHome)
            cmd = util.format('"%s" CMD INSTALL "--library=%s" --no-help --no-demo --no-html --no-docs --no-multiarch "%s"', paths.rExe, buildDir, tempPath);
        else
            cmd = util.format('R CMD INSTALL "--library=%s" --no-help --no-demo --no-html --no-docs --no-multiarch "%s"', buildDir, tempPath);
        log.debug('executing ' + cmd);
        sh(cmd, { stdio: [0, 1, 1], encoding: 'utf-8', env: env } );
        log.debug('executed');
    }
    catch(e) {
        throw 'Could not build module';
    }

    log.debug('copying to R dir');
    fs.copySync(buildDir, rDir, { filter: (src) => {
        let rel = path.relative(buildDir, src);
        // if (rel.startsWith('BH/'))
        //    return false;
        if (rel.includes('/help/'))
            return false;
        if (rel.includes('/html/'))
            return false;
        if (rel.includes('/doc/'))
            return false;
        return true;
    }});
    log.debug('copied');

    log.debug('deleting temp');
    fs.removeSync(tempPath);
    log.debug('deleted');
}

export default compile
