import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { request } from 'node:http';
import { NodeLocalServer } from '../../src/infrastructure/node-local-server.ts';
import type { LocalRequest } from '../../src/ports/local-server.ts';

function send(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { method: options.method ?? 'GET', headers: options.headers }, (incoming) => {
      let body = '';
      incoming.setEncoding('utf8');
      incoming.on('data', (chunk: string) => { body += chunk; });
      incoming.on('end', () => resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers, body }));
    });
    outgoing.on('error', reject);
    outgoing.end(options.body);
  });
}

// worth-running-every-day R50, R51, R54: loopback only, the handler's answer as given, and it stops when idle.
test('it listens on 127.0.0.1 only, hands every request to the handler, and stops when idle', async () => {
  const seen: LocalRequest[] = [];
  const serving = await new NodeLocalServer().serve(
    async (incoming) => {
      seen.push(incoming);
      return { status: 201, type: 'application/json', body: '{"ok":true}' };
    },
    { idleMs: 300, maxBody: 64 },
  );

  assert.match(serving.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await send(`${serving.origin}/t/api/mark?at=1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' });

  assert.equal(response.status, 201);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(seen[0]?.path, '/t/api/mark', 'the query is not part of the path');
  assert.equal(seen[0]?.body, '{"a":1}');
  assert.equal(seen[0]?.headers['content-type'], 'application/json');

  const tooLarge = await send(`${serving.origin}/t/api/mark`, { method: 'POST', body: 'x'.repeat(100) });
  assert.equal(tooLarge.status, 413);
  assert.equal(seen.length, 1, 'a body over the limit never reaches the handler');

  await serving.closed;
});

// which-project V14, amended 2026-09-28: every run of the process at one address, so a page of the one before still
// reaches it. Requests go to the newest run; closing an older one leaves the listener; closing the newest stops it.
test('runs of one process share one address, and the newest answers', async () => {
  const server = new NodeLocalServer();
  const first = await server.serve(async () => ({ status: 200, type: 'text/plain', body: 'first' }), { idleMs: 5_000, maxBody: 64 });
  const second = await server.serve(async () => ({ status: 200, type: 'text/plain', body: 'second' }), { idleMs: 5_000, maxBody: 64 });
  assert.equal(second.origin, first.origin);
  assert.equal((await send(`${first.origin}/any`)).body, 'second');

  first.close();
  await first.closed;
  assert.equal((await send(`${first.origin}/any`)).body, 'second', 'the run switched from ends; the address stays');

  second.close();
  await second.closed;
  await assert.rejects(send(`${first.origin}/any`), 'the last run shown ends, and the listener with it');
});

test('a redirect carries where it sends the page', async () => {
  const serving = await new NodeLocalServer().serve(async () => ({ status: 302, type: 'text/plain', body: '', location: '/t/index.html' }), { idleMs: 5_000, maxBody: 64 });
  const response = await send(`${serving.origin}/old/index.html`);
  assert.deepEqual([response.status, response.headers.location], [302, '/t/index.html']);
  serving.close();
  await serving.closed;
});
