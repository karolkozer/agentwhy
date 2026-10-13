// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0

// `.ai/specs/2026-10-13-the-node-a-hook-finds.md` NF1-NF3, NF7. This file is read by a Node under the floor - it is
// what tells that Node so - which is why nothing here is newer than a Node 16 reads: no import, plain functions.

/** The oldest Node the package runs on: `engines` in `package.json`, held to it by a test (NF7). */
export const NODE_FLOOR = 22;

/**
 * NF3: the oldest Node the package's one dependency says it runs on, as major and minor - its own `engines`, held to
 * it by a test. Under it the package cannot be loaded at all (NFB5); from it up to the floor it loads, unsupported.
 */
export const LOADS_FROM = [20, 12] as const;

/** What a run that cannot load the package ends with: the code Node itself ended with there, before this check. */
export const BELOW_FLOOR_EXIT_CODE = 1;

/** What a Node is to the package: it `runs` it, it only `loads` it (under the floor), or it `cannot-load` it. */
export type FloorVerdict = 'runs' | 'loads' | 'cannot-load';

/** A Node's major and minor from its version, `22.12.0` or `v22.12.0`; `undefined` for anything else. */
export function nodeVersion(text: string): readonly [number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\./.exec(text.trim());
  return match === null ? undefined : [Number(match[1]), Number(match[2])];
}

/** Whether a version is at or over the floor; one that cannot be read is not. */
export function atFloor(version: string): boolean {
  const parsed = nodeVersion(version);
  return parsed !== undefined && parsed[0] >= NODE_FLOOR;
}

/**
 * NF1, NF3: where a Node stands. A version that cannot be read `runs` - an unknown build is no reason to turn a run
 * away. Node 21 before 21.7 is said to load and does not: it fails as it did before this check, which NF3 allows.
 */
export function floorVerdict(version: string): FloorVerdict {
  const parsed = nodeVersion(version);
  if (parsed === undefined || parsed[0] >= NODE_FLOOR) return 'runs';
  const [major, minor] = parsed;
  return major > LOADS_FROM[0] || (major === LOADS_FROM[0] && minor >= LOADS_FROM[1]) ? 'loads' : 'cannot-load';
}

/** NF3: the one line a Node that cannot load the package is answered with, naming the Node and where it is. */
export function belowFloorLine(version: string, executable: string): string {
  return `agentwhy needs Node ${NODE_FLOOR} or newer: this shell runs Node ${version} (${executable}), and its PATH holds no newer one.\n`;
}
