// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { constants } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { delimiter, dirname, join, sep } from 'node:path';
import type { AgentwhyInvocation } from '../ports/agentwhy-invocation.ts';
import { parseJsonObject } from '../shared/json.ts';
import { PACKAGE } from '../shared/package-name.ts';
import { plainVersion } from '../shared/plain-version.ts';

/** The installed way, and the name of the bin a hook's shell looks up on `PATH`. */
const INSTALLED = 'agentwhy';

export interface NodeAgentwhyInvocationOptions {
  /** The script this process runs, as it was started: `argv[1]`, a symlink's path where a bin ran (JB1). */
  readonly script: string | undefined;
  /** The process's `PATH`, as the shell read it. */
  readonly path: string | undefined;
  readonly platform: string;
}

/**
 * `agentwhy` where the first `agentwhy` on `PATH` belongs to the package this process runs from, and the published way
 * everywhere else (`a-hook-runs-what-you-ran.md` J2, J3): `npx @agentwhy/cli@<version>`, pinned to this package's own
 * version where it is a release, so no hook runs a version nobody chose (`nothing-updates-by-itself.md` U1).
 *
 * `PATH` is read without the entries `npx` adds for the length of its run - its cache, a `node_modules/.bin` for every
 * directory up to `/`, npm's `node-gyp-bin` - each of which has a `node_modules` segment (JB2). Read with them, the
 * answer inside `npx` is always "installed", and a hook written from it fails as soon as `npx` has exited.
 */
export class NodeAgentwhyInvocation implements AgentwhyInvocation {
  readonly #options: NodeAgentwhyInvocationOptions;

  constructor(options: NodeAgentwhyInvocationOptions) {
    this.#options = options;
  }

  async find(): Promise<string> {
    const { script, path, platform } = this.#options;
    const running = script === undefined ? undefined : await packageOf(script);
    const npx = published(running === undefined ? undefined : await versionIn(running));
    // J3: a `.cmd` shim is what a global bin is on Windows, and nothing here has measured one.
    if (platform === 'win32' || running === undefined || path === undefined) return npx;

    for (const directory of path.split(delimiter)) {
      if (directory === '' || directory.split(sep).includes('node_modules')) continue;
      const bin = await executable(join(directory, INSTALLED));
      // The first one found is the one a hook's shell runs, whichever package it is.
      if (bin !== undefined) return (await packageOf(bin)) === running ? INSTALLED : npx;
    }
    return npx;
  }

  async version(): Promise<string | undefined> {
    const { script } = this.#options;
    const running = script === undefined ? undefined : await packageOf(script);
    return running === undefined ? undefined : versionIn(running);
  }
}

/**
 * The published way, written without `--yes`: a hook's first run installs without asking (JB5). Pinned to a release;
 * a version that is not one (`0.0.0-dev`) is on no registry, and is left out rather than written (U1).
 */
function published(version: string | undefined): string {
  return version !== undefined && plainVersion(version) !== undefined ? `npx ${PACKAGE}@${version}` : `npx ${PACKAGE}`;
}

/** What a package's `package.json` names as its version, or `undefined` where it cannot be read. */
async function versionIn(packageRoot: string): Promise<string | undefined> {
  try {
    const version = parseJsonObject(await readFile(join(packageRoot, 'package.json'), 'utf8'))?.version;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

/** The file a path leads to, where it exists and may be run; `undefined` for a broken link or anything else. */
async function executable(path: string): Promise<string | undefined> {
  try {
    const file = await realpath(path);
    // A directory passes X_OK, and a shell looking a command up skips it. Found by a review: a checkout named
    // agentwhy earlier on PATH hid the bin after it.
    if (!(await stat(file)).isFile()) return undefined;
    await access(file, constants.X_OK);
    return file;
  } catch {
    return undefined;
  }
}

/** The nearest directory above a file's real path that holds a `package.json`: the package it belongs to. */
async function packageOf(file: string): Promise<string | undefined> {
  let directory: string;
  try {
    directory = dirname(await realpath(file));
  } catch {
    return undefined;
  }
  for (;;) {
    try {
      await access(join(directory, 'package.json'));
      return directory;
    } catch {
      const parent = dirname(directory);
      if (parent === directory) return undefined;
      directory = parent;
    }
  }
}
