// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { recogniseCodex } from '../../../../src/adapter/codex/discovery/codex-recognition.ts';
import { CodexSessionDiscovery } from '../../../../src/adapter/codex/discovery/codex-session-discovery.ts';
import { NodeFileSystem } from '../../../../src/infrastructure/node-file-system.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import { meta, ROOT, rolloutPath, CHILD } from '../../../helpers/codex-session.ts';
import { CANARY, jsonl, writeSession } from '../../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();

// X2: a folder is Codex's when it holds one Codex rollout - which the first one recognised answers, so no more are read.
test('a folder is recognised by its first Codex rollout, and nothing after it is read', async (t) => {
  const root = await writeSession(t, {
    [rolloutPath(ROOT)]: jsonl(meta(ROOT)),
    [rolloutPath(CHILD)]: jsonl(meta(CHILD)),
    'strays/rollout-2026-09-29T12-00-00-stray.jsonl': jsonl({ type: CANARY, payload: {} }),
  });
  let headersRead = 0;
  const counting: FileReader = {
    readText: (path) => files.readText(path),
    readLines(path) { headersRead += 1; return files.readLines(path); },
  };

  assert.equal(await recogniseCodex(new CodexSessionDiscovery({ directories: files, files: counting }), files, join(root, '2026')), 'recognised');
  assert.equal(headersRead, 1);
  const discovery = new CodexSessionDiscovery({ directories: files, files });
  assert.equal(await recogniseCodex(discovery, files, join(root, 'strays')), 'unknown', 'a rollout name alone is no session');
  assert.equal(await recogniseCodex(discovery, files, join(root, 'missing')), 'unavailable');
});
