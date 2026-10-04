// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { ClaudeCodeSessionDiscovery } from '../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionSource } from '../../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { protectedAccesses } from '../../../src/core/access/protected-access.ts';
import { traceValues } from '../../../src/core/access/returns.ts';
import { valueUses, type ValueUse } from '../../../src/core/access/uses.ts';
import type { SessionModel } from '../../../src/core/session-model.ts';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import { ONWARD_SESSION_ID, onwardSessionFiles, type OnwardVariant } from '../../helpers/onward-session.ts';
import { writeSession } from '../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });
/** Where the delegated agents find the value, and where the session reads it itself. */
const FOUND = 'apps/web/.env.development';
const READ = 'apps/web/.env';

/** Every use, as a reader would sum it up: whose, where it landed and on what, what it came after, and from which file. */
async function usesOf(t: Parameters<typeof writeSession>[0], variant: OnwardVariant): Promise<{ model: SessionModel; uses: ValueUse[] }> {
  const root = await writeSession(t, onwardSessionFiles(variant));
  const model = await source.read(join(root, `${ONWARD_SESSION_ID}.jsonl`));
  const redactor = new Redactor('test');
  const accesses = protectedAccesses(model, DEFAULT_POLICY);
  return { model, uses: valueUses(model, accesses, traceValues(model, accesses, (values) => redactor.trace(values))) };
}

async function told(t: Parameters<typeof writeSession>[0], variant: OnwardVariant): Promise<object[]> {
  const { model, uses } = await usesOf(t, variant);

  return uses.map((use) => ({
    who: use.agentId === model.sessionId ? 'session' : use.agentId,
    landed: use.landed,
    ...(use.targets === undefined ? {} : { targets: use.targets, intoProtected: use.intoProtected }),
    ...(use.programs === undefined ? {} : { programs: use.programs, commits: use.commits }),
    source: use.source,
    ...(use.sourceTargets === undefined ? {} : { sourceTargets: use.sourceTargets }),
    files: use.files,
  }));
}

// Criteria 6, 9 and 11: the value came back, and the session said it, wrote it into a file and committed it.
test('a value that came back is a use wherever the session put it, each after what came back', async (t) => {
  assert.deepEqual(await told(t, 'delegated'), [
    { who: 'session', landed: 'said', source: 'returned', files: [FOUND] },
    { who: 'session', landed: 'file', targets: ['notes/webhook.md'], intoProtected: false, source: 'returned', files: [FOUND] },
    { who: 'session', landed: 'command', programs: ['git'], commits: true, source: 'returned', files: [FOUND] },
    { who: 'a6666666666666666', landed: 'said', source: 'read', files: [FOUND] },
  ]);
});

// Criteria 6 and 8, and decision 2 of what-came-back: no delegation, and the value still goes into files.
test('a value the session read itself is a use in every file it wrote, and one of them is protected', async (t) => {
  assert.deepEqual(await told(t, 'direct'), [
    { who: 'session', landed: 'file', targets: ['notes/webhook.md'], intoProtected: false, source: 'read', files: [READ] },
    { who: 'session', landed: 'file', targets: ['apps/api/config.ts'], intoProtected: false, source: 'read', files: [READ] },
    { who: 'session', landed: 'file', targets: ['apps/web/.env.production'], intoProtected: true, source: 'read', files: [READ] },
  ]);
});

// Criteria 7 and 11: a value only in the text an edit takes out is no use, and a use with nothing before it says so.
test('a value used before anything in the record carried it has no source, and one only taken out is no use', async (t) => {
  assert.deepEqual(await told(t, 'typed-first'), [
    { who: 'session', landed: 'file', targets: ['/Users/someone/.claude/plans/webhook.md'], intoProtected: false, source: 'none', files: [READ] },
    { who: 'session', landed: 'command', programs: ['curl'], commits: false, source: 'read', files: [READ] },
  ]);
});

// Criterion 11 with R3: a report delivered late is a return, and a file another agent read is an unprotected source.
test('a report delivered late is what the session had it from, and another agent may have it from a plain file', async (t) => {
  assert.deepEqual(await told(t, 'background'), [
    { who: 'session', landed: 'said', source: 'returned', files: [FOUND] },
    { who: 'session', landed: 'file', targets: ['docs/incident.md'], intoProtected: false, source: 'returned', files: [FOUND] },
    { who: 'a7777777777777777', landed: 'said', source: 'read', files: [FOUND] },
    { who: 'a8888888888888888', landed: 'command', programs: ['grep'], commits: false, source: 'unprotected', files: [FOUND] },
  ]);
});

// Criterion 10: a value in a delegation's prompt is handed on to another agent.
test('a value in the prompt of a delegation is a use of its own kind', async (t) => {
  assert.deepEqual(await told(t, 'handed-on'), [{ who: 'session', landed: 'delegation', source: 'read', files: [READ] }]);
});

// agent-flow R4: a use points at what it came after - the record of its source, and the delegation a return came from.
test('a use carries the record of what it came after, and the delegation a return came from', async (t) => {
  const delegated = await usesOf(t, 'delegated');
  const typedFirst = await usesOf(t, 'typed-first');
  const delegation = delegated.model.delegations[0]?.id;

  assert.deepEqual(
    delegated.uses.map((use) => [use.landed, use.sourceRecord, use.sourceDelegationId === delegation]),
    [['said', 2, true], ['file', 2, true], ['command', 2, true], ['said', 2, false]],
  );
  assert.deepEqual(typedFirst.uses.map((use) => [use.source, use.sourceRecord]), [['none', undefined], ['read', 7]]);
});
