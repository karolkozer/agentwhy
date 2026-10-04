// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { refuseProjectAbove, refuseRulesOf } from '../../../../src/adapter/claude-code/settings/refuse-project.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import { writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const HOME = '/Users/someone';

/** Claude Code settings running `refuse` with this command, as `init --refuse` writes them. */
const running = (command: string) => JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command }] }] } });

// `2026-10-02-codex-approves-its-own-hook.md` AO5: the project is the nearest folder whose settings run `refuse`.
test('the project is found above the session\'s folder, by the settings that run refuse', async (t) => {
  const root = await writeSession(t, { '.claude/settings.local.json': running('agentwhy refuse'), 'apps/web/index.ts': '' });

  assert.equal((await refuseProjectAbove(files, join(root, 'apps', 'web'), HOME))?.project, root);
  assert.equal((await refuseProjectAbove(files, root, HOME))?.project, root);
});

// AO5: local first, as `init` reads them; a `.claude` without refuse does not stop the walk.
test('the local file is read first, and a .claude with no refuse is walked past', async (t) => {
  const root = await writeSession(t, {
    '.claude/settings.local.json': running('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.local.json"'),
    '.claude/settings.json': running('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.json"'),
    'packages/ui/.claude/settings.json': JSON.stringify({ permissions: { allow: [] } }),
    'packages/ui/src/button.ts': '',
  });
  const found = await refuseProjectAbove(files, join(root, 'packages', 'ui', 'src'), HOME);
  assert.equal(found?.project, root);
  assert.equal(found?.settingsPath, join(root, '.claude', 'settings.local.json'));
});

test('no settings running refuse anywhere above is no project', async (t) => {
  const root = await writeSession(t, { '.claude/settings.local.json': JSON.stringify({ permissions: { deny: ['Read(.env)'] } }), 'src/a.ts': '' });
  assert.equal(await refuseProjectAbove(files, join(root, 'src'), HOME), undefined);
});

/*
 * `codex-says-it-too` CXB6, carried over (it held for the old `.codex/hooks.json` marker and holds for this one): the
 * desktop app keeps its quick chats under `~/Documents`, and a walk up from one reaches home. The person's own
 * `~/.claude/settings.json` running `refuse` must not make every folder under home a project.
 */
test('the home directory is never a project, and the walk ends at it', async (t) => {
  const home = await writeSession(t, {
    '.claude/settings.json': running('agentwhy refuse'),
    'Documents/Codex/2026-10-02/co-2/outputs/.keep': '',
    'Projects/demo-shop/.claude/settings.local.json': running('agentwhy refuse'),
    'Projects/demo-shop/apps/.keep': '',
  });

  assert.equal(await refuseProjectAbove(files, join(home, 'Documents', 'Codex', '2026-10-02', 'co-2'), home), undefined);
  // A real project below home is still found; only home's own settings never count.
  assert.equal((await refuseProjectAbove(files, join(home, 'Projects', 'demo-shop', 'apps'), home))?.project, join(home, 'Projects', 'demo-shop'));
});

// AO6: the rules are what the project's own refuse command names.
test('the rules are the policy or settings the project\'s refuse names, resolved against the project', () => {
  const at = (command: string) => refuseRulesOf({ project: '/Users/someone/shop', settingsPath: '/Users/someone/shop/.claude/settings.local.json', command });
  assert.deepEqual(at('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR/.claude/settings.json"'), { settingsPath: '/Users/someone/shop/.claude/settings.json' });
  assert.deepEqual(at('agentwhy refuse --settings "${CLAUDE_PROJECT_DIR}/.claude/settings.local.json"'), { settingsPath: '/Users/someone/shop/.claude/settings.local.json' });
  assert.deepEqual(at('agentwhy refuse --settings .claude/settings.json'), { settingsPath: '/Users/someone/shop/.claude/settings.json' });
  assert.deepEqual(at('agentwhy refuse --policy policy/agentwhy.json'), { policyPath: '/Users/someone/shop/policy/agentwhy.json' });
  assert.deepEqual(at('agentwhy refuse --settings /etc/agentwhy/settings.json'), { settingsPath: '/etc/agentwhy/settings.json' });
  assert.deepEqual(at('npx @agentwhy/cli@0.1.0 refuse'), {}, 'no flag: the built-in list');
});

// Found by review: a command that quotes the variable alone was read as far as the closing quote, which named the
// project's folder as the file to read - the rules of a directory, so no rule at all.
test('a value quoted in part is read as the one word the shell makes of it', () => {
  const at = (command: string) => refuseRulesOf({ project: '/Users/someone/shop', settingsPath: '/Users/someone/shop/.claude/settings.local.json', command });
  assert.deepEqual(at('agentwhy refuse --settings "$CLAUDE_PROJECT_DIR"/.claude/settings.local.json'), { settingsPath: '/Users/someone/shop/.claude/settings.local.json' });
  assert.deepEqual(at('agentwhy refuse --settings "${CLAUDE_PROJECT_DIR}"/.claude/settings.json'), { settingsPath: '/Users/someone/shop/.claude/settings.json' });
  assert.deepEqual(at('agentwhy refuse --policy \'policy\'/agentwhy.json'), { policyPath: '/Users/someone/shop/policy/agentwhy.json' });
  assert.deepEqual(at('agentwhy refuse --settings /Users/someone/my\\ shop/.claude/settings.json'), { settingsPath: '/Users/someone/my shop/.claude/settings.json' }, 'an escaped space holds the word together');
  assert.deepEqual(at('agentwhy refuse --settings "/Users/someone/my shop/.claude/settings.json" --quiet'), { settingsPath: '/Users/someone/my shop/.claude/settings.json' }, 'a flag after it is not taken in');
});
