import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../src/core/redaction/redactor.ts';
import { digestOf, needsAction } from '../../../src/report/check/actions-digest.ts';
import type { SessionActions } from '../../../src/report/check/session-actions.ts';

const redactor = new Redactor('test');
const path = (text: string) => redactor.path(text);
const term = (text: string) => redactor.term(text);

function session(overrides: Partial<SessionActions> = {}): SessionActions {
  return {
    policy: term('deny rules of .claude/settings.json'),
    rotate: [],
    openRoutes: [],
    onlyInResults: [],
    unknown: [],
    refusedAttempts: 0,
    secretShapes: [],
    mentions: 0,
    ...overrides,
  };
}

const CONTEXT = { asked: '7d', sessionsUnreadable: 0, policyKind: 'settings' } as const;

// worth-running-every-day R12, R15: many sessions become one answer, with how many sessions each line stands for.
test('paths and routes are merged across sessions, most sessions first, and refusals add up', () => {
  const digest = digestOf(
    [
      session({
        rotate: [{ path: path('apps/web/.env'), template: false }],
        openRoutes: [{ path: path('apps/web/.env'), did: term('Bash (cat)'), occurrences: 2 }],
        refusedAttempts: 1,
        secretShapes: [term('github-token')],
      }),
      session({
        rotate: [{ path: path('apps/api/.env'), template: false }, { path: path('apps/web/.env'), template: false }],
        openRoutes: [
          { path: path('apps/web/.env'), did: term('Bash (cat)'), occurrences: 1 },
          { path: path('apps/web/.env'), did: term('Read'), occurrences: 1 },
        ],
        refusedAttempts: 3,
        secretShapes: [term('github-token')],
      }),
    ],
    CONTEXT,
  );

  assert.deepEqual(digest.rotate, [
    { path: 'apps/web/.env', sessions: 2 },
    { path: 'apps/api/.env', sessions: 1 },
  ]);
  assert.equal(digest.mentions, 0);
  assert.deepEqual(
    digest.openRoutes.map(({ path, did, sessions, occurrences }) => [path, did, sessions, occurrences]),
    [
      ['apps/web/.env', 'Bash (cat)', 2, 3],
      ['apps/web/.env', 'Read', 1, 1],
    ],
  );
  assert.equal(digest.refusedAttempts, 4);
  assert.deepEqual(digest.secretShapes, [{ name: 'github-token', count: 2 }]);
  assert.equal(digest.sessionsRead, 2);
  assert.equal(digest.policy, 'deny rules of .claude/settings.json');
  assert.equal(needsAction(digest), true);
});

// Refusals are the rules holding: good news is reported, and is not a thing to act on.
test('refusals alone do not need action, and an empty range names no policy', () => {
  assert.equal(needsAction(digestOf([session({ refusedAttempts: 5 })], CONTEXT)), false);
  assert.equal('policy' in digestOf([], CONTEXT), false);
});

// Review finding 2: an outcome nobody knows is a question, never a clean answer.
test('a path with an unknown outcome is merged across sessions and needs action', () => {
  const digest = digestOf([session({ unknown: [path('.env')] }), session({ unknown: [path('.env')] })], CONTEXT);

  assert.deepEqual(digest.unknown, [{ path: '.env', sessions: 2 }]);
  assert.equal(needsAction(digest), true);
});
