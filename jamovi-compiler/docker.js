'use strict';

import path from 'path';
import util from 'util';
import child_process from 'child_process';

// where the module source and the compiler get mounted in the build container
const SRC_PATH = '/module';
const COMPILER_PATH = '/opt/jamovi-compiler';
const JMO_PATH = '/module/.jmc-docker.jmo';

// '--home docker:jamovi' -> 'jamovi', anything else -> null
const parse = function(jamovi_home) {
    if (typeof jamovi_home !== 'string')
        return null;
    let match = /^docker:(.+)$/.exec(jamovi_home);
    if (match === null)
        return null;
    return match[1];
};

const docker = function(args, options) {
    return child_process.execFileSync(
        'docker', args, Object.assign({ encoding: 'utf-8' }, options));
};

const inspect = function(container, format) {
    try {
        return docker([ 'inspect', '-f', format, container ]).trim();
    }
    catch (e) {
        throw util.format("container '%s' could not be found", container);
    }
};

// modules bundle their dependencies as installed binaries, so they have to be
// built against the same R the server runs -- build in a throwaway container
// off the running container's own image. the source is mounted rather than
// copied, so the generated files and the compiled dependency cache
// (build/R<version>-<platform>) end up back in the source tree
const build = function(srcDir, compilerDir, container) {

    let image = inspect(container, '{{.Config.Image}}');

    console.log(util.format('building in %s\n', image));

    // this compiler gets mounted in and run from there, rather than using
    // whatever jmc the image was built with, so the build uses the same
    // compiler you invoked. it's pure javascript, so a node_modules installed
    // on the host runs fine in the container
    docker([
        'run', '--rm',
        '-v', util.format('%s:%s', srcDir, SRC_PATH),
        '-v', util.format('%s:%s:ro', compilerDir, COMPILER_PATH),
        '--entrypoint', '/bin/sh',
        image,
        '-c', util.format(
            'node %s/index.js --build %s --jmo %s --rhome "$R_HOME" --rlibs "$JAMOVI_HOME/modules/base/R"',
            COMPILER_PATH, SRC_PATH, JMO_PATH),
    ], { stdio: 'inherit' });

    return path.join(srcDir, path.basename(JMO_PATH));
};

const install = function(jmoPath, container) {

    if (inspect(container, '{{.State.Running}}') !== 'true')
        throw util.format("container '%s' isn't running", container);

    let dest = util.format('/tmp/%s', path.basename(jmoPath));

    console.log(util.format('\ninstalling into %s', container));

    docker([ 'cp', jmoPath, util.format('%s:%s', container, dest) ], { stdio: 'inherit' });

    // hand it to the server over its stdin -- it restarts the engines and
    // installs the module itself (see installer.js)
    docker([
        'exec', container,
        '/bin/sh', '-c', util.format('echo "install: %s" > /proc/1/fd/0', dest),
    ], { stdio: 'inherit' });

    console.log('Module handed to the running jamovi');
};

export default { parse, build, install };
