// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { approvedCodexEntries } from '../../src/adapter/codex/settings/codex-hooks.ts';
import { approvalKey, entryHash } from '../../src/adapter/codex/settings/hook-approval.ts';
import { OPEN_FROM_CHAT_SINCE } from '../../src/open-from-chat/open-from-chat.ts';
import { entryMissingIn, openFromChatIn, type OpenFromChatHere } from '../../src/open-from-chat/where-it-works.ts';
import { FileAccessError } from '../../src/ports/file-access-error.ts';
import type { FileReader } from '../../src/ports/file-reader.ts';
import type { JsonObject } from '../../src/shared/json.ts';

// `2026-11-24-open-agentwhy-from-the-chat.md` RO7: no page and no line promises the phrase where it is not answered.
const HOME = '/Users/someone';
const PROJECT = '/Users/someone/shop';
const CODEX_HOOKS = join(HOME, '.codex', 'hooks.json');
const ALL = ['Stop', 'SubagentStop', 'UserPromptSubmit'];
const watching = (command: string, events: readonly string[] = ALL): JsonObject => ({
  hooks: Object.fromEntries(events.map((event) => [event, [{ hooks: [{ type: 'command', command }] }]])),
});
const pinned = (version: string, rest = '') => `npx @agentwhy/cli@${version} watch${rest}`;

const filesOf = (contents: Readonly<Record<string, JsonObject | string>>): FileReader => ({
  readText: async (path) => {
    const content = contents[path];
    if (content === undefined) throw new FileAccessError('not-found', path);
    return typeof content === 'string' ? content : JSON.stringify(content);
  },
  readLines: async function* () {},
});

function where(contents: Readonly<Record<string, JsonObject | string>>, options: { readonly plugin?: boolean; readonly project?: string | null } = {}): Promise<OpenFromChatHere> {
  return openFromChatIn({ files: filesOf(contents), home: HOME, invoke: 'agentwhy', plugin: options.plugin === true }, options.project === null ? undefined : options.project ?? PROJECT);
}

const claude = async (contents: Readonly<Record<string, JsonObject | string>>, options = {}) => (await where(contents, options)).claudeCode;
const LOCAL = join(PROJECT, '.claude', 'settings.local.json');
const SHARED = join(PROJECT, '.claude', 'settings.json');
const PERSON = join(HOME, '.claude', 'settings.json');

test('RO7: Claude Code answers where its entry is, in any of the three settings', async () => {
  assert.equal(await claude({}), false);
  for (const command of ['agentwhy watch', 'npx @agentwhy/cli watch', pinned(OPEN_FROM_CHAT_SINCE), pinned('1.2.0'), 'node /somewhere/agentwhy/dist/cli.js watch']) {
    assert.equal(await claude({ [LOCAL]: watching(command) }), true, command);
    assert.equal(await claude({ [SHARED]: watching(command) }), true, command);
  }
  assert.equal(await claude({ [PERSON]: watching('agentwhy watch --everywhere') }), true);
  assert.equal(await claude({ [PERSON]: watching('agentwhy watch --everywhere') }, { project: null }), true, 'the computer’s page asks for no project');
});

test('RO7: not where the entry is an older install’s, pinned older, or cannot be read', async () => {
  assert.equal(await claude({ [LOCAL]: watching('agentwhy watch', ['Stop', 'SubagentStop']) }), false, 'before PKD9');
  assert.equal(await claude({ [LOCAL]: watching(pinned('0.9.0')) }), false);
  assert.equal(await claude({ [LOCAL]: '{ not json' }), false);
  assert.equal(await claude({ [LOCAL]: watching(pinned('0.9.0')), [PERSON]: watching('agentwhy watch --everywhere') }), true, 'RO2: the newer copy answers beside it');
});

test('RO7: the plugin answers where this run is the plugin’s own', async () => {
  assert.equal(await claude({}, { plugin: true }), true);
});

function codexFiles(command: string, change: (config: string) => string = (config) => config, events: readonly string[] = ['Stop', 'UserPromptSubmit']): Record<string, JsonObject | string> {
  const hooks: JsonObject = {
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'agentwhy refuse --codex', timeout: 30 }] }],
      ...Object.fromEntries(events.map((event) => [event, [{ hooks: [{ type: 'command', command, timeout: 30 }] }]])),
    },
  };
  const config = approvedCodexEntries(hooks).map((entry) => `[hooks.state."${approvalKey(CODEX_HOOKS, entry)}"]\ntrusted_hash = "${entryHash(entry) ?? ''}"\n`).join('\n');
  return { [CODEX_HOOKS]: hooks, [join(HOME, '.codex', 'config.toml')]: change(config) };
}

const codexOf = (...asked: Parameters<typeof codexFiles>): Promise<OpenFromChatHere> => where(codexFiles(...asked));

test('RO7: Codex answers where its approved entry runs a release that knows the phrase', async () => {
  assert.deepEqual(await where({}), { claudeCode: false, codex: false });
  for (const command of ['agentwhy codex-stop --codex', `npx @agentwhy/cli@${OPEN_FROM_CHAT_SINCE} codex-stop --codex`]) {
    assert.deepEqual(await codexOf(command), { claudeCode: false, codex: true }, command);
  }
  assert.equal((await codexOf('npx @agentwhy/cli@0.9.0 codex-stop --codex')).codex, false, 'pinned older');
  assert.equal((await codexOf('agentwhy codex-stop --codex', undefined, ['Stop'])).codex, false, 'no entry on the message');
  assert.equal((await codexOf('agentwhy codex-stop --codex', () => '')).codex, false, 'unapproved');
  assert.equal((await codexOf('agentwhy codex-stop --codex', (config) => config.replace(/sha256:[0-9a-f]+/g, 'sha256:older'))).codex, false, 'approved at another hash');
});

test('RO11: an entry is missing where alerts run without it, and nothing else answers', async () => {
  const missing = (contents: Readonly<Record<string, JsonObject | string>>, project: string | null = PROJECT) =>
    entryMissingIn({ files: filesOf(contents), home: HOME, invoke: 'agentwhy', plugin: false }, project ?? undefined);
  const before = ['Stop', 'SubagentStop'];
  assert.deepEqual(await missing({}), { claudeCode: false, codex: false }, 'no alerts, nothing to finish');
  assert.deepEqual(await missing({ [LOCAL]: watching('agentwhy watch', before) }), { claudeCode: true, codex: false });
  assert.deepEqual(await missing({ [SHARED]: watching('agentwhy watch', before) }), { claudeCode: true, codex: false });
  assert.equal((await missing({ [LOCAL]: watching('agentwhy watch') })).claudeCode, false, 'there');
  assert.equal((await missing({ [LOCAL]: watching(pinned('0.9.0')) })).claudeCode, false, 'pinned older is the update notice\'s');
  assert.equal((await missing({ [LOCAL]: watching('agentwhy watch', before), [PERSON]: watching('agentwhy watch --everywhere') })).claudeCode, false, 'the computer\'s copy answers');
  assert.equal((await missing({ [PERSON]: watching('agentwhy watch --everywhere', before) }, null)).claudeCode, true, 'the computer\'s own');
  assert.equal((await missing({ [PERSON]: watching('agentwhy watch --everywhere', before) })).claudeCode, false, 'not a project\'s to finish');
  assert.equal((await missing(codexFiles('agentwhy codex-stop --codex', undefined, ['Stop']))).codex, true);
  assert.equal((await missing(codexFiles('agentwhy codex-stop --codex'))).codex, false);
  // I1, found by review: an entry added beside an older pin would be written with that pin and answer nothing.
  assert.equal((await missing({ [LOCAL]: watching(pinned('0.5.0'), before) })).claudeCode, false, 'pinned older without the entry: the update comes first');
  assert.equal((await missing({ [LOCAL]: watching(pinned(OPEN_FROM_CHAT_SINCE), before) })).claudeCode, true);
  assert.equal((await missing(codexFiles('npx @agentwhy/cli@0.5.0 codex-stop --codex', undefined, ['Stop']))).codex, false, 'Codex’s too');
  assert.equal((await missing(codexFiles('agentwhy codex-stop --codex', () => '', ['Stop']))).codex, false, 'a check that is not on is the Codex line\'s');
});
