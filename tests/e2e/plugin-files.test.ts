// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test, type TestContext } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { START_USAGE } from '../../src/cli/commands/start-cli-command.ts';
import { CHAT_VIEWS } from '../../src/report/render/chat/chat-choice.ts';
import { runCli } from '../helpers/cli.ts';

// `.ai/specs/2026-10-15-agentwhy-as-a-plugin.md` §5, AP1-AP3, AP14, AP17: the plugin's own files, read as Claude Code
// reads them, and every command they name run as the hook or the skill would run it.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const json = (path: string): Record<string, unknown> => JSON.parse(read(path)) as Record<string, unknown>;

/** AP2: the copy the plugin ships, the variable inside the quotes - a plugin's folder can hold a space (§8.3). */
const SHIPPED = 'node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" ';

interface HookGroup {
  readonly matcher?: string;
  readonly hooks: readonly { readonly type: string; readonly command: string }[];
}
const HOOKS = (json('hooks/hooks.json').hooks ?? {}) as Readonly<Record<string, readonly HookGroup[]>>;
const SKILL = read('skills/report/SKILL.md');
const VERSION = json('package.json').version as string;

test('AP14: the plugin names the package\'s own version, in its manifest and in every npx its skill falls back to', () => {
  assert.equal(json('.claude-plugin/plugin.json').version, VERSION);
  const pinned = [...SKILL.matchAll(/@agentwhy\/cli@([^\s`)]+)/g)].map((match) => match[1]);
  assert.ok(pinned.length > 0, 'AP17: the skill has a way in where its own line did not run');
  assert.deepEqual([...new Set(pinned)], [VERSION]);
  assert.doesNotMatch(SKILL, /@agentwhy\/cli(?!@)/, 'never an npx that runs whatever is newest');
});

test('AP1, AP2: five hooks, each running the shipped copy with the arguments the plugin\'s commands take', () => {
  assert.deepEqual(Object.keys(HOOKS).sort(), ['PreToolUse', 'SessionStart', 'Stop', 'SubagentStop', 'UserPromptSubmit']);
  const commands = Object.values(HOOKS).flatMap((groups) => groups.flatMap((group) => group.hooks.map((hook) => hook.command)));
  for (const command of commands) assert.ok(command.startsWith(SHIPPED), command);
  assert.deepEqual(commands.map((command) => command.slice(SHIPPED.length)).sort(), [
    'refuse --everywhere --plugin', 'session-start', 'watch --everywhere --plugin', 'watch --everywhere --plugin', 'watch --everywhere --plugin',
  ]);
  assert.equal(HOOKS.SessionStart?.[0]?.matcher, 'startup', 'AP6: a new session alone');
  // APO13: and Windows' shell, `PowerShell` - a name no tool has elsewhere.
  assert.equal(HOOKS.PreToolUse?.[0]?.matcher, 'Bash|Read|PowerShell', 'the shell and Read, as the computer\'s own check');
  // AP1: the plugin is its manifest, its hooks and its skill - nothing a claude.ai or Cowork upload refuses.
  for (const absent of ['bin', '.mcp.json', 'agents', 'commands', 'monitors']) assert.equal(existsSync(join(ROOT, absent)), false, absent);
});

// `2026-11-24-talking-about-agentwhy.md` CVD12, CV13: the server for the card, and the one module that draws it in the terminal.
test('CVD12, CV13: one server, the shipped copy with no argument of anyone\'s, and one module beside the hooks', () => {
  assert.deepEqual(json('.claude-plugin/plugin.json').mcpServers, { agentwhy: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/dist/cli.js', 'cards'] } });
  assert.deepEqual(json('hooks/hooks.json').modules, ['./terminal/register.tsx']);
  assert.deepEqual(Object.keys(json('hooks/hooks.json')).sort(), ['hooks', 'modules']);
  assert.match(json('.claude-plugin/plugin.json').description as string, /draws and does nothing else/, 'CVD6: it says so');
});

// `2026-11-25-the-card-in-codex.md` CCX9: Codex installs this plugin from the same list, fills in no `${CLAUDE_PLUGIN_ROOT}` for a server
// and runs `hooks/hooks.json` once approved. This manifest, which it reads first, starts nothing there.
test('CCX9: in Codex the plugin runs no hook and starts no server, and says where its setup is', () => {
  const manifest = json('.codex-plugin/plugin.json');
  assert.deepEqual(manifest.hooks, {});
  assert.equal('mcpServers' in manifest || 'version' in manifest, false, 'no server, and no version a release would have to write');
  assert.equal(manifest.name, 'agentwhy');
  assert.match(manifest.description as string, /npx @agentwhy\/cli/);
  const files = json('package.json').files as string[];
  assert.ok(files.includes('.codex-plugin/plugin.json') && !files.includes('.codex-plugin'));
});

test('AP7, AP17: the skill runs start with flags start knows, pre-approves exactly its own line, and never opens on its own', () => {
  const line = /^!`(.+)`$/m.exec(SKILL)?.[1] ?? '';
  assert.ok(line.startsWith(SHIPPED + 'start '), line);
  assert.match(line, /--detach .*--session "\$\{CLAUDE_SESSION_ID\}" .*--setup-first .*--plugin .*--quiet/);
  for (const flag of line.match(/--[a-z-]+/g) ?? []) assert.ok(START_USAGE.includes(flag), flag);
  const allowed = /^allowed-tools: (.+)$/m.exec(SKILL)?.[1] ?? '';
  assert.ok(allowed.includes('Bash(' + SHIPPED + 'start *)'), 'APB7: the line runs before the agent reads the skill');
  assert.match(SKILL, /^disable-model-invocation: true$/m, 'APD5: the agent never opens pages by itself');
});

test('AP3: nothing the plugin says before its setup promises that a file is blocked - a block is the person\'s choice', () => {
  const said = [
    json('.claude-plugin/plugin.json').description, SKILL,
    ...((json('.claude-plugin/marketplace.json').plugins ?? []) as { description?: string }[]).map((plugin) => plugin.description),
    json('.claude-plugin/marketplace.json').description,
  ].join('\n');
  assert.doesNotMatch(said, /\bblocked\b|\bblocks\b|\bprotect|keeps? (?:it|them|\w+ files?) from/i);
  // Block and Track may be named, as what the person chooses on the page (the maintainer, 2026-10-20).
  const sentences = said.split(/(?<=[.:;])\s+/);
  for (const sentence of sentences.filter((one) => /\bblock/i.test(one))) assert.match(sentence, /\bchoose\b/i, sentence);
});

test('AP15: the marketplace lists the plugin from the npm package, and is no part of the package', () => {
  const marketplace = json('.claude-plugin/marketplace.json');
  assert.equal(marketplace.name, 'agentwhy');
  assert.deepEqual((marketplace.plugins as { name: string; source: unknown }[]).map(({ name, source }) => ({ name, source })), [
    { name: 'agentwhy', source: { source: 'npm', package: '@agentwhy/cli' } },
  ]);
  assert.equal(json('.claude-plugin/plugin.json').name, 'agentwhy', '/agentwhy:report is the skill\'s name under it');
  const files = json('package.json').files as string[];
  assert.ok(files.includes('.claude-plugin/plugin.json') && !files.includes('.claude-plugin'), 'the manifest alone of that folder');
});

/** A home of its own, holding a rule of the computer's own and no check of the person's. */
async function homeWithARule(t: TestContext): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'agentwhy-plugin-files-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, '.claude'), { recursive: true });
  await writeFile(join(folder, '.claude', 'settings.json'), JSON.stringify({ permissions: { deny: ['Read(**/.env)', 'Edit(**/.env)'] } }));
  return folder;
}

test('every hook command, run as Claude Code runs it, starts and answers: none is an argument the command refuses', async (t) => {
  const HOME = await homeWithARule(t);
  const argsOf = (event: string): string[] => (HOOKS[event]?.[0]?.hooks[0]?.command ?? '').slice(SHIPPED.length).split(' ');
  const base = { session_id: 's', cwd: '/work/the-app' };

  const refused = await runCli(argsOf('PreToolUse'), {
    input: JSON.stringify({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat .env' } }), env: { HOME },
  });
  assert.equal(refused.code, 2, refused.stderr);
  assert.match(refused.stderr, /^agentwhy refused this command: it names \.env,/);

  for (const event of ['Stop', 'SubagentStop', 'UserPromptSubmit', 'SessionStart']) {
    const input = event === 'SessionStart' ? { ...base, hook_event_name: event, source: 'startup' }
      : event === 'UserPromptSubmit' ? { ...base, hook_event_name: event, prompt: 'hello' }
      : { ...base, hook_event_name: event, stop_hook_active: false };
    const ran = await runCli(argsOf(event), { input: JSON.stringify(input), env: { HOME } });
    assert.equal(ran.code, 0, `${event}: ${ran.stderr}`);
    assert.doesNotMatch(ran.stdout + ran.stderr, /not recognised|Usage: agentwhy/, event);
  }
});

// `2026-11-20-ask-your-ai-why.md` AY3, AY5, AY8, AYD1, AYD7: `/agentwhy:why` runs `why` for this conversation with no
// argument, pre-approves its own lines exactly - one a word of the closed list - and the agent never runs it on its own.
test('the why skill runs why for this conversation with no argument, and pre-approves each view of it alone', () => {
  const why = read('skills/why/SKILL.md');
  const line = /^!`(.+)`$/m.exec(why)?.[1] ?? '';
  // AYB11: a line that fails drops the skill without a word, so the skill's run always exits 0 and says what happened.
  // AYB13: it names no conversation either - `why --plugin` reads the one Claude Code says the line runs in.
  assert.equal(line, SHIPPED + 'why --plugin');
  assert.match(why, /^disable-model-invocation: true$/m, 'AYD1: typed by the person, first');
  // AYO9, AYB13 (measured 2026-11-22): a plugin skill's `!` line runs only where `allowed-tools` approves it - unapproved,
  // the skill ends with no word - and `${CLAUDE_SESSION_ID}` is not filled there, so no entry can name this conversation;
  // `why *` let the AI read another one unasked (AYD2). So neither the line nor the AI's command names one - `why
  // --plugin` reads it from the environment Claude Code gives the command - and each entry is one command, whole: no `*`.
  const front = why.split('---')[1] ?? '';
  const allowed = [...front.matchAll(/^ {2}- Bash\((.*)\)$/gm)].map((match) => match[1]);
  assert.deepEqual(allowed, [line, ...CHAT_VIEWS.map((view) => SHIPPED + 'why --plugin ' + view)], 'the line, then each view');
  assert.doesNotMatch(front, /\*/, 'no wildcard: nothing but the five commands passes unasked');
  // AYB12: the model never sees a `!` line's command, only what it printed - so the text names the one it may run for a word.
  assert.ok(why.includes('`' + SHIPPED + 'why --plugin WORD`'), 'the command for a view, as the model will see it');
  assert.doesNotMatch(why, /--session/, 'no conversation is named, by the line or by the AI');
});

// AYB3, measured 2026-11-20: Claude Code puts `$ARGUMENTS` into a `!` line as typed, and a `;` in it runs a second command,
// unasked. So no skill the package ships hands what a person typed to a shell - the kind, over every skill there is.
test('no skill the package ships puts what the person typed into a line it runs', () => {
  const skills = ['skills/report/SKILL.md', 'skills/why/SKILL.md'];
  for (const skill of skills) {
    const lines = [...read(skill).matchAll(/^!`(.+)`$/gm)].map((match) => match[1] ?? '');
    assert.ok(lines.length > 0, skill);
    for (const line of lines) assert.doesNotMatch(line, /\$ARGUMENTS|\$\d|\$\{?[0-9]/, skill + ': ' + line);
  }
});
