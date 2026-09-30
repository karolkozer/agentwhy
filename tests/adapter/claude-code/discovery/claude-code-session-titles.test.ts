import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { ClaudeCodeSessionTitles } from '../../../../src/adapter/claude-code/discovery/claude-code-session-titles.ts';
import { SESSION_TITLE } from '../../../../src/adapter/claude-code/contract/session-title.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionSummary } from '../../../../src/core/session-catalogue.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import type { FileTailReader } from '../../../../src/ports/file-tail-reader.ts';
import { jsonl, writeSession } from '../../../helpers/synthetic-session.ts';

function titlesFrom(transcripts: FileTailReader = new NodeFileSystem()): ClaudeCodeSessionTitles {
  return new ClaudeCodeSessionTitles({ transcripts, redactor: new Redactor('test-salt') });
}

function sessionAt(root: string, id = 'sess-x'): SessionSummary {
  return { id, path: join(root, id), modifiedAt: 0, delegations: 0, provider: 'claude-code' };
}

/** The title alone, where a test is about the title. */
async function titleOf(titles: ClaudeCodeSessionTitles, session: SessionSummary): Promise<string | undefined> {
  return (await titles.recognise(session)).title;
}

const title = (aiTitle: unknown) => ({ type: 'ai-title', aiTitle, sessionId: 'sess-x' });
const said = (content: string) => ({ type: 'user', isSidechain: false, message: { role: 'user', content } });

test('the last title is the one a session has now', async (t) => {
  const root = await writeSession(t, {
    'sess-x.jsonl': jsonl(title('First idea'), said('go on'), title('Fix the webhook signature check'), said('thanks')),
  });

  assert.equal(await titleOf(titlesFrom(), sessionAt(root)), 'Fix the webhook signature check');
});

// Invariant 1: a model writes the title from what the user typed, and a user can type a key.
test('a title passes the redactor before anything can show it', async (t) => {
  const token = `ghp_${'A'.repeat(36)}`;
  const root = await writeSession(t, { 'sess-x.jsonl': jsonl(title(`Rotate ${token} after the leak`)) });

  const shown = (await titleOf(titlesFrom(), sessionAt(root))) ?? '';

  assert.ok(!shown.includes(token), 'the value is gone');
  assert.ok(!shown.includes('ghp_A'), 'and so is any prefix of it');
  assert.match(shown, /^Rotate .+ after the leak$/, 'the words around it stay');
});

// L009: only the record's own type makes it a title. A prompt that pastes one is a prompt.
test('a title quoted inside another record is not a title', async (t) => {
  const root = await writeSession(t, {
    'sess-x.jsonl': jsonl(said(JSON.stringify(title('Injected through a prompt')))),
  });

  assert.equal(await titleOf(titlesFrom(), sessionAt(root)), undefined);
});

// L008: a transcript is a live file, and a tail starts wherever the byte count lands.
test('a cut record at either end of the tail is skipped, not read', async () => {
  const asked: number[] = [];
  const titles = titlesFrom({
    readTail: async (_path, bytes) => {
      asked.push(bytes);
      return `ai-title","aiTitle":"Cut at the start"}\n${JSON.stringify(title('Whole'))}\n{"type":"ai-title","aiTitle":"Half wri`;
    },
  });

  assert.equal(await titleOf(titles, sessionAt('/sessions')), 'Whole');
  assert.deepEqual(asked, [SESSION_TITLE.tailBytes], 'and no more than the contract window is asked for');
});

test('a control character in a title is not sent to the terminal', async (t) => {
  const escape = String.fromCharCode(27);
  const root = await writeSession(t, {
    'sess-x.jsonl': jsonl(title(`Fix${escape}[2J the\tenv\nloader`)),
  });

  assert.equal(await titleOf(titlesFrom(), sessionAt(root)), 'Fix [2J the env loader');
});

test('a session with no transcript, no title, or an empty one has no title', async (t) => {
  const root = await writeSession(t, {
    'untitled.jsonl': jsonl(said('hello')),
    'blank.jsonl': jsonl(title('   '), title(42)),
  });
  const titles = titlesFrom();

  assert.equal(await titleOf(titles, sessionAt(root, 'missing')), undefined, 'a missing transcript is not an error');
  assert.equal(await titleOf(titles, sessionAt(root, 'untitled')), undefined);
  assert.equal(await titleOf(titles, sessionAt(root, 'blank')), undefined);
});

// which-project V4, contract v12: where the session was held, from the same read as its title.
const talked = (entrypoint: unknown) => ({ type: 'user', isSidechain: false, entrypoint, cwd: '/Users/someone/shop', message: { role: 'user', content: 'go on' } });

test('which way into Claude Code a session was held is read from the same tail, in a person\'s words', async (t) => {
  const root = await writeSession(t, {
    'editor.jsonl': jsonl(talked('claude-vscode'), title('Fix the checkout button')),
    'terminal.jsonl': jsonl(talked('cli')),
    'script.jsonl': jsonl(talked('sdk-cli')),
  });
  const titles = titlesFrom();

  assert.deepEqual(await titles.recognise(sessionAt(root, 'editor')), { title: 'Fix the checkout button', entryPoint: 'editor' });
  assert.deepEqual(await titles.recognise(sessionAt(root, 'terminal')), { entryPoint: 'terminal' });
  assert.deepEqual(await titles.recognise(sessionAt(root, 'script')), { entryPoint: 'script' });
});

test('a way in the contract does not list is unknown, never the nearest known one, and none is nothing', async (t) => {
  const root = await writeSession(t, {
    'desktop.jsonl': jsonl(talked('claude-desktop')),
    'marker.jsonl': jsonl(talked('AGENTWHY_CANARY_entrypoint')),
    'quiet.jsonl': jsonl(said('hello')),
    'quoted.jsonl': jsonl(said(JSON.stringify(talked('cli')))),
    'odd.jsonl': jsonl(talked(42)),
  });
  const titles = titlesFrom();

  assert.equal((await titles.recognise(sessionAt(root, 'desktop'))).entryPoint, 'unknown');
  assert.equal((await titles.recognise(sessionAt(root, 'marker'))).entryPoint, 'unknown', 'the committed fixtures read as unknown');
  assert.equal((await titles.recognise(sessionAt(root, 'quiet'))).entryPoint, undefined);
  assert.equal((await titles.recognise(sessionAt(root, 'quoted'))).entryPoint, undefined, 'L009: only the record\'s own field');
  assert.equal((await titles.recognise(sessionAt(root, 'odd'))).entryPoint, undefined, 'a value that is not a string says nothing');
  assert.deepEqual(await titles.recognise(sessionAt(root, 'missing')), {}, 'a missing transcript is recognised by nothing');
});

test('the last record that says where the session was held is the one read', async (t) => {
  const root = await writeSession(t, { 'sess-x.jsonl': jsonl(talked('cli'), talked('claude-vscode')) });
  assert.equal((await titlesFrom().recognise(sessionAt(root))).entryPoint, 'editor');
});
