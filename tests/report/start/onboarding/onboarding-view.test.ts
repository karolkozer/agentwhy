import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../../src/core/redaction/redacted.ts';
import type { CheckRow, IndexCheck } from '../../../../src/report/check/check-lines.ts';
import type { Tally } from '../../../../src/report/report-model.ts';
import type { IndexEntry, IndexHooks, IndexNotices, IndexProject, IndexProjects, IndexSettings, SessionIndex } from '../../../../src/report/start/session-index.ts';
import { onboardingView } from '../../../../src/report/start/onboarding/onboarding-view.ts';

// `.ai/plans/2026-09-24-onboarding.md`, step 2: what the onboarding shows, from the index alone.

const NOW = Date.parse('2026-09-24T10:00:00Z');
const ZERO: Tally = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];

// A project nobody has set up: no hook, the built-in list read, the product's notice defaults.
const HOOKS: IndexHooks = {
  watch: false,
  refuse: false,
  reads: { watch: 'default', refuse: 'default' },
  path: '.claude/settings.local.json',
  sharedPath: '.claude/settings.json',
};
const NOTICES: IndexNotices = {
  on: 'value',
  clean: 'once',
  say: 'agent',
  notify: ['chat'],
  from: { on: 'default', clean: 'default', say: 'default', notify: 'default' },
  path: '/Users/someone/.agentwhy/notices.json',
  unusable: false,
};

function settings(extra: Partial<IndexSettings> = {}): IndexSettings {
  return { level: 'no-read', protected: BUILT_IN, allowed: [], origin: { kind: 'default' }, hooks: HOOKS, mine: {}, held: { local: [], shared: [] }, notices: NOTICES, ...extra };
}

function entry(name: string, report: IndexEntry['report'] = { kind: 'generated', file: name + '.html', tally: ZERO, incomplete: false, files: [] }): IndexEntry {
  return { provider: 'claude-code', name, title: ('Asked in ' + name) as Redacted, modifiedAt: NOW - 3_600_000, delegations: 0, report };
}

function row(label: CheckRow['label'], path: string): CheckRow {
  return { label, path: path as Redacted, sessions: ['a'] };
}

function index(extra: Partial<SessionIndex> = {}): SessionIndex {
  return {
    now: NOW, timeZone: 'UTC', since: NOW - 7 * 86_400_000, asked: '7d', shared: false, widen: 'agentwhy start --since 14d',
    entries: [entry('a')],
    settings: settings(),
    onboarding: { intro: true },
    ...extra,
  };
}

function check(rows: readonly CheckRow[]): IndexCheck {
  return { rows, refusedAttempts: 0 };
}

test('a project nobody set up: the intro, Just me, the four groups watched, row 1 on and rows 2-3 as the product has them', () => {
  const view = onboardingView(index());
  assert.ok(view !== undefined);
  assert.equal(view.intro, true);
  assert.equal(view.who, 'local');
  assert.deepEqual(view.files.rows.map((each) => each.name), ['env', 'npmrc', 'secrets', 'ssh']);
  assert.ok(view.files.rows.every((each) => each.watched && each.source === 'agentwhy'));
  assert.equal(view.files.canAdd, true);
  assert.deepEqual(view.messages.alerts, { on: true, writable: true }, 'R4a: what init ticks by default');
  assert.deepEqual(view.messages.stopped, { on: false, writable: true }, 'N4: level value');
  assert.deepEqual(view.messages.fine, { on: true, writable: true }, 'N4: clean once');
  assert.deepEqual(view.inForce, {
    watch: false, refuse: false, stopped: false, fine: true, protected: BUILT_IN,
    rows: ([['env', ['**/.env*', '**/*.env']], ['npmrc', ['**/.npmrc']], ['secrets', ['**/secrets/**']], ['ssh', ['**/.ssh/**', '**/id_rsa*']]] as const)
      .map(([key, patterns]) => ({ key, mode: 'block', watched: true, ruled: false, switchable: false, patterns })),
    canWrite: true, canAdd: true, canTell: false, noticesWritable: true,
  }, 'F57: every row starts on Block; with no told lists read, none can be switched; no file denies them yet (KD2)');
});

test('W24: without the flag the page starts at the welcome', () => {
  const { onboarding: _onboarding, ...rest } = index();
  assert.equal(onboardingView(rest)?.intro, false);
  assert.equal(onboardingView(index({ onboarding: { intro: false } }))?.intro, false);
});

test('W11: step 1 starts where the hook runs', () => {
  const view = onboardingView(index({ settings: settings({ hooks: { ...HOOKS, watch: 'shared' } }) }));
  assert.equal(view?.who, 'shared');
  assert.equal(view?.inForce.watch, 'shared');
});

test('what the files hold is what the page shows: rows 2 and 3 from the preferences', () => {
  const view = onboardingView(index({ settings: settings({ hooks: { ...HOOKS, watch: 'local' }, notices: { ...NOTICES, on: 'refused', clean: 'off' } }) }));
  assert.deepEqual(view?.messages.stopped, { on: true, writable: true });
  assert.deepEqual(view?.messages.fine, { on: false, writable: true });
});

test('R62: nothing is offered that cannot be written', () => {
  const { hooks: _hooks, mine: _mine, held: _held, ...unreadable } = settings();
  const view = onboardingView(index({ settings: unreadable }));
  assert.deepEqual(view?.messages.alerts, { on: false, writable: false }, 'a file that could not be read is not a hook turned on');
  assert.equal(view?.files.canAdd, false);

  const policy = onboardingView(index({ settings: settings({ hooks: { ...HOOKS, reads: { watch: 'policy', refuse: 'policy' } } }) }));
  assert.equal(policy?.files.canAdd, false, 'hooks reading a policy take no name');

  const { notices: _notices, ...noPreferences } = settings();
  const quiet = onboardingView(index({ settings: noPreferences }));
  assert.deepEqual(quiet?.messages.stopped, { on: false, writable: false });
  assert.deepEqual(quiet?.messages.fine, { on: true, writable: false });
});

test('W18: Done names three files, the keys first, and counts the rest', () => {
  const view = onboardingView(index({
    check: check([row('template', '.env.example'), row('rotate', '.env'), row('rotate', 'app/.env.production'), row('unknown', 'secrets/app.yml'), row('route', '.env.local')]),
  }));
  assert.equal(view?.done.total, 4, 'the To fix count: the name only seen is not one');
  assert.deepEqual(view?.done.files.map((file) => file.path), ['.env', 'app/.env.production', '.env.example']);
  assert.equal(view?.done.more, 1);
  assert.equal(view?.done.state, 'keys');
});

test('T2: only a look left, or nothing', () => {
  assert.equal(onboardingView(index({ check: check([row('template', '.env.example')]) }))?.done.state, 'look');
  const none = onboardingView(index());
  assert.equal(none?.done.state, 'none');
  assert.equal(none?.done.total, 0);
  assert.deepEqual(none?.done.files, []);
});

test('W19, W34: a conversation not read in full is said; W1a: no conversations at all', () => {
  assert.equal(onboardingView(index())?.done.gaps, false);
  assert.equal(onboardingView(index({ entries: [entry('a'), entry('b', { kind: 'failed' })] }))?.done.gaps, true);
  assert.equal(onboardingView(index({ entries: [entry('a', { kind: 'generated', file: 'a.html', tally: ZERO, incomplete: true })] }))?.done.gaps, true);
  assert.equal(onboardingView(index({ entries: [entry('a'), entry('b', { kind: 'outside-range' })] }))?.done.checked, 1);

  const empty = onboardingView(index({ entries: [] }));
  assert.equal(empty?.done.conversations, 0);
  assert.equal(empty?.done.asked, '7d');
});

test('W1: no onboarding on a shared page, or without settings', () => {
  assert.equal(onboardingView(index({ shared: true })), undefined);
  const { settings: _settings, ...rest } = index();
  assert.equal(onboardingView(rest), undefined);
});

// `.ai/specs/2026-09-27-which-project.md` V7, V20: where the project step starts, from what the run read.
test('V20: the step starts at the home directory, else this folder’s chats, else the project above it, else a folder with none', () => {
  const blog: IndexProject = { id: '-Users-someone-blog', place: '~/blog', name: 'blog', exists: true, conversations: 5, newest: { modifiedAt: NOW }, current: false };
  const projects = (rows: readonly IndexProject[]): IndexProjects => ({ rows, unreadable: 0, switchable: true, choosable: false, above: { id: blog.id, within: 'src' } });
  const at = (extra: Partial<SessionIndex>) => onboardingView(index({ project: '/Users/someone/blog/src', place: '~/blog/src', ...extra }))?.project;

  assert.deepEqual(at({ notAProject: 'home', entries: [entry('a')] }), { kind: 'none', not: 'home', conversations: 1 });
  assert.deepEqual(at({ entries: [entry('a')], entryPoints: { editor: 1 }, projects: projects([blog]) }),
    { kind: 'found', name: 'src', place: '~/blog/src', conversations: 1, entryPoints: { editor: 1 }, read: 0 }, 'chats of its own come first');
  assert.deepEqual(at({ entries: [], projects: projects([blog]) }), { kind: 'inside', name: 'src', place: '~/blog/src', above: blog, within: 'src' });
  assert.deepEqual(at({ entries: [], projects: projects([{ ...blog, exists: false }]) }), { kind: 'empty', name: 'src', place: '~/blog/src' }, 'a folder that is gone is offered as nothing');
  assert.deepEqual(at({ entries: [] }), { kind: 'empty', name: 'src', place: '~/blog/src' });
  assert.equal(onboardingView(index({ onboarding: { intro: false, atProject: true } }))?.atProject, true);
});
