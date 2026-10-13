#!/usr/bin/env node
// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { runUnderNewerNode, UNDER_NEWER_NODE } from './infrastructure/newer-node.ts';
import { BELOW_FLOOR_EXIT_CODE, belowFloorLine, floorVerdict } from './shared/node-floor.ts';

// `.ai/specs/2026-10-13-the-node-a-hook-finds.md` NF1-NF3: the Node is checked here, before anything else of the
// package is loaded. A hook's shell looks `node` up for itself and can find one years older than the Node that wrote
// the hook; under it the package's dependency does not even link, so nothing imported above may reach a package, or
// be written in anything a Node 16 cannot read - `tests/architecture.test.ts` holds the imports to these two files.
// The shell itself is loaded below, by a Node that can read it.
const verdict = floorVerdict(process.versions.node);
const underNewer = verdict === 'runs' ? undefined : runUnderNewerNode({
  path: process.env.PATH,
  platform: process.platform,
  running: process.execPath,
  script: process.argv[1],
  args: process.argv.slice(2),
  environment: process.env,
});

if (underNewer !== undefined) {
  // NF2: a newer Node from the same PATH ran it; what it wrote is written, and its exit code is this run's.
  process.exitCode = underNewer;
} else if (verdict === 'cannot-load') {
  // NF3: no Node here can load the package. One line, and the code Node itself ended with before this check.
  process.stderr.write(belowFloorLine(process.versions.node, process.execPath));
  process.exitCode = BELOW_FLOOR_EXIT_CODE;
} else {
  // The mark of NF2 is this run's alone: a command the shell starts later - AO14's trial - looks for itself.
  delete process.env[UNDER_NEWER_NODE];
  const { runShell } = await import('./cli/shell.ts');
  await runShell();
}
