// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../helpers/cli.ts';

// `2026-11-05-a-key-in-what-it-read.md` KR3, KR5, KR7. Values joined at run time (the export's P9).
const GITHUB = ['ghp', 'Q7mZp2Lx9TaV4cBn8RwE3yKu1SdF6gHj0PoI'].join('_');
const PLACEHOLDER = '[redacted by agentwhy]';
const ENGLISH = { LANG: 'en_US.UTF-8', LC_ALL: '', LC_MESSAGES: '' };
const result = (response: unknown) => JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: response });
const bash = (stdout: string) => ({ stdout, stderr: '', interrupted: false, isImage: false });

test('a key in a result: the result in its shape, the notice beside it, a line to the person', async () => {
  const run = await runCli(['hide-keys'], { input: result(bash(`token: ${GITHUB}\nmode: dev\n`)), env: ENGLISH });
  assert.equal(run.code, 0);
  const answer = JSON.parse(run.stdout);
  assert.deepEqual(answer.hookSpecificOutput.updatedToolOutput, bash(`token: ${PLACEHOLDER}\nmode: dev\n`));
  assert.equal(answer.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(answer.hookSpecificOutput.additionalContext, /Do not write the placeholder into a file/);
  assert.match(answer.systemMessage, /agentwhy hid 1 key from your AI/);
  assert.ok(!run.stdout.includes(GITHUB));
});

test('no key: nothing written at all, so Claude Code goes on with the original', async () => {
  const run = await runCli(['hide-keys'], { input: result(bash('mode: dev\n')), env: ENGLISH });
  assert.equal(run.code, 0);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, '');
});

test('KR7: a failed call claims nothing to the AI, and tells the person the AI read it', async () => {
  const input = JSON.stringify({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', error: `Exit code 3\ntoken: ${GITHUB}` });
  const run = await runCli(['hide-keys'], { input, env: ENGLISH });
  assert.equal(run.code, 0);
  const answer = JSON.parse(run.stdout);
  assert.deepEqual(Object.keys(answer), ['systemMessage']);
  assert.match(answer.systemMessage, /so your AI read it/);
  assert.ok(!run.stdout.includes(GITHUB));
  const clean = await runCli(['hide-keys'], { input: JSON.stringify({ hook_event_name: 'PostToolUseFailure', error: 'Exit code 1' }), env: ENGLISH });
  assert.equal(clean.stdout, '');
});

test('KR3: a result that is a bare string is a shape not measured, so nothing is swapped and nothing is claimed', async () => {
  const run = await runCli(['hide-keys'], { input: result(`token: ${GITHUB}`), env: ENGLISH });
  assert.equal(run.code, 0);
  const answer = JSON.parse(run.stdout);
  assert.deepEqual(Object.keys(answer), ['systemMessage']);
  assert.match(answer.systemMessage, /could not hide, so your AI read it/);
  assert.ok(!run.stdout.includes(GITHUB));
});

test('KR8: whatever cannot be read is nothing written and exit 0', async () => {
  for (const input of ['', 'not json', '[]', JSON.stringify({ hook_event_name: 'Stop' }), JSON.stringify({ hook_event_name: 'PostToolUse' })]) {
    const run = await runCli(['hide-keys'], { input, env: ENGLISH });
    assert.equal(run.code, 0, input);
    assert.equal(run.stdout, '', input);
    assert.equal(run.stderr, '', input);
  }
});

test('the person is told in their language', async () => {
  const pl = await runCli(['hide-keys'], { input: result(bash(`a: ${GITHUB}\nb: ${GITHUB}\n`)), env: { ...ENGLISH, LANG: 'pl_PL.UTF-8' } });
  assert.match(JSON.parse(pl.stdout).systemMessage, /ukrył przed twoim AI 2 klucze/);
  const de = await runCli(['hide-keys'], { input: result(bash(`a: ${GITHUB}\n`)), env: { ...ENGLISH, LANG: 'de_DE.UTF-8' } });
  assert.match(JSON.parse(de.stdout).systemMessage, /1 Schlüssel vor deiner KI/);
});

// KR6: what a report says of a conversation the switch acted in. Written as Claude Code wrote it on 2.1.308 (§2.1).
const SESSION = '11111111-2222-4333-8444-555555555555';
function transcriptWith(notice: boolean): string {
  const base = { sessionId: SESSION, cwd: '/Users/someone/fictional-shop', timestamp: '2026-11-05T10:00:00.000Z', version: '2.1.308' };
  return [
    { ...base, type: 'assistant', uuid: 'a', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_read', name: 'Read', input: { file_path: 'notes.yml' } }] } },
    { ...base, type: 'user', uuid: 'b', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_read', content: `api_token: ${PLACEHOLDER}\n` }] }, toolUseResult: { type: 'text', file: { content: `api_token: ${PLACEHOLDER}\n` } } },
    ...(notice ? [{ ...base, type: 'attachment', uuid: 'c', attachment: { type: 'hook_additional_context', content: [`agentwhy hid 1 key(s) in this tool's result: each now reads ${PLACEHOLDER}.`], hookName: 'PostToolUse:Read', toolUseID: 'toolu_read', hookEvent: 'PostToolUse' } }] : []),
  ].map((line) => JSON.stringify(line)).join('\n') + '\n';
}

async function reported(notice: boolean): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agentwhy-hide-keys-report-'));
  const folder = join(home, '.claude', 'projects', '-Users-someone-fictional-shop');
  await mkdir(folder, { recursive: true });
  const file = join(folder, `${SESSION}.jsonl`);
  await writeFile(file, transcriptWith(notice));
  const run = await runCli(['report', '--input', file, '--full'], { env: { HOME: home, ...ENGLISH } });
  assert.equal(run.code, 0, run.stderr);
  return run.stdout;
}

test('KR6: where the record says agentwhy hid a key, the placeholder is no key, and the report says what happened', async () => {
  const out = await reported(true);
  assert.ok(!out.includes('shaped like a key'), 'the AI never saw a key');
  assert.match(out, /Keys hidden from the AI/);
  assert.match(out, /Read · notes\.yml/, 'the file, so that the person can find the key');
});

test('KR10: the same text with no such line reads as it always did', async () => {
  const out = await reported(false);
  assert.match(out, /shaped like a key/);
  assert.ok(!out.includes('Keys hidden from the AI'));
});

// `2026-11-05-a-key-in-what-it-read.md` KR6, KR7: the line is in the language the rest of agentwhy speaks to this person, chosen first
// (`the-agent-tells-you.md` R29). Found in VS Code: `watch`'s line in Polish beside this hook's in English.
async function homeWith(preferences: string | undefined): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agentwhy-hide-keys-'));
  if (preferences !== undefined) {
    await mkdir(join(home, '.agentwhy'));
    await writeFile(join(home, '.agentwhy', 'notices.json'), preferences);
  }
  return home;
}
const swapIn = (cwd: string): string => JSON.stringify({ hook_event_name: 'PostToolUse', cwd, tool_response: { stdout: `token: ${GITHUB}` } });

test('KR6: the language chosen on a page comes before the system\'s, on a swap and on a failed call', async () => {
  const home = await homeWith(JSON.stringify({ defaults: { lang: 'pl' } }));
  const env = { ...ENGLISH, HOME: home };
  const swapped = JSON.parse((await runCli(['hide-keys'], { input: swapIn('/opt/fictional'), env })).stdout);
  assert.match(swapped.systemMessage, /ukrył/);
  const failed = JSON.parse((await runCli(['hide-keys'], { input: JSON.stringify({ hook_event_name: 'PostToolUseFailure', error: `token: ${GITHUB}` }), env })).stdout);
  assert.ok(!/so your AI read it/.test(failed.systemMessage), failed.systemMessage);
  await rm(home, { recursive: true, force: true });
});

test('KR6: a project\'s own choice comes before the computer\'s, and with none chosen the system\'s language stands', async () => {
  const home = await homeWith(JSON.stringify({ defaults: { lang: 'pl' }, projects: { '/opt/fictional': { lang: 'de' } } }));
  const german = JSON.parse((await runCli(['hide-keys'], { input: swapIn('/opt/fictional/inside'), env: { ...ENGLISH, HOME: home } })).stdout);
  assert.match(german.systemMessage, /verborgen/);
  const bare = await homeWith(undefined);
  const system = JSON.parse((await runCli(['hide-keys'], { input: swapIn('/opt/fictional'), env: { HOME: bare, LANG: 'pl_PL.UTF-8', LC_ALL: '', LC_MESSAGES: '' } })).stdout);
  assert.match(system.systemMessage, /ukrył/);
  await rm(home, { recursive: true, force: true });
  await rm(bare, { recursive: true, force: true });
});

test('KR8: a file of choices that cannot be used costs the language, never the swap', async () => {
  const broken = await homeWith('not json');
  const folder = await homeWith(undefined);
  await mkdir(join(folder, '.agentwhy', 'notices.json'), { recursive: true });
  for (const home of [broken, folder]) {
    const run = await runCli(['hide-keys'], { input: swapIn('/opt/fictional'), env: { ...ENGLISH, HOME: home } });
    assert.equal(run.code, 0);
    assert.ok(!run.stdout.includes(GITHUB), 'the key stays out');
    assert.match(JSON.parse(run.stdout).systemMessage, /hid 1 key from your AI/);
    await rm(home, { recursive: true, force: true });
  }
});

// `2026-11-09-codex-hides-keys.md` CH1-CH3: the same switch in Codex, which runs its hook in every folder on the computer. Codex
// hands what the command printed as a string, and keeps a key from its model only where the whole result is the hook's words.
const SWITCH_ON = { hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'npx @agentwhy/cli hide-keys' }] }] } };
const SET_UP_ONLY = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'npx @agentwhy/cli watch' }] }] } };
const codexCall = (cwd: string, printed: unknown, tool = 'Bash'): string =>
  JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { command: 'cat settings.yml' }, tool_response: printed, cwd });

async function computer(projects: Readonly<Record<string, object>>): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agentwhy-codex-keys-'));
  for (const [folder, settings] of Object.entries(projects)) {
    await mkdir(join(home, folder, '.claude'), { recursive: true });
    await writeFile(join(home, folder, '.claude', 'settings.local.json'), JSON.stringify(settings));
  }
  return home;
}

test('CH1, CH3: where the switch is on, the whole result with the key swapped, and the notice after it', async () => {
  const home = await computer({ shop: SWITCH_ON });
  const printed = `# settings\ntoken:\t${GITHUB}\nmode: dev\n`;
  const run = await runCli(['hide-keys', '--codex'], { input: codexCall(join(home, 'shop'), printed), env: { ...ENGLISH, HOME: home } });
  assert.equal(run.code, 0);
  assert.equal(run.stderr, '');
  assert.ok(!run.stdout.includes(GITHUB));
  const answer = JSON.parse(run.stdout);
  assert.deepEqual(Object.keys(answer), ['decision', 'reason']);
  assert.equal(answer.decision, 'block');
  assert.ok(answer.reason.startsWith(`# settings\ntoken:\t${PLACEHOLDER}\nmode: dev\n\n\n[agentwhy: the command ran; this is its output. agentwhy hid 1 key(s)`), answer.reason);
  assert.match(answer.reason, /Do not write the placeholder into a file/);
  await rm(home, { recursive: true, force: true });
});

test('CH2: a session below the project is the project\'s, and a failed command\'s output is hidden as well', async () => {
  const home = await computer({ shop: SWITCH_ON });
  const run = await runCli(['hide-keys', '--codex'], { input: codexCall(join(home, 'shop', 'src', 'deep'), `Exit code: 3\ntoken: ${GITHUB}\n`), env: { ...ENGLISH, HOME: home } });
  assert.equal(JSON.parse(run.stdout).decision, 'block');
  assert.ok(!run.stdout.includes(GITHUB));
  await rm(home, { recursive: true, force: true });
});

test('CH2, KR10: where the switch is off, nothing at all - so Codex goes on with the result it has', async () => {
  const home = await computer({ shop: SWITCH_ON, 'shop/other': SET_UP_ONLY, bare: {} });
  const where = [
    join(home, 'elsewhere'), // no project
    join(home, 'shop', 'other'), // a project of agentwhy's inside one with the switch on answers for itself
    home, // the home folder is never a project
  ];
  for (const cwd of where) {
    const run = await runCli(['hide-keys', '--codex'], { input: codexCall(cwd, `token: ${GITHUB}\n`), env: { ...ENGLISH, HOME: home } });
    assert.equal(run.code, 0, cwd);
    assert.equal(run.stdout, '', cwd);
    assert.equal(run.stderr, '', cwd);
  }
  // A `.claude` of no agentwhy hook is no project of agentwhy's: the walk goes on to the one above it.
  const inside = await runCli(['hide-keys', '--codex'], { input: codexCall(join(home, 'shop'), `token: ${GITHUB}\n`), env: { ...ENGLISH, HOME: home } });
  assert.equal(JSON.parse(inside.stdout).decision, 'block');
  await mkdir(join(home, 'shop', 'tool', '.claude'), { recursive: true });
  await writeFile(join(home, 'shop', 'tool', '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: [] } }));
  const below = await runCli(['hide-keys', '--codex'], { input: codexCall(join(home, 'shop', 'tool'), `token: ${GITHUB}\n`), env: { ...ENGLISH, HOME: home } });
  assert.equal(JSON.parse(below.stdout).decision, 'block');
  await rm(home, { recursive: true, force: true });
});

test('CH1, KR8: no key, another tool, a result of a shape not measured, or input that cannot be read - nothing written and exit 0', async () => {
  const home = await computer({ shop: SWITCH_ON });
  const cwd = join(home, 'shop');
  const inputs = [
    codexCall(cwd, 'mode: dev\n'),
    codexCall(cwd, `token: ${GITHUB}\n`, 'apply_patch'),
    codexCall(cwd, { stdout: `token: ${GITHUB}\n` }),
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_response: `token: ${GITHUB}`, cwd }),
    JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_response: `token: ${GITHUB}` }),
    '', 'not json', '[]',
  ];
  for (const input of inputs) {
    const run = await runCli(['hide-keys', '--codex'], { input, env: { ...ENGLISH, HOME: home } });
    assert.equal(run.code, 0, input);
    assert.equal(run.stdout, '', input);
    assert.equal(run.stderr, '', input);
  }
  await rm(home, { recursive: true, force: true });
});

test('KR8: settings that cannot be read are a switch that is off', async () => {
  const home = await computer({});
  await mkdir(join(home, 'shop', '.claude', 'settings.local.json'), { recursive: true });
  await writeFile(join(home, 'shop', '.claude', 'settings.json'), 'not json');
  const run = await runCli(['hide-keys', '--codex'], { input: codexCall(join(home, 'shop'), `token: ${GITHUB}\n`), env: { ...ENGLISH, HOME: home } });
  assert.equal(run.code, 0);
  assert.equal(run.stdout, '');
  await rm(home, { recursive: true, force: true });
});

// CH6, after CHB3: Codex keeps what the command printed - key and all - in its item, while the model read the swapped text and
// agentwhy's notice. A report reads what the model was handed, so it says what it said of Claude Code (KR6), and nothing more.
async function codexReported(handed: (printed: string) => string, more: ReadonlyArray<(printed: string) => string> = []): Promise<string> {
  const helpers = await import('../helpers/codex-session.ts');
  const root = await mkdtemp(join(tmpdir(), 'agentwhy-codex-hidden-'));
  const project = join(root, 'fictional-shop');
  await mkdir(project, { recursive: true });
  const rollout = join(root, 'home', '.codex', 'sessions', helpers.rolloutPath(helpers.ROOT));
  await mkdir(join(rollout, '..'), { recursive: true });
  const printed = `token: ${GITHUB}\nmode: dev\n`;
  await writeFile(rollout, [
    helpers.meta(helpers.ROOT, { cwd: project, cli_version: '0.166.0' }), helpers.turnContext(helpers.TURN, { cwd: project }),
    helpers.given('user', 'Print notes.txt'),
    ...[handed, ...more].flatMap((each, at) => [
      helpers.cell(`call_${at}`, 'text(await tools.exec_command({ cmd: "cat notes.txt" }));'),
      helpers.item(helpers.ROOT, helpers.command(`exec_${at}`, 'cat notes.txt', printed)),
      helpers.cellOutput(`call_${at}`, each(printed)),
    ]),
    helpers.said('msg_1', 'final_answer', 'Done.'),
  ].map((line) => JSON.stringify(line)).join('\n') + '\n');
  const run = await runCli(['report', '--input', rollout, '--full'], { cwd: project, env: { HOME: join(root, 'home'), ...ENGLISH } });
  await rm(root, { recursive: true, force: true });
  assert.equal(run.code, 0, run.stderr);
  assert.ok(!run.stdout.includes(GITHUB));
  return run.stdout;
}

test('CH6: a Codex output agentwhy swapped is no key the AI saw, and the report says it was hidden', async () => {
  const notice = '[agentwhy: the command ran; this is its output. agentwhy hid 1 key(s) in this tool\'s result: each now reads [redacted by agentwhy].]';
  const out = await codexReported((printed) => `Script error:\n${printed.replace(GITHUB, PLACEHOLDER)}\n\n${notice}`);
  assert.ok(!out.includes('shaped like a key'), 'the model never read a key');
  assert.match(out, /Keys hidden from the AI/);
});

test('CH6, KR10: the same turn with no swap, or a placeholder with no notice of agentwhy\'s, reads as it always did', async () => {
  assert.match(await codexReported((printed) => printed), /shaped like a key/);
  const bare = await codexReported((printed) => `Script error:\n${printed.replace(GITHUB, PLACEHOLDER)}`);
  assert.match(bare, /shaped like a key/, 'only agentwhy\'s notice makes the placeholder its own');
  assert.ok(!bare.includes('Keys hidden from the AI'));
});

// CH6, after CHB2: in the maintainer's Codex desktop app the same file was printed in three turns, so its swapped text stood in
// three returns, and a settled cell returned it escaped in a result's JSON. The question is whether a key reached the model.
const CODEX_NOTICE = '[agentwhy: the command ran; this is its output. agentwhy hid 1 key(s) in this tool\'s result: each now reads [redacted by agentwhy].]';
const swappedReturn = (printed: string): string => `Script error:\n${printed.replace(GITHUB, PLACEHOLDER)}\n\n${CODEX_NOTICE}`;

test('CH6: one file swapped in several turns, and a swap returned in a result\'s JSON, are hidden keys too', async () => {
  const twice = await codexReported(swappedReturn, [swappedReturn]);
  assert.ok(!twice.includes('shaped like a key'), twice);
  assert.match(twice, /Keys hidden from the AI/);
  const json = await codexReported((printed) => `Script completed\n${JSON.stringify([{ status: 'rejected', reason: `${printed.replace(GITHUB, PLACEHOLDER)}\n\n${CODEX_NOTICE}` }])}`);
  assert.ok(!json.includes('shaped like a key'), json);
  assert.match(json, /Keys hidden from the AI/);
});

test('CH6: where any return of the conversation holds one of its keys, the key reached the AI, and is said', async () => {
  const leaked = await codexReported(swappedReturn, [(printed) => printed]);
  assert.match(leaked, /shaped like a key/);
});
