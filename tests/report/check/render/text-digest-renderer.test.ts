// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { ActionsDigest } from '../../../../src/report/check/actions-digest.ts';
import { ESCAPES } from '../../../../src/shared/colour.ts';
import { TextDigestRenderer } from '../../../../src/report/check/render/text-digest-renderer.ts';

const redactor = new Redactor('test');

const EMPTY: ActionsDigest = {
  asked: '7d',
  sessionsRead: 4,
  sessionsUnreadable: 0,
  policyKind: 'default',
  policy: redactor.term('BUILT-IN DEFAULT — no policy file was given'),
  rotate: [],
  openRoutes: [],
  onlyInResults: [],
  unknown: [],
  refusedAttempts: 0,
  secretShapes: [],
  mentions: 0,
};

const BUSY: ActionsDigest = {
  ...EMPTY,
  rotate: [{ path: redactor.path('apps/web/.env.development'), sessions: 2 }],
  openRoutes: [{ path: redactor.path('apps/web/.env'), did: redactor.term('Bash (cat)'), pattern: redactor.term('**/.env*'), sessions: 1, occurrences: 3 }],
  onlyInResults: [{ path: redactor.path('apps/web/.env.development'), sessions: 1 }],
  refusedAttempts: 2,
  secretShapes: [{ name: redactor.term('github-token'), count: 1 }],
};

const brief = new TextDigestRenderer('brief');
const full = new TextDigestRenderer('full');
const counts = new TextDigestRenderer('counts');

// R15: an empty answer says what was read, so it cannot be mistaken for a check that did not run.
test('nothing to act on is one line naming the range, the sessions and the policy', () => {
  assert.equal(
    full.render(EMPTY),
    'Nothing to act on: 4 sessions active since 7d, read under BUILT-IN DEFAULT — no policy file was given, and no protected file was reached.\n',
  );
  assert.equal(counts.render(EMPTY), 'Nothing to act on in the 4 sessions read.\n');
});

test('an empty range says so and how to look further back', () => {
  assert.match(full.render({ ...EMPTY, sessionsRead: 0 }), /^No session of this project was active since 7d/);
});

test('the full view lists every action with its paths, and the counts view points at it', () => {
  const text = full.render(BUSY);

  assert.match(text, /^Rotate$/m);
  assert.match(text, /^ {2}apps\/web\/\.env\.development {2}in 2 sessions$/m);
  assert.match(text, /^ {2}apps\/web\/\.env {2}Bash \(cat\) {2}3 times, in 1 session$/m);
  assert.match(text, /^Seen only in results$/m);
  assert.match(text, /^ {2}github-token {2}once$/m);
  assert.match(text, /^Your rules held: 2 attempts were refused\./m);
  assert.match(text, /^Each session in detail: agentwhy start --since 7d$/m);

  assert.equal(
    counts.render(BUSY),
    'To act on: 1 file to rotate · 1 open route to a protected path · 1 path seen only in results · 1 key shape\n' +
      'Your rules held: 2 attempts were refused.\n' +
      'What to do: agentwhy check --since 7d\n',
  );
});

// R13: the advice follows where the rules came from.
test('an open route is advised by the origin of the policy', () => {
  assert.match(full.render(BUSY), /^ {2}"Read\(\*\*\/\.env\*\)"$/m);
  assert.match(full.render({ ...BUSY, policyKind: 'settings' }), /agentwhy init --refuse refuses a shell command/);
  assert.doesNotMatch(full.render({ ...BUSY, policyKind: 'settings' }), /"Read\(/);
  assert.match(full.render({ ...BUSY, policyKind: 'file' }), /Your policy file protects these paths/);
});

test('sessions that could not be read are counted, not dropped', () => {
  assert.match(full.render({ ...EMPTY, sessionsUnreadable: 1 }), /^1 session inside the range could not be read/m);
});

// Review finding 1: a range whose every session failed is not a clean range, in either view.
test('when no session in range could be read, neither view says there is nothing to act on', () => {
  const unread = { ...EMPTY, sessionsRead: 0, sessionsUnreadable: 2 };

  for (const text of [full.render(unread), counts.render(unread)]) {
    assert.doesNotMatch(text, /Nothing to act on/);
    assert.match(text, /^2 sessions (inside|in) (the|this) range could not be read/m);
  }
  assert.match(counts.render({ ...EMPTY, sessionsUnreadable: 1 }), /^1 session in this range could not be read/m);
  assert.equal(counts.render({ ...EMPTY, sessionsRead: 0 }), 'No session was active in this range.\n');
});

// Review finding 2.
test('an unknown outcome is its own section, and a count in the digest start prints', () => {
  const unknown = { ...EMPTY, unknown: [{ path: redactor.path('.env'), sessions: 1 }] };

  assert.doesNotMatch(full.render(unknown), /Nothing to act on/);
  assert.match(full.render(unknown), /^Outcome unknown$/m);
  assert.match(full.render(unknown), /^ {2}\.env {2}in 1 session$/m);
  assert.match(counts.render(unknown), /^To act on: 1 path with an unknown outcome$/m);
});

// R15a: the default view is one screen - one line per file, strongest first, and no explanation before the data.
test('the brief view gives one line per file, strongest first, and points at the rest', () => {
  const text = brief.render({
    ...BUSY,
    // The same file in three sections: it must be read as one thing to do, not three.
    onlyInResults: [{ path: redactor.path('apps/web/.env.development'), sessions: 1 }],
    unknown: [{ path: redactor.path('apps/web/.env.test'), sessions: 1 }],
    mentions: 4,
  });
  const lines = text.split('\n');

  assert.match(lines[0] ?? '', /^agentwhy · 4 sessions active since 7d, read under BUILT-IN DEFAULT/);
  assert.deepEqual(
    lines.filter((line) => /^ {2}(ROTATE|CHECK|UNKNOWN|REACHED|IN RESULT)/.test(line)).map((line) => line.trim().split(/ {2,}/)),
    [
      ['ROTATE', 'apps/web/.env.development', "a value was in an agent's context, in 2 sessions"],
      ['UNKNOWN', 'apps/web/.env.test', 'a call named it, its outcome is not recorded, in 1 session'],
      ['REACHED', 'apps/web/.env', 'Bash (cat), nothing refused it, in 1 session'],
    ],
  );
  assert.match(text, /^ {2}4 paths were named in text a call carried, which opens no file; not counted$/m);
  assert.match(text, /^What each line means, and what to do: {2}agentwhy check --full$/m);
  // Nothing of the full view's prose is in it.
  assert.doesNotMatch(text, /Rotating the value is the only step/);
});

test('a template file asks to be checked, never to be rotated', () => {
  const text = brief.render({ ...EMPTY, rotate: [{ path: redactor.path('.env.example'), sessions: 1, template: true }] });

  assert.match(text, /^ {2}CHECK {2}\.env\.example {2}a value was read from this template, in 1 session$/m);
  assert.doesNotMatch(text, /ROTATE/);
  assert.match(full.render({ ...EMPTY, rotate: [{ path: redactor.path('.env.example'), sessions: 1, template: true }] }), /template · in 1 session/);
});

test('the brief view names at most five files and says how many more there are', () => {
  const many = Array.from({ length: 8 }, (_, at) => ({ path: redactor.path(`app/${at}/.env`), sessions: 1 }));
  const text = brief.render({ ...EMPTY, onlyInResults: many });

  assert.equal(text.split('\n').filter((line) => line.startsWith('  IN RESULT')).length, 5);
  assert.match(text, /^ {2}and 3 more$/m);
});

// A long path may not push every other row across the screen; the end of it is what names the file.
test('a path too long for the column is cut at the front', () => {
  const long = redactor.path(`apps/${'very-long-directory/'.repeat(4)}web/.env`);
  const text = brief.render({ ...EMPTY, onlyInResults: [{ path: long, sessions: 1 }] });

  assert.match(text, /^ {2}IN RESULT {2}…[^ ]{40,46} {2}printed by a search/m);
});

test('nothing to act on stays one line in the brief view, and refusals are still said', () => {
  assert.equal(
    brief.render({ ...EMPTY, refusedAttempts: 2 }),
    'Nothing to act on: 4 sessions active since 7d, read under BUILT-IN DEFAULT — no policy file was given, and no protected file was reached.\n' +
      'Your rules held: 2 attempts were refused.\n',
  );
});

// `.ai/specs/2026-10-01-who-stopped-it.md` WS4: a rule is credited only with what a rule refused; what auto mode or the
// person stopped is said as theirs, each on a line of its own, and a count of nothing says nothing.
test('what auto mode or the person stopped is not said as the rules having held', () => {
  const head = 'Nothing to act on: 4 sessions active since 7d, read under BUILT-IN DEFAULT — no policy file was given, and no protected file was reached.\n';

  assert.equal(
    brief.render({ ...EMPTY, refusedAttempts: 6, refusedByOthers: { reviewer: 3, person: 1 } }),
    `${head}Your rules held: 2 attempts were refused.\nAuto mode stopped 3 attempts.\nYou turned down 1 attempt.\n`,
  );
  assert.equal(
    brief.render({ ...EMPTY, refusedAttempts: 1, refusedByOthers: { reviewer: 1, person: 0 } }),
    `${head}Auto mode stopped 1 attempt.\n`,
    'no rule refused anything, so none is said to have held',
  );
  assert.equal(
    brief.render({ ...EMPTY, refusedAttempts: 2, refusedByOthers: { reviewer: 0, person: 2 } }),
    `${head}You turned down 2 attempts.\n`,
  );
});

test('under the rows of the brief view each is a footnote, and the full view keeps the note on hooks with the rules', () => {
  const mixed = { ...BUSY, refusedAttempts: 4, refusedByOthers: { reviewer: 1, person: 1 } };

  const rows = brief.render(mixed);
  assert.match(rows, /^ {2}your rules held: 2 attempts were refused$/m);
  assert.match(rows, /^ {2}auto mode stopped 1 attempt$/m);
  assert.match(rows, /^ {2}you turned down 1 attempt$/m);

  const text = full.render(mixed);
  assert.match(text, /^Your rules held: 2 attempts were refused\. A refused Read raises no hook event, so only the\ntranscripts show these\.\nAuto mode stopped 1 attempt\.\nYou turned down 1 attempt\.$/m);

  const others = full.render({ ...BUSY, refusedAttempts: 1, refusedByOthers: { reviewer: 1, person: 0 } });
  assert.match(others, /^Auto mode stopped 1 attempt\.$/m);
  assert.doesNotMatch(others, /Your rules held|refused Read raises no hook event/, 'the note is about a rule\'s refusal, and none was made');

  assert.match(counts.render(mixed), /^Your rules held: 2 attempts were refused\.\nAuto mode stopped 1 attempt\.\nYou turned down 1 attempt\.$/m);
});

// worth-running-every-day R35: a marked file that came back says when it was marked; one that did not is counted.
test('marks are said once: a reopened file says when it was marked, and done files are counted with where History is', () => {
  const marked = Date.parse('2026-09-15T08:00:00Z');
  const text = brief.render({ ...BUSY, marks: { done: 2, reopened: [{ path: 'apps/web/.env.development', result: 'rotated', at: marked }], unreadable: false } });

  assert.match(text, /^ {2}ROTATE {2,}apps\/web\/\.env\.development {2,}a value was in an agent's context; marked rotated 2026-09-15, reached again since, in 2 sessions$/m);
  assert.match(text, /^ {2}2 files were marked done and not reached since; History: agentwhy start --since 7d$/m);
  assert.match(text, /^Dealt with one: {24}agentwhy check --mark rotated <path>$/m);
  assert.match(counts.render({ ...BUSY, marks: { done: 1, reopened: [], unreadable: false } }), /^1 file marked done\.$/m);
});

test('a range whose every file is marked says nothing is left, not that nothing was reached', () => {
  const text = brief.render({ ...EMPTY, marks: { done: 1, reopened: [], unreadable: true } });

  assert.match(text, /^Nothing left to act on: 4 sessions active since 7d/);
  assert.match(text, /^1 file was marked done and not reached since/m);
  assert.match(text, /^the record of marks could not be read, so nothing marked was left out$/m);
});

// findings-worth-reading R14: colour is laid over words that already say it, and taking it off changes nothing.
test('every view is the same text with its escapes removed, coloured or not', () => {
  for (const view of ['brief', 'full', 'counts'] as const) {
    const plain = new TextDigestRenderer(view);
    const coloured = new TextDigestRenderer(view, { colour: true });

    for (const digest of [EMPTY, BUSY]) {
      assert.notEqual(coloured.render(digest), plain.render(digest), `${view} is coloured`);
      assert.equal(coloured.render(digest).replace(ESCAPES, ''), plain.render(digest), `${view} says the same`);
    }
  }
});

test('colour is off unless the shell asked for it', () => {
  assert.equal(new TextDigestRenderer('counts').render(BUSY).replace(ESCAPES, ''), new TextDigestRenderer('counts').render(BUSY));
});
