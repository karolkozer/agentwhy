import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { ClaudeCodeSessionDiscovery } from '../../../src/adapter/claude-code/discovery/claude-code-session-discovery.ts';
import { ClaudeCodeSessionSource } from '../../../src/adapter/claude-code/events/claude-code-session-source.ts';
import { DEFAULT_POLICY } from '../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { NodeFileSystem } from '../../../src/infrastructure/node-file-system.ts';
import { buildReport } from '../../../src/report/build-report.ts';
import { actionsOf, type SessionActions } from '../../../src/report/check/session-actions.ts';
import { RETURN_SESSION_ID, RETURNED_SECRET, returnSessionFiles, type ReturnSessionOptions } from '../../helpers/return-session.ts';
import { jsonl, writeSession } from '../../helpers/synthetic-session.ts';

const files = new NodeFileSystem();
const source = new ClaudeCodeSessionSource({ discovery: new ClaudeCodeSessionDiscovery(files), files });

async function actionsFor(t: Parameters<typeof writeSession>[0], options: ReturnSessionOptions): Promise<SessionActions> {
  const root = await writeSession(t, returnSessionFiles(options));
  const model = await source.read(join(root, `${RETURN_SESSION_ID}.jsonl`));
  return actionsOf(buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot }));
}

// worth-running-every-day R12, on the motivating case's shape: a search prints a file and its value, and a Read shows only ordinary
// values of another file.
test('a value a search printed is to rotate and seen only in results; a file read for ordinary values is an open route only', async (t) => {
  const actions = await actionsFor(t, { carried: 'nothing' });

  // search-hits-are-reads H6: the search's hit line is the file's text, so what it held is read from it - names only.
  assert.deepEqual(actions.rotate, [{
    path: 'apps/web/.env.development', template: false, keyed: true,
    read: { keys: ['value beside a sensitive name'], names: ['WEBHOOK_SECRET'], keyed: [{ name: 'WEBHOOK_SECRET', key: 'value beside a sensitive name' }] },
  }]);
  assert.deepEqual(actions.onlyInResults, ['apps/web/.env.development']);
  assert.deepEqual(
    actions.openRoutes.map(({ path, did, pattern, occurrences }) => ({ path, did, pattern, occurrences })),
    [{ path: 'apps/web/.env', did: 'Read', pattern: '**/.env*', occurrences: 1 }],
  );
  assert.equal(actions.refusedAttempts, 0);
  assert.match(actions.policy, /BUILT-IN DEFAULT/);
});

// The transcript does not say which of two files one call printed a value from; rotating one too many is the safe side.
test('a call that printed two protected files and a value puts both on the rotate list, each an open route', async (t) => {
  const actions = await actionsFor(t, { carried: 'nothing', readsTogether: true });

  assert.deepEqual(actions.rotate.map((file) => file.path), ['apps/web/.env', 'apps/web/.env.development']);
  assert.deepEqual(actions.openRoutes.map((route) => [route.path, route.did]).sort(), [
    ['apps/web/.env', 'Bash (cat)'],
    ['apps/web/.env.development', 'Bash (cat)'],
  ]);
  assert.deepEqual(actions.onlyInResults, []);
});

test('no action carries a value: only paths, routes, counts and class names', async (t) => {
  for (const carried of ['value', 'path', 'fragment'] as const) {
    const actions = await actionsFor(t, { carried });
    assert.ok(!JSON.stringify(actions).includes(RETURNED_SECRET), carried);
    assert.ok(!JSON.stringify(actions).includes(RETURNED_SECRET.slice(0, 6)), carried);
  }
});

// Review finding 2: `check` must not call a call with no recorded result clear. Corrected 2026-09-29
// (`2026-09-27-what-codex-wrote.md` X11, §4.G): `report` no longer counts it as reaching the file either - it is an attempt
// whose outcome is unknown, counted apart, and the headline says so.
test('a call that named a protected file and has no recorded result is an unknown outcome, not nothing', async (t) => {
  const root = await writeSession(t, {
    'sess-unknown.jsonl': jsonl({
      type: 'assistant',
      isSidechain: false,
      cwd: '/work/the-app',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_01UNKNOWNCATAAAAAAAAAAAA', name: 'Bash', input: { command: 'cat .env' } }] },
    }),
  });
  const model = await source.read(join(root, 'sess-unknown.jsonl'));
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });

  const actions = actionsOf(report);

  assert.equal(report.tally.filesReached, 0, 'an attempt with no recorded outcome is not a file reached');
  assert.equal(report.tally.unknownAttempts, 1, 'it is counted as the attempt it is');
  assert.equal(report.headline.severity, 'attention', 'and it is never said as nothing having happened');
  assert.deepEqual(actions.unknown, ['.env']);
  assert.deepEqual(actions.openRoutes, []);
});

// R12b: a tool with no profile has its whole input searched, so a path in the text it carried is a mention, not a route.
// Found by running check on real sessions, where messages between agents were reported as routes to .env.
test('a path named in what an unknown tool carried is counted as a mention, never as a route', async (t) => {
  const root = await writeSession(t, {
    'sess-mention.jsonl': jsonl(
      {
        type: 'assistant',
        isSidechain: false,
        cwd: '/work/the-app',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_01MENTIONSENDAAAAAAAAAAA', name: 'SendMessage', input: { message: 'I changed apps/web/.env today' } }],
        },
      },
      {
        type: 'user',
        isSidechain: false,
        cwd: '/work/the-app',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_01MENTIONSENDAAAAAAAAAAA', content: 'sent' }] },
      },
    ),
  });
  const model = await source.read(join(root, 'sess-mention.jsonl'));
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });

  const actions = actionsOf(report);

  assert.ok(report.stories.some((story) => `${story.path}` === 'apps/web/.env'), 'the report still shows it');
  assert.deepEqual(actions.openRoutes, []);
  assert.deepEqual(actions.rotate, []);
  assert.equal(actions.mentions, 1);
});

// R12c: the policy protects a template deliberately, and "rotate this" is the wrong sentence for a committed file.

// R12c: the policy protects a template deliberately; "rotate this" is the wrong sentence for a file meant to be committed.
test('a value read from a file named as a template is marked, not put on the rotate list as it stands', async (t) => {
  const root = await writeSession(t, {
    'sess-template.jsonl': jsonl(
      {
        type: 'assistant',
        isSidechain: false,
        cwd: '/work/the-app',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu_01TEMPLATECATAAAAAAAAAAA', name: 'Bash', input: { command: 'cat .env.example' } }],
        },
      },
      {
        type: 'user',
        isSidechain: false,
        cwd: '/work/the-app',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu_01TEMPLATECATAAAAAAAAAAA', content: 'WEBHOOK_SECRET=EPzLE4tu9Argh963' }],
        },
      },
    ),
  });
  const model = await source.read(join(root, 'sess-template.jsonl'));
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });

  // A value beside a secret's name is a key the scanner recognised: the file is keyed, so it is never closed as "not
  // private" (F50) - only as rotated, or, being a template, as not a real secret (R31).
  // What was read goes with it, for To fix's wizard: the kind of key and its line, never the value.
  const rotate = actionsOf(report).rotate;
  assert.deepEqual(rotate, [{
    path: '.env.example',
    template: true,
    keyed: true,
    read: {
      keys: ['value beside a sensitive name'],
      names: ['WEBHOOK_SECRET'],
      keyed: [{ name: 'WEBHOOK_SECRET', key: 'value beside a sensitive name' }],
    },
  }]);
  assert.doesNotMatch(JSON.stringify(rotate), /EPzLE4tu9Argh963/);
});

// F57, 2026-09-24: a file the person chose only to be told about was let through. It is no route to close, and it
// needs no attention of its own - but a value read from it is still to rotate, since only changing the keys undoes that.
test('a told file the agent read is told, not an open route, and a value from it is still to rotate', async (t) => {
  const root = await writeSession(t, returnSessionFiles({ carried: 'nothing' }));
  const model = await source.read(join(root, `${RETURN_SESSION_ID}.jsonl`));
  const policy = { ...DEFAULT_POLICY, protected: DEFAULT_POLICY.protected.map((entry) => (entry.pattern === '**/.env*' ? { ...entry, mode: 'tell' as const } : entry)) };
  const report = buildReport(model, policy, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });
  const actions = actionsOf(report);

  assert.deepEqual(actions.openRoutes, [], 'the Read of apps/web/.env was let through, as the person chose');
  assert.deepEqual(actions.onlyInResults, []);
  assert.deepEqual(actions.told, ['apps/web/.env', 'apps/web/.env.development']);
  assert.deepEqual(actions.rotate.map((file) => file.path), ['apps/web/.env.development'], 'the value it printed is still to rotate');
  assert.ok(report.findings.every((finding) => finding.told === true));
});
