// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { LocalRequest } from '../../../../src/ports/local-server.ts';
import type { MarkRequest } from '../../../../src/report/check/mark-request.ts';
import { indexHandler } from '../../../../src/report/start/serve/index-handler.ts';
import type { SettingsAnswer, SettingsChange } from '../../../../src/report/start/serve/settings-request.ts';
import type { NoticeChange } from '../../../../src/report/watch/notice-settings.ts';

const ORIGIN = 'http://127.0.0.1:43123';
const TOKEN = '6f1c2d7e-token';

function handlerIn(answer: 'marked' | 'mark-refused' = 'marked') {
  const marked: MarkRequest[] = [];
  const unmarked: string[] = [];
  let rendered = 0;
  const handle = indexHandler({
    origin: ORIGIN,
    token: TOKEN,
    files: new Set(['index.html', 'sess-1.html']),
    read: async (name) => `<html>${name}</html>`,
    mark: async (request) => {
      marked.push(request);
      return { outcome: answer, output: answer === 'marked' ? 'Marked .env as rotated.\n' : '.env is not a line of the check.\n' };
    },
    unmark: async (path) => {
      unmarked.push(path);
      return { outcome: 'marked', output: '.env is back in To do.\n' };
    },
    rerender: async () => {
      rendered += 1;
    },
  });
  return { handle, marked, unmarked, rendered: () => rendered };
}

const request = (partial: Partial<LocalRequest>): LocalRequest => ({
  method: 'GET',
  path: `/${TOKEN}/index.html`,
  headers: { host: '127.0.0.1:43123' },
  body: '',
  ...partial,
});
const post = (route: string, body: object, headers: Record<string, string> = {}): LocalRequest =>
  request({
    method: 'POST',
    path: `/${TOKEN}/${route}`,
    headers: { host: '127.0.0.1:43123', origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

// worth-running-every-day R51: the address is the only way in.
test('the pages this run wrote are served under the token, and nothing else is', async () => {
  const { handle } = handlerIn();

  assert.deepEqual(await handle(request({})), { status: 200, type: 'text/html; charset=utf-8', body: '<html>index.html</html>' });
  assert.equal((await handle(request({ path: `/${TOKEN}/` }))).status, 200, 'the directory is its index');
  assert.equal((await handle(request({ path: `/${TOKEN}/sess-1.html` }))).status, 200);
  assert.equal((await handle(request({ path: '/index.html' }))).status, 404, 'no token');
  assert.equal((await handle(request({ path: '/wrong-token/index.html' }))).status, 404);
  assert.equal((await handle(request({ path: `/${TOKEN}/../marks.jsonl` }))).status, 404, 'a path is never built from the request');
  assert.equal((await handle(request({ path: `/${TOKEN}/other.html` }))).status, 404, 'a file this run did not write');
});

// DNS rebinding: a name that resolves to 127.0.0.1 is not the address the page was opened on.
test('a request for another host gets nothing, whatever its path', async () => {
  const { handle } = handlerIn();

  assert.equal((await handle(request({ headers: { host: 'evil.example:43123' } }))).status, 403);
  assert.equal((await handle(request({ headers: {} }))).status, 403);
});

// R52: a write needs the page's own origin and JSON - a form or a link on another site cannot send one.
test('a write from another origin, or not as JSON, is refused before anything is recorded', async () => {
  const { handle, marked } = handlerIn();

  assert.equal((await handle(post('api/mark', { path: '.env', result: 'rotated' }, { origin: 'https://example.com' }))).status, 403);
  assert.equal((await handle(post('api/mark', { path: '.env', result: 'rotated' }, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal((await handle(request({ method: 'POST', path: `/${TOKEN}/api/mark`, headers: { host: '127.0.0.1:43123', origin: ORIGIN, 'content-type': 'application/json' }, body: '{' }))).status, 400);
  assert.equal((await handle(post('api/mark', { path: '.env', result: 'deleted' }))).status, 400);
  assert.equal((await handle(post('api/mark', { result: 'rotated' }))).status, 400);
  assert.equal((await handle(post('api/delete', { path: '.env' }))).status, 404);
  assert.deepEqual(marked, []);
});

test('a mark is recorded, the index rendered again, and the answer says so', async () => {
  const { handle, marked, rendered } = handlerIn();

  const response = await handle(post('api/mark', { path: '.env', result: 'rotated', note: 'new keys' }));

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true, message: 'Marked .env as rotated.' });
  assert.deepEqual(marked, [{ path: '.env', result: 'rotated', note: 'new keys' }]);
  assert.equal(rendered(), 1);
});

test('a refused mark is answered with its reason and renders nothing', async () => {
  const { handle, rendered } = handlerIn('mark-refused');

  const response = await handle(post('api/mark', { path: '.env', result: 'rotated' }));

  assert.equal(response.status, 422);
  assert.deepEqual(JSON.parse(response.body), { ok: false, message: '.env is not a line of the check.' });
  assert.equal(rendered(), 0);
});

// F25, F50: the report page's two results travel the same route; which line may take which is `recordMark`'s rule.
test('a mark may say handled or not private', async () => {
  const { handle, marked } = handlerIn();

  assert.equal((await handle(post('api/mark', { path: 'data/customers.csv', result: 'handled' }))).status, 200);
  assert.equal((await handle(post('api/mark', { path: 'notes.csv', result: 'not-private' }))).status, 200);
  assert.deepEqual(marked.map((mark) => mark.result), ['handled', 'not-private']);
});

test('an unmark is recorded the same way', async () => {
  const { handle, unmarked, rendered } = handlerIn();

  assert.equal((await handle(post('api/unmark', { path: '.env' }))).status, 200);
  assert.deepEqual(unmarked, ['.env']);
  assert.equal(rendered(), 1);
});

// ── Settings writes through the same server (worth-running-every-day R57-R60) ──────────────────────────────────
function settingsHandlerIn(answer: SettingsAnswer = { outcome: 'written', output: 'Wrote .claude/settings.local.json.\n' }) {
  const changes: SettingsChange[] = [];
  let rendered = 0;
  const handle = indexHandler({
    origin: ORIGIN,
    token: TOKEN,
    files: new Set(['index.html']),
    read: async (name) => `<html>${name}</html>`,
    mark: async () => ({ outcome: 'marked', output: '' }),
    unmark: async () => ({ outcome: 'marked', output: '' }),
    settings: async (change) => {
      changes.push(change);
      return answer;
    },
    rerender: async () => {
      rendered += 1;
    },
  });
  return { handle, changes, rendered: () => rendered };
}

test('a run that cannot write settings has no route to write them', async () => {
  const { handle } = handlerIn();
  const answer = await handle(post('api/settings', { change: 'hooks', hooks: ['watch'], on: true }));

  assert.equal(answer.status, 404, 'a shared page, or a run with no project, answers as for any name it was not given');
});

test('one change per request, in the shape the init flags already have', async () => {
  const { handle, changes, rendered } = settingsHandlerIn();

  assert.equal((await handle(post('api/settings', { change: 'hooks', hooks: ['watch'], on: true }))).status, 200);
  assert.equal((await handle(post('api/settings', { change: 'hooks', hooks: ['refuse'], on: false }))).status, 200);
  assert.equal((await handle(post('api/settings', { change: 'protect', pattern: '  config/*.pem  ' }))).status, 200);
  assert.equal((await handle(post('api/settings', { change: 'unprotect', pattern: '.npmrc' }))).status, 200);
  assert.equal((await handle(post('api/settings', { change: 'edit', from: ' .npmrc ', pattern: 'config/*.key' }))).status, 200);

  assert.deepEqual(changes, [
    { change: 'hooks', hooks: ['watch'], on: true },
    { change: 'hooks', hooks: ['refuse'], on: false },
    { change: 'protect', pattern: 'config/*.pem' },
    { change: 'unprotect', pattern: '.npmrc' },
    { change: 'edit', from: '.npmrc', pattern: 'config/*.key' },
  ]);
  // R60: the page is rendered again from the file, so what it shows next is what the file now holds.
  assert.equal(rendered(), 5);
});

test('a body this does not recognise is refused, and nothing is written', async () => {
  const { handle, changes, rendered } = settingsHandlerIn();
  const refused = async (body: object): Promise<string> => {
    const answer = await handle(post('api/settings', body));
    assert.equal(answer.status, 400);
    return JSON.parse(answer.body).message;
  };

  assert.match(await refused({ change: 'rewrite' }), /hooks, protect, unprotect, edit, move, adopt, scope, mode, uninstall or update/);
  assert.match(await refused({ change: 'hooks', hooks: 'watch', on: true }), /a list/i);
  assert.match(await refused({ change: 'hooks', hooks: ['watch', 'delete'], on: true }), /watch or refuse/);
  // A hook change that names no hook would once have meant "take them all out"; it now names nothing to do.
  assert.match(await refused({ change: 'hooks', hooks: [], on: false }), /hook is required/);
  assert.match(await refused({ change: 'hooks', hooks: ['watch'] }), /true or false/);
  assert.match(await refused({ change: 'protect', pattern: '   ' }), /pattern is required/);
  assert.match(await refused({ change: 'edit', pattern: 'config/*.pem' }), /pattern being changed is required/);

  assert.deepEqual(changes, []);
  assert.equal(rendered(), 0);
});

// `nothing-updates-by-itself` U7: the update notice's change names nothing more.
test('an update is accepted as it is, and passed on as one change', async () => {
  const { handle, changes } = settingsHandlerIn();
  assert.equal((await handle(post('api/settings', { change: 'update' }))).status, 200);
  assert.deepEqual(changes, [{ change: 'update' }]);
});

// F59: the page names each file and the rules it takes out of it; a file with none still loses its hooks.
test('an uninstall names its files and their rules, and a body naming none is refused', async () => {
  const { handle, changes } = settingsHandlerIn();
  const status = async (body: object): Promise<number> => (await handle(post('api/settings', body))).status;

  assert.equal(await status({ change: 'uninstall', rules: { local: [' **/.env* '], shared: [] } }), 200);
  assert.equal(await status({ change: 'uninstall', rules: {} }), 400);
  assert.equal(await status({ change: 'uninstall', rules: { elsewhere: [] } }), 400);
  assert.equal(await status({ change: 'uninstall', rules: { local: [7] } }), 400);
  assert.equal(await status({ change: 'uninstall' }), 400);
  // `codex-approves-its-own-hook` AO17: the ticked choice, and anything but true read as unticked.
  assert.equal(await status({ change: 'uninstall', rules: { local: [] }, codex: true }), 200);
  assert.equal(await status({ change: 'uninstall', rules: { local: [] }, codex: 'yes' }), 200);

  assert.deepEqual(changes, [
    { change: 'uninstall', rules: { local: ['**/.env*'], shared: [] } },
    { change: 'uninstall', rules: { local: [] }, codex: true },
    { change: 'uninstall', rules: { local: [] } },
  ]);
});

test('a refusal comes back in the setup own words, and the page is not rendered again', async () => {
  const { handle, rendered } = settingsHandlerIn({ outcome: 'refused', output: '.claude/settings.local.json is not a JSON object.\n' });
  const answer = await handle(post('api/settings', { change: 'protect', pattern: 'config/*.pem' }));

  assert.equal(answer.status, 422);
  assert.deepEqual(JSON.parse(answer.body), { ok: false, message: '.claude/settings.local.json is not a JSON object.' });
  assert.equal(rendered(), 0);
});

test('a change that was already made is a success, not a refusal', async () => {
  const { handle, rendered } = settingsHandlerIn({ outcome: 'unchanged', output: 'config/*.pem is already protected.\n' });
  const answer = await handle(post('api/settings', { change: 'protect', pattern: 'config/*.pem' }));

  assert.equal(answer.status, 200);
  assert.deepEqual(JSON.parse(answer.body), { ok: true, message: 'config/*.pem is already protected.' });
  assert.equal(rendered(), 1, 'the page is read again either way: it shows the file, not the click');
});

test('a settings write from another origin, or without JSON, gets nothing', async () => {
  const { handle, changes } = settingsHandlerIn();

  assert.equal((await handle(post('api/settings', { change: 'protect', pattern: 'x' }, { origin: 'http://evil.test' }))).status, 403);
  assert.equal((await handle(post('api/settings', { change: 'protect', pattern: 'x' }, { 'content-type': 'text/plain' }))).status, 415);
  assert.deepEqual(changes, []);
});

/*
 * `the-agent-tells-you` R26a: the third thing the page can write, and the only one that touches no project. It
 * writes what a person is told, never what their agents may do, and it goes through the same use case the
 * `notify` command runs.
 */
function notifyingHandler(written = true) {
  const changes: NoticeChange[] = [];
  let rendered = 0;
  const handle = indexHandler({
    origin: ORIGIN,
    token: TOKEN,
    files: new Set(['index.html']),
    read: async () => '<html></html>',
    mark: async () => ({ outcome: 'marked', output: '' }),
    unmark: async () => ({ outcome: 'marked', output: '' }),
    notify: async (change) => {
      changes.push(change);
      return written ? { written, said: 'Answers written for /work/the-app.' } : { written, said: 'Nothing was written.' };
    },
    rerender: async () => {
      rendered += 1;
    },
  });
  return { handle, changes, rendered: () => rendered };
}

test('a notification choice is written, and the page is rendered again', async () => {
  const { handle, changes, rendered } = notifyingHandler();

  const answer = await handle(post('api/notify', { scope: 'project', on: 'reached' }));
  await handle(post('api/notify', { scope: 'everywhere', clean: 'every-turn', notify: ['chat', 'os'] }));
  await handle(post('api/notify', { scope: 'project', reset: true }));
  await handle(post('api/notify', { scope: 'everywhere', lang: 'pl' }));

  assert.equal(answer.status, 200);
  assert.deepEqual(changes, [
    { scope: 'project', choices: { on: 'reached' } },
    { scope: 'everywhere', choices: { clean: 'every-turn', notify: ['chat', 'os'] } },
    { scope: 'project', choices: {}, reset: true },
    { scope: 'everywhere', choices: { lang: 'pl' } },
  ]);
  assert.equal(rendered(), 4);
});

test('a body this version does not know writes nothing and says what it takes', async () => {
  const { handle, changes, rendered } = notifyingHandler();

  for (const body of [
    { on: 'reached' },
    { scope: 'elsewhere', on: 'reached' },
    { scope: 'project', on: 'everything' },
    { scope: 'project', clean: 'sometimes' },
    { scope: 'project', notify: ['email'] },
    { scope: 'project', notify: [] },
    { scope: 'everywhere', lang: 'fr' },
    { scope: 'project' },
  ]) {
    const answer = await handle(post('api/notify', body));
    assert.equal(answer.status, 400, JSON.stringify(body));
  }
  assert.deepEqual(changes, [], 'nothing reached the use case');
  assert.equal(rendered(), 0);
});

// Mirrors the CLI's `--reset` combined with a flag: refused rather than guessed at, so a choice sent alongside
// `reset` is never silently dropped in favour of the reset alone.
test('reset combined with a choice is refused, not silently reset alone', async () => {
  const { handle, changes, rendered } = notifyingHandler();

  const answer = await handle(post('api/notify', { scope: 'project', reset: true, on: 'refused' }));

  assert.equal(answer.status, 400);
  assert.match(JSON.parse(answer.body as string).message ?? answer.body, /cannot be given alongside/);
  assert.deepEqual(changes, [], 'nothing reached the use case');
  assert.equal(rendered(), 0);
});

// A shared page names no machine and offers no choices, so the route is not there at all - not a refusal, a 404.
test('a run with no preferences to write has no route to write them', async () => {
  const { handle } = handlerIn();

  const answer = await handle(post('api/notify', { scope: 'project', on: 'reached' }));

  assert.equal(answer.status, 404);
});

// F55: the fourth thing a served page writes - one conversation's report, by the name its row carries.
test('a conversation older than the run is written on request, and only through the same guards as every write', async () => {
  const asked: string[] = [];
  let rendered = 0;
  const handle = indexHandler({
    origin: ORIGIN,
    token: TOKEN,
    files: new Set(['index.html']),
    read: async () => '',
    mark: async () => ({ outcome: 'marked', output: '' }),
    unmark: async () => ({ outcome: 'marked', output: '' }),
    include: async (name) => {
      asked.push(name);
      return name === 'old' ? { written: true, said: 'The report of old was written.' } : { written: false, said: name + ' is not a conversation this run left out.' };
    },
    rerender: async () => { rendered += 1; },
  });

  assert.equal((await handle(post('api/include', { name: 'old' }))).status, 200);
  assert.equal(rendered, 1, 'the page is read again');
  const refused = await handle(post('api/include', { name: 'covered' }));
  assert.equal(refused.status, 422);
  assert.match(refused.body, /covered is not a conversation this run left out/);
  assert.equal((await handle(post('api/include', {}))).status, 400);
  assert.equal((await handle(post('api/include', { name: 'old' }, { origin: 'http://evil.example' }))).status, 403);
  assert.deepEqual(asked, ['old', 'covered'], 'a bad body and another origin never reach the run');
  assert.equal(rendered, 1);

  const { handle: without } = handlerIn();
  assert.equal((await without(post('api/include', { name: 'old' }))).status, 404, 'a page that cannot ask has no such route');
});

// Onboarding W15: Finish is one request, through the same guards as every write, and absent where it is not served.
test('the onboarding is finished in one request, and only through the same guards as every write', async () => {
  const asked: unknown[] = [];
  let rendered = 0;
  const handle = indexHandler({
    origin: ORIGIN,
    token: TOKEN,
    files: new Set(['index.html', 'onboarding.html']),
    read: async () => '',
    mark: async () => ({ outcome: 'marked', output: '' }),
    unmark: async () => ({ outcome: 'marked', output: '' }),
    onboarding: async (choices) => {
      asked.push(choices);
      return choices.protect.includes('Read(x)')
        ? { outcome: 'refused', message: '"Read(x)" was not written: a deny rule is written as Read(...).' }
        : { outcome: 'finished', results: [{ change: 'watch', written: true, message: 'Written.' }], recorded: true };
    },
    rerender: async () => { rendered += 1; },
  });
  const body = { scope: 'local', watch: true, protect: [], tell: [], modes: {}, stopped: false, fine: true };

  const finished = await handle(post('api/onboarding', body));
  assert.equal(finished.status, 200);
  assert.deepEqual(JSON.parse(finished.body), { ok: true, results: [{ change: 'watch', written: true, message: 'Written.' }], recorded: true });
  assert.equal(rendered, 1, 'every page is read again');

  const refused = await handle(post('api/onboarding', { ...body, protect: ['Read(x)'] }));
  assert.equal(refused.status, 422);
  assert.match(JSON.parse(refused.body).message, /"Read\(x\)" was not written/);
  assert.equal(rendered, 1, 'a refusal wrote nothing, so nothing is read again');

  assert.equal((await handle(post('api/onboarding', { ...body, project: 'elsewhere' }))).status, 400);
  assert.equal((await handle(post('api/onboarding', { ...body, scope: 'everyone' }))).status, 400);
  assert.equal((await handle(post('api/onboarding', body, { origin: 'http://evil.example' }))).status, 403);
  assert.equal((await handle(post('api/onboarding', body, { 'content-type': 'text/plain' }))).status, 415);
  assert.equal(asked.length, 2, 'a bad body, another origin and not JSON never reach the run');

  const { handle: without } = handlerIn();
  assert.equal((await without(post('api/onboarding', body))).status, 404, 'a run that does not serve the onboarding has no such route');
});

// live-pages L1-L3, L16: the version of a served file, and nothing else; the page stamped with it as it is sent.
test('a page asks for its version and is sent stamped with it; a file not served has none', async () => {
  const handle = indexHandler({
    origin: ORIGIN,
    token: TOKEN,
    files: new Set(['index.html', 'sess-1.html']),
    read: async (name) => `<!doctype html><html lang="en" data-lang="en"><body>${name}</body></html>`,
    mark: async () => ({ outcome: 'marked', output: '' }),
    unmark: async () => ({ outcome: 'marked', output: '' }),
    rerender: async () => undefined,
    versionOf: (name) => (name === 'index.html' ? { version: 'v1', conversations: 2 } : name === 'sess-1.html' ? { version: 'r7' } : undefined),
  });

  const asked = await handle(request({ path: `/${TOKEN}/api/version/index.html` }));
  assert.equal(asked.status, 200);
  assert.deepEqual(JSON.parse(asked.body), { version: 'v1', conversations: 2 }, 'the version, and on the index a count - nothing else');
  assert.deepEqual(JSON.parse((await handle(request({ path: `/${TOKEN}/api/version/sess-1.html` }))).body), { version: 'r7' });
  assert.equal((await handle(request({ path: `/${TOKEN}/api/version/other.html` }))).status, 404);
  assert.equal((await handle(request({ path: `/wrong/api/version/index.html` }))).status, 404);

  const page = await handle(request({ path: `/${TOKEN}/sess-1.html` }));
  assert.match(page.body, /^<!doctype html><html data-version="r7" lang="en" data-lang="en">/);
  const plain = await handlerIn().handle(request({ path: `/${TOKEN}/sess-1.html` }));
  assert.equal(plain.body, '<html>sess-1.html</html>', 'a run that keeps no versions sends the file as it is');
});

// which-project V14, V17, V18: a page asks for another project by the id this run listed it under.
test('a switch names a project by its id, answers with the new address, and closes this server once it is sent', async () => {
  const asked: string[] = [];
  let closed = 0;
  const handle = indexHandler({
    origin: ORIGIN,
    token: TOKEN,
    files: new Set(['index.html']),
    read: async (name) => `<html>${name}</html>`,
    mark: async () => ({ outcome: 'marked', output: '' }),
    unmark: async () => ({ outcome: 'marked', output: '' }),
    rerender: async () => undefined,
    switchProject: async (id) => {
      asked.push(id);
      return id === '-Users-someone-blog' ? { url: 'http://127.0.0.1:50000/tok2/index.html' } : { failed: 'That project is not one this page listed.' };
    },
    switched: () => { closed += 1; },
  });

  const moved = await handle(post('api/switch-project', { id: '-Users-someone-blog' }));
  assert.equal(moved.status, 200);
  assert.deepEqual(JSON.parse(moved.body), { ok: true, url: 'http://127.0.0.1:50000/tok2/index.html' });
  assert.equal(closed, 0, 'not closed before the answer is sent');
  moved.after?.();
  assert.equal(closed, 1, 'closed once it has been');

  const refused = await handle(post('api/switch-project', { id: '/Users/someone/secrets' }));
  assert.equal(refused.status, 422);
  assert.deepEqual(JSON.parse(refused.body), { ok: false, message: 'That project is not one this page listed.' });
  assert.equal(refused.after, undefined, 'a refusal leaves this server running');

  assert.equal((await handle(post('api/switch-project', { path: '/Users/someone/blog' }))).status, 400, 'a path is no id');
  assert.equal((await handle(post('api/switch-project', { id: '-Users-someone-blog' }, { origin: 'http://127.0.0.1:50000' }))).status, 403, 'another origin is refused');
  assert.deepEqual(asked, ['-Users-someone-blog', '/Users/someone/secrets']);
});

test('a run that cannot switch has no such route', async () => {
  const { handle } = handlerIn();
  assert.equal((await handle(post('api/switch-project', { id: 'x' }))).status, 404);
});

// which-project V14, amended 2026-09-28 (the maintainer's case: "Back" after a switch reached nothing). A token an
// earlier run of this process gave its pages is answered, and nothing of that project is served or written.
test('a page of a project shown earlier in the process is told so, may ask it back, and nothing else', async () => {
  const backs: string[] = [];
  let switched = 0;
  const handle = indexHandler({
    origin: ORIGIN,
    token: TOKEN,
    files: new Set(['index.html']),
    read: async (name) => `<html>${name}</html>`,
    mark: async () => ({ outcome: 'marked', output: '' }),
    unmark: async () => ({ outcome: 'marked', output: '' }),
    rerender: async () => undefined,
    switched: () => { switched += 1; },
    pastRun: (token) => token === 'shop-token' ? { same: false, page: async () => '<html>This page was for shop.</html>', back: async () => { backs.push(token); return { url: 'http://127.0.0.1:43123/new/index.html' }; } }
      : token === 'blog-token' ? { same: true, page: async () => '', back: async () => ({ failed: 'never' }) }
        : undefined,
  });
  const at = (token: string, rest: string, extra: Partial<LocalRequest> = {}) => handle(request({ path: `/${token}/${rest}`, ...extra }));

  assert.equal((await at('shop-token', 'to-fix.html')).body, '<html>This page was for shop.</html>', 'any page of it says what happened');
  assert.equal((await at('shop-token', 'api/version/index.html')).status, 410, 'a tab left open on it is told it has gone');
  assert.equal((await at('shop-token', 'api/mark', { method: 'POST', headers: { host: '127.0.0.1:43123', origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' })).status, 404, 'V17: nothing is written from it');
  assert.equal((await at('shop-token', 'api/switch-back', { method: 'POST', headers: { host: '127.0.0.1:43123', origin: 'http://evil.example' }, body: '{}' })).status, 403, 'the way back only from its own origin');
  assert.deepEqual(backs, []);

  const again = await at('shop-token', 'api/switch-back', { method: 'POST', headers: { host: '127.0.0.1:43123', origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' });
  assert.deepEqual(JSON.parse(again.body), { ok: true, url: 'http://127.0.0.1:43123/new/index.html' });
  again.after?.();
  assert.deepEqual([backs, switched], [['shop-token'], 1], 'and this run ends once the page has the address');

  const same = await at('blog-token', 'settings.html');
  assert.deepEqual([same.status, same.location], [302, `/${TOKEN}/settings.html`], 'the project shown now sends its earlier pages to this run');
  assert.equal((await at('nobody', 'index.html')).status, 404, 'a token no run gave gets nothing');
});

// `codex-blocks-too` CK5: Block in Codex too names nothing more.
test('Block in Codex too is accepted as it is, and passed on as one change', async () => {
  const { handle, changes } = settingsHandlerIn();
  assert.equal((await handle(post('api/settings', { change: 'codex' }))).status, 200);
  assert.deepEqual(changes, [{ change: 'codex' }]);
});

// onboarding W20a: Done's line about Codex is the answer's, passed on as it is and only where there is one.
test('the onboarding\'s answer carries Codex\'s state to the page, where the run gave one', async () => {
  const answers = [
    { outcome: 'finished' as const, results: [], recorded: true, codex: 'on' as const },
    { outcome: 'finished' as const, results: [], recorded: true },
  ];
  const handle = indexHandler({
    origin: ORIGIN,
    token: TOKEN,
    files: new Set(['index.html', 'onboarding.html']),
    read: async () => '',
    mark: async () => ({ outcome: 'marked', output: '' }),
    unmark: async () => ({ outcome: 'marked', output: '' }),
    onboarding: async () => answers.shift() ?? { outcome: 'finished', results: [], recorded: true },
    rerender: async () => {},
  });
  const body = { scope: 'local', watch: true, protect: [], tell: [], modes: {}, stopped: false, fine: true };
  assert.deepEqual(JSON.parse((await handle(post('api/onboarding', body))).body), { ok: true, results: [], recorded: true, codex: 'on' });
  assert.deepEqual(JSON.parse((await handle(post('api/onboarding', body))).body), { ok: true, results: [], recorded: true });
});
