// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS_DIRECTORY, projectDirectoryName } from '../../src/adapter/claude-code/contract/projects.ts';
import { jsonl, writeSession } from '../helpers/synthetic-session.ts';

const CLI = fileURLToPath(new URL('../../src/cli.ts', import.meta.url));

/** One conversation Claude Code kept for a project, held in the terminal: a read, and what it answered. */
async function conversation(home: string, project: string, id: string): Promise<void> {
  const stored = join(home, ...PROJECTS_DIRECTORY, projectDirectoryName(project));
  await mkdir(stored, { recursive: true });
  await writeFile(
    join(stored, `${id}.jsonl`),
    jsonl(
      { type: 'assistant', isSidechain: false, cwd: project, entrypoint: 'cli', message: { role: 'assistant', content: [{ type: 'tool_use', id: `toolu_01${id}`, name: 'Read', input: { file_path: `${project}/README.md` } }] } },
      { type: 'user', isSidechain: false, cwd: project, entrypoint: 'cli', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_01${id}`, content: 'hello' }] } },
    ),
  );
}

/** A request to the page's server as the page makes it: to its own host, from its own origin. */
function send(url: string, method: string, body?: string): Promise<{ readonly status: number; readonly body: string; readonly location?: string }> {
  const { host, origin } = new URL(url);
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { method, headers: { host, origin, 'content-type': 'application/json' } }, (incoming) => {
      let text = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => { text += chunk; });
      incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, body: text, ...(incoming.headers.location === undefined ? {} : { location: incoming.headers.location }) }));
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

// which-project V14-V18, end to end: two fictional projects, one process, the page moved from one to the other.
test('a page switches to another project at the same address, and a page of the one before is told so and offered it back', { timeout: 60_000 }, async (t) => {
  const home = await realpath(await writeSession(t, {}));
  const shop = await realpath(await writeSession(t, { 'README.md': 'shop' }));
  const blog = await realpath(await writeSession(t, { 'README.md': 'blog' }));
  const out = await realpath(await writeSession(t, {}));
  await conversation(home, shop, 'aaaaaaaa-1111-4111-8111-111111111111');
  await conversation(home, blog, 'bbbbbbbb-2222-4222-8222-222222222222');

  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(CLAUDECODE|CLAUDE_CODE_.*)$/.test(name)));
  const child = spawn(process.execPath, [CLI, 'start', '--no-open', '--serve', '--out', out], { cwd: shop, env: { ...inherited, HOME: home } });
  t.after(() => { child.kill(); });
  let printed = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { printed += chunk; });
  const waitFor = async (pattern: RegExp): Promise<RegExpExecArray> => {
    for (let tries = 0; tries < 400; tries += 1) {
      const found = pattern.exec(printed);
      if (found !== null) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail(`never printed ${pattern}: ${printed}`);
  };

  const first = (await waitFor(/Serving the page at (http:\/\/127\.0\.0\.1:\d+\/[^/\s]+\/)\S*/))[1] as string;
  const moved = await send(first + 'api/switch-project', 'POST', JSON.stringify({ id: projectDirectoryName(blog) }));
  assert.equal(moved.status, 200, moved.body);
  const { url } = JSON.parse(moved.body) as { url: string };
  assert.equal(new URL(url).origin, new URL(first).origin, 'V14, amended: the same address, so a page of the project before still reaches the process');
  assert.notEqual(new URL(url).pathname.split('/')[1], new URL(first).pathname.split('/')[1], 'with a token of its own (V17)');

  // V16: a project nobody set up opens its onboarding, as `agentwhy` typed in its folder would (W23) - at Who, since the
  // project was chosen on the way here.
  const page = await send(url, 'GET');
  assert.equal(page.status, 200);
  assert.ok(url.endsWith('/onboarding.html#who') && page.body.includes('<title>Welcome · agentwhy</title>'), url);
  const index = await send(url.replace(/[^/]+$/, 'index.html'), 'GET');
  assert.equal(index.status, 200);
  assert.ok(index.body.includes(`<span class="sb-project-name">${blog.split('/').pop()}</span>`), 'and what it serves is the other project’s');
  await waitFor(/Now showing /);

  // The maintainer's case, 2026-09-28: "Back" after the switch reached nothing. Now a page of the project before is told
  // what happened - nothing of it is served, and nothing written from it but the way back (V17).
  const shopName = shop.split('/').pop() as string;
  const blogName = blog.split('/').pop() as string;
  const back = await send(first + 'index.html', 'GET');
  assert.equal(back.status, 200);
  assert.ok(back.body.includes(`This page was for <strong>${shopName}</strong>.`) && back.body.includes(`agentwhy now shows <strong>${blogName}</strong>.`), back.body.slice(0, 200));
  assert.ok(back.body.includes(`href="${url}"`), 'Go to blog is where blog opens now: its onboarding, at Who - nobody has set it up (the maintainer)');
  assert.equal((await send(first + 'api/version/index.html', 'GET')).status, 410, 'a tab left open on it says so at once');
  assert.equal((await send(first + 'api/mark', 'POST', '{}')).status, 404, 'and writes nothing');

  const again = await send(first + 'api/switch-back', 'POST', '{}');
  assert.equal(again.status, 200, again.body);
  const shopAgain = (JSON.parse(again.body) as { url: string }).url;
  const shopPage = await send(shopAgain.replace(/[^/]+$/, 'index.html'), 'GET');
  assert.ok(shopPage.body.includes(`<span class="sb-project-name">${shopName}</span>`), 'shop is shown again, by a run of its own');
  assert.ok((await send(url.replace(/[^/]+$/, 'index.html'), 'GET')).body.includes(`This page was for <strong>${blogName}</strong>.`), 'and blog\'s pages are told so now');
  const home_ = await send(first + 'index.html', 'GET');
  assert.deepEqual([home_.status, home_.location], [302, `/${new URL(shopAgain).pathname.split('/')[1]}/index.html`], 'shop\'s first pages go to the run that shows it now');
});
