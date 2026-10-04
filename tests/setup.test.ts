// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

// The development floor is read from package.json rather than repeated here, so the two cannot drift. It is
// `devEngines`, not `engines`: the sources run through type stripping, while the published package is compiled and
// declares a lower floor of its own (`specs/2026-09-16-worth-running-every-day.md` R3).

type Version = readonly [major: number, minor: number];

function parse(version: string): Version {
  const [major = 0, minor = 0] = version.replace(/^\D*/, '').split('.').map(Number);
  return [major, minor];
}

function atLeast([major, minor]: Version, [floorMajor, floorMinor]: Version): boolean {
  return major > floorMajor || (major === floorMajor && minor >= floorMinor);
}

test('Node satisfies the development floor declared in package.json', () => {
  const pkg: { devEngines?: { runtime?: { version?: string } } } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const floor = pkg.devEngines?.runtime?.version;

  assert.ok(floor, 'package.json must declare devEngines.runtime.version');
  assert.ok(
    atLeast(parse(process.versions.node), parse(floor)),
    `Node ${process.versions.node} is below the declared floor ${floor}`,
  );
});
