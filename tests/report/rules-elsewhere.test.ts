// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { projectsHolding } from '../../src/report/rules-elsewhere.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';

const RUNS_REFUSE = JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse --settings x' }] }] } });

/** A disk holding one set-up project, at `C:/Users/someone/course`, whichever separator a path is asked with. */
const disk = {
  readText: async (path: string): Promise<string> => {
    if (path.split('\\').join('/').toLowerCase() === 'c:/users/someone/course/.claude/settings.local.json') return RUNS_REFUSE;
    throw new FileAccessError('not-found', path);
  },
  readLines: (): AsyncIterable<string> => { throw new Error('not read'); },
};

// `2026-10-12-windows-paths.md` WP9, found 2026-11-01 on the test project of many same-named lessons: Claude Code hands the
// project's own `--settings` as `$CLAUDE_PROJECT_DIR/.claude/…`, a form other than the one the line's walk finds the
// project in, and `refuse` said "the policy of the project it is in" of a file in its own project - which read the
// project's rules a second time, as another project's, answered before its own exceptions.
test('WP9: the project found in another form at a drive is the project\'s own, never a second one', async () => {
  const found = (own: string | undefined) => projectsHolding(disk, '/Users/someone', ['C:/Users/someone/course/01-basics/02-operators'], own, { most: 4 });

  assert.deepEqual(await found('c:/Users/someone/course'), [], 'another case of the drive');
  assert.deepEqual(await found(['C:', 'Users', 'someone', 'course'].join(String.fromCharCode(92))), [], 'another separator');
  assert.deepEqual((await found('C:/Users/someone/other')).map((project) => project.project), ['C:/Users/someone/course'], 'another folder is another project');
  assert.equal((await found(undefined)).length, 1, 'with no project of its own, the one found');
});
