// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FileAccessError } from '../../../../src/ports/file-access-error.ts';
import type { FileReader } from '../../../../src/ports/file-reader.ts';
import type { OnboardingReading, OnboardingStore } from '../../../../src/ports/onboarding-store.ts';
import type { StartNoteStore } from '../../../../src/ports/start-note-store.ts';
import { SESSION_START_NOTE, SessionStartNote, type SessionStartNoteDependencies } from '../../../../src/report/start/onboarding/session-start-note.ts';

const HOME = '/Users/someone';
const PROJECT = '/Users/someone/Projects/sunny-bakery';
const PROJECT_NAME = '-Users-someone-Projects-sunny-bakery';
const NOW = Date.UTC(2026, 9, 19, 12);
const DAY = 24 * 60 * 60 * 1000;

const NOT_DONE: OnboardingReading = { here: false, anywhere: false, failed: false };
const WATCH = { hooks: { SubagentStop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }], Stop: [{ hooks: [{ type: 'command', command: 'agentwhy watch' }] }] } };

const started = (fields: Record<string, unknown> = {}): string =>
  JSON.stringify({ session_id: 's', hook_event_name: 'SessionStart', source: 'startup', cwd: PROJECT, ...fields });

function filesOf(texts: Readonly<Record<string, string>>): FileReader {
  return {
    readText: async (path) => {
      const text = texts[path];
      if (text === undefined) throw new FileAccessError('not-found', path);
      return text;
    },
    readLines: () => { throw new Error('read whole'); },
  };
}

function onboarding(reading: OnboardingReading, asked: string[] = []): (project: string) => OnboardingStore {
  return (project) => {
    asked.push(project);
    return { read: async () => reading, add: async () => true, reset: async () => true, doneFor: async () => new Set() };
  };
}

/** The record of when a project was told, in memory: `lines` is what was written. */
class MemoryStartNotes implements StartNoteStore {
  readonly lines: { project: string; at: number }[] = [];
  readonly #unreadable: boolean;
  readonly #writable: boolean;

  constructor(lines: readonly { project: string; at: number }[] = [], options: { unreadable?: boolean; writable?: boolean } = {}) {
    this.lines.push(...lines);
    this.#unreadable = options.unreadable ?? false;
    this.#writable = options.writable ?? true;
  }

  async lastToldAt(project: string): Promise<number | undefined | 'failed'> {
    if (this.#unreadable) return 'failed';
    const times = this.lines.filter((line) => line.project === project).map((line) => line.at);
    return times.length === 0 ? undefined : Math.max(...times);
  }

  async add(project: string, at: number): Promise<boolean> {
    if (!this.#writable) return false;
    this.lines.push({ project, at });
    return true;
  }
}

function note(input: string | undefined, overrides: Partial<SessionStartNoteDependencies> = {}): SessionStartNote {
  return new SessionStartNote({
    input: { readAll: async () => input },
    files: filesOf({}),
    home: HOME,
    temporaryDirectory: '/var/folders/xy/T',
    onboardingOf: onboarding(NOT_DONE),
    computerOnboarding: onboarding(NOT_DONE)('this-computer'),
    told: new MemoryStartNotes(),
    now: () => NOW,
    ...overrides,
  });
}

// AP6: a new session in a project nobody set up is told, once, in facts that ask nothing of the agent.
test('a new session in a project with no setup is told, and the moment is recorded under the project\'s name', async () => {
  const told = new MemoryStartNotes();
  const asked: string[] = [];

  const said = await note(started(), { told, onboardingOf: onboarding(NOT_DONE, asked) }).run();

  assert.equal(said, SESSION_START_NOTE);
  assert.deepEqual(told.lines, [{ project: PROJECT_NAME, at: NOW }]);
  assert.deepEqual(asked, [PROJECT_NAME], 'the project\'s own onboarding record is asked, by the name it keeps it under');
  assert.match(said, /blocks no file here yet/);
  assert.doesNotMatch(said, /\b(say|tell the person|mention|you must|please)\b/i, 'the paragraph states facts and asks nothing (AP6, §8.1)');
});

test('a session resumed, cleared, compacted or forked, or one whose source is not given, is not told', async () => {
  for (const source of ['resume', 'clear', 'compact', 'fork', undefined]) {
    const told = new MemoryStartNotes();
    assert.equal(await note(started({ source }), { told }).run(), '', String(source));
    assert.deepEqual(told.lines, [], String(source));
  }
});

test('a folder that is no project is not told: the home folder, a root, an app\'s chat folder, the temporary space', async () => {
  for (const cwd of [HOME, '/', `${HOME}/Documents/Codex/2026-10-19/a-chat`, '/private/tmp/scratch', '/var/folders/xy/T/try']) {
    assert.equal(await note(started({ cwd })).run(), '', cwd);
  }
  assert.equal(await note(started({ cwd: undefined })).run(), '', 'no folder given');
});

test('a project whose onboarding, or the computer\'s, was finished - or whose record could not be read - is not told', async () => {
  const done: OnboardingReading = { here: true, anywhere: true, failed: false };
  const failed: OnboardingReading = { here: false, anywhere: false, failed: true };
  for (const [name, overrides] of [
    ['project done', { onboardingOf: onboarding(done) }],
    ['project record unread', { onboardingOf: onboarding(failed) }],
    ['computer done', { computerOnboarding: onboarding(done)('this-computer') }],
    ['computer record unread', { computerOnboarding: onboarding(failed)('this-computer') }],
  ] as const) {
    assert.equal(await note(started(), overrides).run(), '', name);
  }
});

test('a project whose own settings run agentwhy, or whose settings could not be read, is not told', async () => {
  const local = `${PROJECT}/.claude/settings.local.json`;
  const shared = `${PROJECT}/.claude/settings.json`;
  for (const [name, texts] of [
    ['watch in the local file', { [local]: JSON.stringify(WATCH) }],
    ['watch in the shared file', { [shared]: JSON.stringify(WATCH) }],
    ['an unreadable file', { [local]: '{ not json' }],
  ] as const) {
    assert.equal(await note(started(), { files: filesOf(texts) }).run(), '', name);
  }
  // A rule written by hand, with no hook of agentwhy's, is no setup: nothing runs it here (refuseProjectAbove, §8.1).
  assert.equal(await note(started(), { files: filesOf({ [local]: JSON.stringify({ permissions: { deny: ['Read(./.env)'] } }) }) }).run(), SESSION_START_NOTE);
});

// Review of 2026-10-24: a deny rule in the person's own settings is blocked by the plugin's refuse in every project
// (RW11), with or without a record - so "it blocks no file here yet" is not said there.
test('a computer whose own settings deny a file, or cannot be read, is not told that nothing is blocked', async () => {
  const computer = `${HOME}/.claude/settings.json`;
  assert.equal(await note(started(), { files: filesOf({ [computer]: JSON.stringify({ permissions: { deny: ['Read(**/.env)'] } }) }) }).run(), '');
  const unreadable: FileReader = {
    readText: async (path) => { throw new FileAccessError(path === computer ? 'unreadable' : 'not-found', path); },
    readLines: () => { throw new Error('read whole'); },
  };
  assert.equal(await note(started(), { files: unreadable }).run(), '');
  assert.equal(await note(started(), { files: filesOf({ [computer]: JSON.stringify({ model: 'a-model' }) }) }).run(), SESSION_START_NOTE, 'settings with no deny rule');
});

// APD8: once a week a project.
test('a project told in the last week is not told again; one told a week ago or more is', async () => {
  assert.equal(await note(started(), { told: new MemoryStartNotes([{ project: PROJECT_NAME, at: NOW - 6 * DAY }]) }).run(), '');
  assert.equal(await note(started(), { told: new MemoryStartNotes([{ project: PROJECT_NAME, at: NOW - 7 * DAY }]) }).run(), SESSION_START_NOTE);
  assert.equal(await note(started(), { told: new MemoryStartNotes([{ project: '-Users-someone-other', at: NOW }]) }).run(), SESSION_START_NOTE, 'another project\'s line is not this one\'s');
});

test('a record that cannot be read, or written, says nothing: it would otherwise be said in every session', async () => {
  assert.equal(await note(started(), { told: new MemoryStartNotes([], { unreadable: true }) }).run(), '');
  assert.equal(await note(started(), { told: new MemoryStartNotes([], { writable: false }) }).run(), '');
});

test('an input that is not this event\'s, not JSON, absent, or a dependency that throws, says nothing and does not throw', async () => {
  assert.equal(await note('not json').run(), '');
  assert.equal(await note(JSON.stringify({ hook_event_name: 'Stop', source: 'startup', cwd: PROJECT })).run(), '');
  assert.equal(await note(undefined).run(), '');
  const throwing: OnboardingStore = { read: async () => { throw new Error('disk'); }, add: async () => true, reset: async () => true, doneFor: async () => new Set() };
  assert.equal(await note(started(), { onboardingOf: () => throwing }).run(), '');
});
