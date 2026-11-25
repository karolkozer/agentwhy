// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { constants } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { delimiter, dirname, join, sep } from 'node:path';
import { parseJsonObject } from '../shared/json.js';
import { PACKAGE } from '../shared/package-name.js';
import { plainVersion } from '../shared/plain-version.js';
/** The installed way, and the name of the bin a hook's shell looks up on `PATH`. */
const INSTALLED = 'agentwhy';
/**
 * `agentwhy` where the first `agentwhy` on `PATH` belongs to the package this process runs from, and the published way
 * everywhere else (`a-hook-runs-what-you-ran.md` J2, J3): `npx @agentwhy/cli@<version>`, pinned to this package's own
 * version where it is a release, so no hook runs a version nobody chose (`nothing-updates-by-itself.md` U1).
 *
 * `PATH` is read without the entries `npx` adds for the length of its run - its cache, a `node_modules/.bin` for every
 * directory up to `/`, npm's `node-gyp-bin` - each of which has a `node_modules` segment (JB2). Read with them, the
 * answer inside `npx` is always "installed", and a hook written from it fails as soon as `npx` has exited.
 */
export class NodeAgentwhyInvocation {
    #options;
    constructor(options) {
        this.#options = options;
    }
    async find() {
        const { script, path, platform } = this.#options;
        const running = script === undefined ? undefined : await packageOf(script);
        const npx = published(running === undefined ? undefined : await versionIn(running));
        if (running === undefined || path === undefined)
            return npx;
        for (const directory of path.split(delimiter)) {
            if (directory === '' || directory.split(sep).includes('node_modules'))
                continue;
            if (platform === 'win32') {
                const shim = await shimmed(directory);
                if (shim !== undefined)
                    return shim === running ? INSTALLED : npx;
                continue;
            }
            const bin = await executable(join(directory, INSTALLED));
            // The first one found is the one a hook's shell runs, whichever package it is.
            if (bin !== undefined)
                return (await packageOf(bin)) === running ? INSTALLED : npx;
        }
        return npx;
    }
    async version() {
        const { script } = this.#options;
        const running = script === undefined ? undefined : await packageOf(script);
        return running === undefined ? undefined : versionIn(running);
    }
}
/**
 * The published way, written without `--yes`: a hook's first run installs without asking (JB5). Pinned to a release;
 * a version that is not one (`0.0.0-dev`) is on no registry, and is left out rather than written (U1).
 */
function published(version) {
    return version !== undefined && plainVersion(version) !== undefined ? `npx ${PACKAGE}@${version}` : `npx ${PACKAGE}`;
}
/** What a package's `package.json` names as its version, or `undefined` where it cannot be read. */
async function versionIn(packageRoot) {
    try {
        const version = parseJsonObject(await readFile(join(packageRoot, 'package.json'), 'utf8'))?.version;
        return typeof version === 'string' ? version : undefined;
    }
    catch {
        return undefined;
    }
}
/** The file a path leads to, where it exists and may be run; `undefined` for a broken link or anything else. */
async function executable(path) {
    try {
        const file = await realpath(path);
        // A directory passes X_OK, and a shell looking a command up skips it. Found by a review: a checkout named
        // agentwhy earlier on PATH hid the bin after it.
        if (!(await stat(file)).isFile())
            return undefined;
        await access(file, constants.X_OK);
        return file;
    }
    catch {
        return undefined;
    }
}
/**
 * J3 as amended 2026-10-14 (JB6): on Windows npm's global bin is no link but three shims in one folder - `agentwhy`, which
 * the Git Bash Claude Code runs its hooks in finds, `agentwhy.cmd` and `agentwhy.ps1` - each starting
 * `<that folder>/node_modules/@agentwhy/cli/dist/cli.js`, a folder `npm link` makes a junction to a checkout. The package
 * such a shim starts; `null` where the `agentwhy` here is anything else, which a hook's shell would run all the same;
 * `undefined` where there is none to read.
 */
async function shimmed(directory) {
    let text;
    try {
        text = await readFile(join(directory, INSTALLED), 'utf8');
    }
    catch {
        return undefined;
    }
    if (!text.includes(`node_modules/${PACKAGE}/`))
        return null;
    return (await packageOf(join(directory, 'node_modules', ...PACKAGE.split('/'), 'package.json'))) ?? null;
}
/** The nearest directory above a file's real path that holds a `package.json`: the package it belongs to. */
async function packageOf(file) {
    let directory;
    try {
        directory = dirname(await realpath(file));
    }
    catch {
        return undefined;
    }
    for (;;) {
        try {
            await access(join(directory, 'package.json'));
            return directory;
        }
        catch {
            const parent = dirname(directory);
            if (parent === directory)
                return undefined;
            directory = parent;
        }
    }
}
