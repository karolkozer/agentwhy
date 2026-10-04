// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodePageProbe } from '../../src/infrastructure/node-page-probe.ts';

// PF3: a page answers only on this computer, with 200; anything else - another host, a closed port - is no answer.
test('a page on this computer answers with 200, and nothing else counts', async (t) => {
  const server = createServer((request, response) => {
    response.writeHead(request.url === '/tok/index.html' ? 200 : 404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;
  const probe = new NodePageProbe(1_000);

  assert.equal(await probe.answers(`http://127.0.0.1:${port}/tok/index.html`), true);
  assert.equal(await probe.answers(`http://127.0.0.1:${port}/tok/sess-1.html`), false);
  assert.equal(await probe.answers('http://example.com/tok/index.html'), false, 'never another host');
  assert.equal(await probe.answers('not a url'), false);
});
