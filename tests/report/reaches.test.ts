// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ToolEvent } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import { reachesOf } from '../../src/report/reaches.ts';

const evidence = { source: { kind: 'main' as const }, record: 1 };

// `2026-10-08-every-tab-says-read.md` ER10, from the maintainer's run of 2026-11-22: the line below printed four files
// and Step by step and the Files tab said "saw the name" of each - `echo ----` and `wc -l` made it a listing. The files
// the printers were given are read; a name only the printed text held - a lesson's file a plan mentions - stays a name.
test('a step reads the files its printers printed beside echo and wc, and only names what the printed text named', () => {
  const event: ToolEvent = {
    id: 'e', agentId: 'main', sequence: 1, toolName: 'Bash', input: {}, targets: [], toolKnown: true, outcome: 'succeeded',
    // As the AI wrote it: an absolute `cd`, with a space in its folder, before the printers - so each word is placed there (FN11).
    commands: ['cd "/Users/someone/My App" && head -60 plan.md; echo ----; head -30 SPEC.md; echo ----; cat main.py; echo ----; head -20 test-file.txt; wc -l plan.md SPEC.md'],
    resultShape: 'listing', evidence, completeness: 'complete',
    result: { stage: 'model', completeness: 'complete', evidence,
      // The spec lists a lesson's file on a line of its own: a name the printed text held, which becomes a row as a name.
      content: '# Plan\nEach lesson lives in lessons/stage_01/01_variables/theory.md\n----\n# Spec\nlessons/stage_01/01_variables/exercise.py\n----\na = 25\n----\nthis is a test file\n  60 plan.md\n  30 SPEC.md\n  90 total' },
  };
  const printed = ['plan.md', 'SPEC.md', 'main.py', 'test-file.txt'].map((name) => '/Users/someone/My App/' + name);
  const how = Object.fromEntries(reachesOf(event, [], DEFAULT_POLICY, { root: '/Users/someone/My App' }).map((reach) => [reach.path, reach.how]));
  for (const path of printed) assert.equal(how[path], 'read', path);
  const named = Object.entries(how).filter(([path]) => !printed.includes(path));
  assert.ok(named.some(([path]) => path.endsWith('lessons/stage_01/01_variables/exercise.py')), 'the name the printed text held is a row');
  for (const [path, said] of named) assert.equal(said, 'named', `${path} was only named`);
});
