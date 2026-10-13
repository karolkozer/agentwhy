// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { atFloor, BELOW_FLOOR_EXIT_CODE, belowFloorLine, floorVerdict, LOADS_FROM, NODE_FLOOR, nodeVersion } from '../../src/shared/node-floor.ts';

// `.ai/specs/2026-10-13-the-node-a-hook-finds.md` NF1, NF3, NF7.

function manifest(path: string): { readonly engines?: { readonly node?: string } } {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as { readonly engines?: { readonly node?: string } };
}

test('NF7: the floor is the one `engines` names, and the "loads from" floor the dependency\'s own', () => {
  assert.equal(manifest('../../package.json').engines?.node, `>=${NODE_FLOOR}`);
  // The dependency's floor as it writes it, `>= 20.12.0`: a release that moves it moves `LOADS_FROM`, or fails here.
  const declared = /^>=\s*(\d+)\.(\d+)\.\d+$/.exec(manifest('../../node_modules/@clack/prompts/package.json').engines?.node ?? '');
  assert.deepEqual(declared?.slice(1).map(Number), [...LOADS_FROM]);
});

test('NF1, NF3: a Node at the floor runs it, one the dependency runs on loads it, anything older cannot', () => {
  // NFB5: the versions measured, and the edges of each range.
  for (const version of ['22.0.0', '22.12.0', '23.9.0', '24.13.1', '100.0.0']) assert.equal(floorVerdict(version), 'runs', version);
  for (const version of ['20.12.0', '20.12.1', '20.17.0', '21.7.0', '21.99.0']) assert.equal(floorVerdict(version), 'loads', version);
  for (const version of ['20.11.1', '20.0.0', '18.17.0', '18.12.0', '16.18.0', '16.0.0', '4.9.1']) assert.equal(floorVerdict(version), 'cannot-load', version);
  assert.equal(floorVerdict('v16.18.0'), 'cannot-load', 'as `node --version` writes it');
  assert.equal(floorVerdict('23.0.0-nightly20260101'), 'runs');
  assert.equal(floorVerdict('not a version'), 'runs', 'a version that cannot be read turns no run away');
});

test('a version is read from either way Node writes one, and nothing else is', () => {
  assert.deepEqual(nodeVersion('22.12.0'), [22, 12]);
  assert.deepEqual(nodeVersion('v20.17.0\n'), [20, 17]);
  assert.equal(nodeVersion('22'), undefined);
  assert.equal(nodeVersion(''), undefined);
  assert.equal(atFloor('v22.0.0\n'), true);
  assert.equal(atFloor('v21.7.3'), false);
  assert.equal(atFloor('node: bad option'), false, 'what is not a version is not at the floor');
});

test('NF3: a Node that cannot load it is answered with one line naming the Node and where it is, and exit 1', () => {
  const line = belowFloorLine('16.18.0', '/usr/local/bin/node');
  assert.equal(line, 'agentwhy needs Node 22 or newer: this shell runs Node 16.18.0 (/usr/local/bin/node), and its PATH holds no newer one.\n');
  assert.equal(line.trimEnd().includes('\n'), false, 'one line: AO14\'s trial keeps a line');
  assert.equal(BELOW_FLOOR_EXIT_CODE, 1, 'what Node itself ended with there before, and never a hook\'s 2');
});
