// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import { atFloor } from '../shared/node-floor.ts';

// `.ai/specs/2026-10-13-the-node-a-hook-finds.md` NF2. Read by a Node under the floor, as `shared/node-floor.ts` is:
// Node's own modules and that file, nothing newer than a Node 16 reads.

/** Set on the run this starts, so a `node` that answers a version it is not cannot start itself again (NF2). */
export const UNDER_NEWER_NODE = 'AGENTWHY_UNDER_NEWER_NODE';

/** How long a `node` found on `PATH` is given to say its version. */
const VERSION_WAIT_MS = 5000;

export interface NewerNodeSearch {
  /** `PATH` as the shell that started this run read it. */
  readonly path: string | undefined;
  readonly platform: string;
  /** The Node running now, which is under the floor and is not asked again. */
  readonly running: string;
}

export interface NewerNodeRun extends NewerNodeSearch {
  /** The script this run was started with, `argv[1]`, handed on as it is. */
  readonly script: string | undefined;
  readonly args: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
}

/**
 * NF2: the first `node` on `PATH` at or over the floor. Only directories a shell would look a name up in and that are
 * nobody's for the length of one run: absolute ones, none with a `node_modules` segment (JB2 - `npx` adds those), each
 * asked once. A `node` is asked its version by running it, as the shell would have run it by name.
 */
export function newerNodeOn(search: NewerNodeSearch): string | undefined {
  if (search.path === undefined) return undefined;
  const windows = search.platform === 'win32';
  const paths = windows ? win32 : posix;
  const asked = new Set();
  for (const directory of search.path.split(windows ? ';' : ':')) {
    if (directory === '' || !paths.isAbsolute(directory) || directory.split(/[\\/]/).includes('node_modules')) continue;
    const candidate = paths.join(directory, windows ? 'node.exe' : 'node');
    if (candidate === search.running || asked.has(candidate)) continue;
    asked.add(candidate);
    if (!existsSync(candidate)) continue;
    const answer = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: VERSION_WAIT_MS, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    if (answer.status === 0 && typeof answer.stdout === 'string' && atFloor(answer.stdout)) return candidate;
  }
  return undefined;
}

/**
 * NF2: the same script, arguments, streams and environment under a newer Node from `PATH`, and its exit code - or
 * `undefined` where there is none to run it, where this run was itself started that way, or where it could not start.
 * A run a signal ended answers 1. Nothing is written: the output is the run's own.
 */
export function runUnderNewerNode(run: NewerNodeRun): number | undefined {
  if (run.script === undefined || run.environment[UNDER_NEWER_NODE] !== undefined) return undefined;
  const node = newerNodeOn(run);
  if (node === undefined) return undefined;
  const answer = spawnSync(node, [run.script, ...run.args], { stdio: 'inherit', env: { ...run.environment, [UNDER_NEWER_NODE]: '1' }, windowsHide: true });
  if (answer.error !== undefined) return undefined;
  return answer.status === null ? 1 : answer.status;
}
