// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { DetachedAnswer } from '../../../src/ports/detached-run.ts';
import type { PageServerRecord } from '../../../src/ports/page-server.ts';
import type { ListAnswer } from '../../../src/report/answers/answer-model.ts';
import { ServerAnswers } from '../../../src/report/answers/server-answers.ts';

// `specs/2026-11-24-talking-about-agentwhy.md` CV17: an answer about a project or this computer, from the server that holds it.

const ANSWER: ListAnswer = {
  about: 'list', scope: 'project', asked: '7d', checked: { read: 1, of: 1 }, groups: { attention: 0, fixed: 0, tracked: 0, stopped: 0, seen: 0, none: 1, partly: 0, failed: 0 },
  rows: [], recent: 0, rowsMore: 0, often: [], oftenMore: 0, namedOnly: 0,
};
const RECORD: PageServerRecord = { url: 'http://127.0.0.1:43123/token/', pid: 7, startedAt: 0, version: '1.0.0' };

function answers(options: { record?: PageServerRecord; afterStart?: PageServerRecord; answered?: Record<string, unknown>; answers?: readonly unknown[]; slow?: number; started?: DetachedAnswer | undefined; home?: string }) {
  const asked: string[] = [];
  const slept: number[] = [];
  let time = 0;
  const runs: { args: readonly string[]; folder: string }[] = [];
  let record = options.record;
  const made = new ServerAnswers({
    servers: { read: async () => record },
    keyOf: (folder) => folder,
    version: async () => '1.0.0',
    source: { ask: async (url) => { asked.push(url); time += options.slow ?? 0; return options.answers === undefined ? options.answered?.[url] : options.answers[Math.min(asked.length, options.answers.length) - 1]; } },
    sleep: async (ms) => { slept.push(ms); time += ms; },
    elapsed: () => time,
    run: { run: async (args, folder) => { runs.push({ args, folder }); record = options.afterStart ?? record; return 'started' in options ? options.started : { ended: true, exitCode: 0, output: '' }; } },
    project: '/Users/someone/work/shop',
    home: '/Users/someone',
  });
  return { made, asked, runs, slept };
}
const PROJECT_URL = RECORD.url + 'api/answer/project';

test('a running server of this version is asked, and none is started', async () => {
  const { made, asked, runs } = answers({ record: RECORD, answered: { [PROJECT_URL]: ANSWER } });
  assert.deepEqual(await made.ask('project'), ANSWER);
  assert.deepEqual([asked, runs], [[PROJECT_URL], []]);
});

test('with none, one is started as start --detach starts it, opening nothing, and then asked', async () => {
  const { made, runs } = answers({ afterStart: RECORD, answered: { [PROJECT_URL]: ANSWER } });
  assert.deepEqual(await made.ask('project'), ANSWER);
  assert.deepEqual(runs, [{ args: ['start', '--detach', '--no-open', '--quiet'], folder: '/Users/someone/work/shop' }]);
});

test('one that is still coming up is said as that, one that cannot is said as that', async () => {
  assert.equal(await answers({ started: { ended: false } }).made.ask('project'), 'starting');
  assert.equal(await answers({ started: undefined }).made.ask('project'), 'no-server');
  assert.equal(await answers({}).made.ask('project'), 'no-server');
});

test('a server of another version is not asked', async () => {
  const { made, asked, runs } = answers({ record: { ...RECORD, version: '0.9.0' }, afterStart: RECORD, answered: { [PROJECT_URL]: ANSWER } });
  assert.deepEqual(await made.ask('project'), ANSWER);
  assert.equal(asked.length, 1);
  assert.equal(runs.length, 1);
});

test('this computer is asked of the server of the home folder', async () => {
  const { made, runs } = answers({ afterStart: RECORD, answered: { [RECORD.url + 'api/answer/computer']: { ...ANSWER, scope: 'computer' } } });
  assert.equal((await made.ask('computer') as ListAnswer).scope, 'computer');
  assert.equal(runs[0]?.folder, '/Users/someone');
});

test('what came back that is no answer is no answer', async () => {
  assert.equal(await answers({ record: RECORD, answered: { [PROJECT_URL]: { about: 'conversation' } } }).made.ask('project'), 'no-server');
});

// PF7 as amended: `start --detach` hands over a newer agentwhy's server and starts none, so an answer is asked of it - and taken only
// where its whole shape is one this agentwhy knows (the review of 2026-11-24).
test('a newer agentwhy\'s server is asked; an answer of another shape is said as a newer agentwhy\'s', async () => {
  const newer = { ...RECORD, version: '1.1.0' };
  const same = answers({ record: newer, answered: { [PROJECT_URL]: ANSWER } });
  assert.deepEqual(await same.made.ask('project'), ANSWER);
  assert.deepEqual(same.runs, []);
  assert.equal(await answers({ record: newer, answered: { [PROJECT_URL]: { ...ANSWER, groups: { attention: 1 } } } }).made.ask('project'), 'newer');
  assert.equal(await answers({ afterStart: newer, answered: {} }).made.ask('project'), 'newer');
});

test('an answer is taken whole or not at all', async () => {
  for (const wrong of [{ rows: [{ look: 'read' }] }, { often: [{ path: 7 }] }, { checked: { read: -1, of: 1 } }, { recent: undefined }, { scope: 'computer' }, { beside: { about: 'list' } }, { rows: [{ key: 'c', ref: 'c', report: true, provider: 'codex', day: { year: 2026, month: 11, day: 24 }, time: '09:12', look: 'none', group: 'none', read: 0, helpers: 0 }] }, { reading: 'yes' }]) {
    assert.equal(await answers({ record: RECORD, answered: { [PROJECT_URL]: { ...ANSWER, ...wrong } } }).made.ask('project'), 'no-server', JSON.stringify(wrong));
  }
});

test('the report is opened in the folder it is asked of, and one not on the page is said as that', async () => {
  const opened = (output: string) => answers({ started: { ended: true, exitCode: 0, output } });
  const here = opened('Serving: http://127.0.0.1:43123/token/c1.html\n');
  assert.deepEqual(await here.made.open('project', 'c1'), { url: 'http://127.0.0.1:43123/token/c1.html', found: true });
  assert.deepEqual(here.runs, [{ args: ['start', '--detach', '--no-open', '--quiet', '--session', 'c1'], folder: '/Users/someone/work/shop' }]);
  const away = opened('That conversation was not found here, so all conversations are served.\nServing: http://127.0.0.1:43123/token/index.html\n');
  assert.deepEqual(await away.made.open('computer', 'c1'), { url: 'http://127.0.0.1:43123/token/index.html', found: false });
  assert.equal(away.runs[0]?.folder, '/Users/someone');
  assert.equal(await answers({ started: { ended: false } }).made.open('project', undefined), 'starting');
  assert.equal(await answers({ started: undefined }).made.open('project', undefined), undefined);
});

// The maintainer's run of 2026-11-24: "okay?" was answered from 1 conversation of 35, a second after the page started.
const PART: ListAnswer = { ...ANSWER, checked: { read: 1, of: 35 }, reading: true };
test('a page still reading is waited for, and the answer is of every conversation', async () => {
  const whole = { ...ANSWER, checked: { read: 35, of: 35 } };
  const { made, slept } = answers({ record: RECORD, answers: [PART, { ...PART, checked: { read: 20, of: 35 } }, whole] });
  const told: unknown[] = [];
  assert.deepEqual(await made.ask('project', { progress: (checked) => told.push(checked) }), whole);
  assert.deepEqual(slept, [500, 500]);
  assert.deepEqual(told, [{ read: 1, of: 35 }, { read: 20, of: 35 }]);
});

test('it is waited for so long and no longer: past that the answer says how far it is', async () => {
  const { made, slept } = answers({ record: RECORD, answers: [PART] });
  assert.deepEqual(await made.ask('project'), PART);
  assert.equal(slept.reduce((sum, ms) => sum + ms, 0), 40_000);
});

test('a page that has read every conversation once and reads a changed one again is waited for less', async () => {
  const again = { ...ANSWER, checked: { read: 35, of: 35 }, reading: true };
  const { made, slept } = answers({ record: RECORD, answers: [again] });
  assert.deepEqual(await made.ask('project'), again);
  assert.equal(slept.reduce((sum, ms) => sum + ms, 0), 8_000);
});

test('a page that stopped answering meanwhile leaves the last answer', async () => {
  const { made, slept } = answers({ record: RECORD, answers: [PART, undefined, undefined] });
  assert.deepEqual(await made.ask('project'), PART);
  assert.deepEqual(slept, [500], 'an answer already held is not waited beside');
  assert.equal(await made.address('project'), undefined, 'and its page is no link');
});

test('the call that asks is named to the page, and nothing that is no call id', async () => {
  const { made, asked } = answers({ record: RECORD, answers: [ANSWER] });
  await made.ask('project', { call: 'toolu_01abcDEF' });
  await made.ask('project', { call: '../../x' });
  assert.deepEqual(asked, [PROJECT_URL + '/toolu_01abcDEF', PROJECT_URL]);
});

test('a page that answers slowly is waited for by the clock, not by how often it was asked', async () => {
  for (const slow of [2_000, 9_900]) {
    const { made, slept, asked } = answers({ record: RECORD, answers: [PART], slow });
    assert.deepEqual(await made.ask('project'), PART);
    assert.ok(asked.length * slow + slept.length * 500 <= 40_000 + slow * 2 + 500, `${slow}: ${asked.length} asks`);
  }
});

const rows = (n: number) => Array.from({ length: n }, (_, at): ListAnswer['rows'][number] => ({
  key: `c${at}`, ref: `c${at}`, report: true, provider: 'claude-code', day: { year: 2026, month: 11, day: 25 }, time: '09:12', look: 'none', group: 'none', read: 0,
  files: { read: 0, changed: 0, unknown: 0, opened: 0, stopped: 0, name: 0 }, helpers: 0,
}));

// The maintainer's run in Codex, 2026-11-25: *show my sessions* waited 28 s for 54 conversations to show the newest twenty.
test('the newest conversations are answered once they are read, and the rest is said as being read', async () => {
  const some = { ...PART, checked: { read: 10, of: 35 }, rows: rows(10), newestRead: 10 };
  const { made, slept } = answers({ record: RECORD, answers: [PART, { ...PART, checked: { read: 9, of: 35 }, rows: rows(9), newestRead: 9 }, some] });
  assert.deepEqual(await made.ask('project', { newest: 10 }), some);
  assert.deepEqual(slept, [500, 500]);
});

test('rows enough are not the newest: one newer than them is waited for, and so is this computer\'s other list', async () => {
  const late = { ...PART, rows: rows(20), checked: { read: 57, of: 58 }, newestRead: 0 };
  const whole = { ...ANSWER, checked: { read: 58, of: 58 } };
  const one = answers({ record: RECORD, answers: [late, whole] });
  assert.deepEqual(await one.made.ask('project', { newest: 10 }), whole);
  const main = { ...PART, rows: rows(10), scope: 'computer' as const, checked: { read: 10, of: 35 }, newestRead: 10 };
  const both = { ...main, beside: { ...main, newestRead: 3 } };
  const done = { ...main, beside: { ...main, checked: { read: 4, of: 35 }, newestRead: 10 } };
  const two = answers({ record: RECORD, answers: [both, done] });
  assert.deepEqual(await two.made.ask('computer', { newest: 10 }), done);
  const few = { ...main, beside: { ...main, checked: { read: 2, of: 2 } } };
  assert.deepEqual(await answers({ record: RECORD, answers: [few] }).made.ask('computer', { newest: 10 }), few, 'a list read whole has no more to wait for');
});
