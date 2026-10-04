// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ToolEvent } from '../../../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../../../src/core/policy/default-policy.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../../../src/core/session-model.ts';
import { buildReport } from '../../../../src/report/build-report.ts';
import { ReportPageRenderer } from '../../../../src/report/render/report-page/report-page-renderer.ts';
import { clockIn } from '../../../../src/report/render/report-page/times.ts';

// `specs/2026-09-23-the-report-page.md` M4, Q1, P4, P13, P16, P51: a record's time is shown beside its order, in the
// machine's time zone, and never used to order anything. Keys are assembled at run time.
const STRIPE = ['sk_', 'live_', 'Test0000000000000000000'].join('');
const T0 = Date.parse('2026-09-23T08:02:10.000Z');

let sequence = 0;
/** A read of `.env` whose record was written `seconds` after T0 - or with no time at all. */
function read(path: string, seconds: number | undefined): ToolEvent {
  sequence += 1;
  const evidence = { source: { kind: 'main' as const }, record: sequence, ...(seconds === undefined ? {} : { at: T0 + seconds * 1000 }) };
  return {
    id: 'call-' + sequence, agentId: 'main', sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content: `STRIPE_SECRET_KEY=${STRIPE}`, evidence },
  };
}

const model = (events: ToolEvent[]): SessionModel => ({
  provider: 'claude-code',
  turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
  sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [], events,
  completeness: 'complete', messages: [], gaps: [],
});
const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

test('the model carries each record’s time for display, and the span of the session, never under --share', () => {
  const events = [read('apps/web/.env', 0), read('apps/api/.env', 5 * 60)];
  const report = buildReport(model(events), DEFAULT_POLICY, new Redactor('test'));
  assert.deepEqual(report.scope.times, { first: T0, last: T0 + 5 * 60 * 1000 });
  assert.deepEqual(report.mainAgent.map((action) => action.at), [T0, T0 + 5 * 60 * 1000]);
  assert.deepEqual(report.flows[0]?.steps.map((step) => step.at), [T0, T0 + 5 * 60 * 1000]);

  const shared = buildReport(model(events), DEFAULT_POLICY, new Redactor('test', { kind: 'absent' }, true), { share: true, projectRoot: { kind: 'absent' } });
  assert.equal(shared.scope.times, undefined, 'a shared report says when nothing happened');
  assert.ok(shared.mainAgent.every((action) => action.at === undefined));
  assert.ok(shared.flows.every((flow) => flow.steps.every((step) => step.at === undefined)));
});

// P4: the day and the first and last time, in the machine's zone.
test('the page says which conversation this is - its day, and its first and last time - in the machine’s zone', () => {
  const report = buildReport(model([read('apps/web/.env', 0), read('apps/api/.env', 6 * 60)]), DEFAULT_POLICY, new Redactor('test'));
  const html = english(new ReportPageRenderer().render({ report, withIndexLink: false, timeZone: 'Europe/Warsaw' }));
  assert.match(html, /<p class="rp-when">Report from <b>Wednesday 23 September, 10:02 – 10:08<\/b><\/p>/);
  const utc = english(new ReportPageRenderer().render({ report, withIndexLink: false }));
  assert.match(utc, /Report from <b>Wednesday 23 September, 08:02 – 08:08<\/b>/, 'with no zone given, UTC - and said as a time, not guessed');
});

// P13, P16, P51: a time beside each entry, in the record's order even where the clock runs backwards.
test('each entry shows its time beside the record’s order, and the order stays the record’s when the clock runs back', () => {
  // A read of .env, one of another file between, and .env again: two steps on .env, whose clock runs backwards.
  const report = buildReport(model([read('apps/web/.env', 30), read('apps/api/.env', 20), read('apps/web/.env', 10)]), DEFAULT_POLICY, new Redactor('test'));
  const html = english(new ReportPageRenderer().render({ report, withIndexLink: false, timeZone: 'UTC' }));
  const story = html.slice(html.indexOf('<ol class="sw-story">'), html.indexOf('</ol>', html.indexOf('<ol class="sw-story">')));
  assert.deepEqual([...story.matchAll(/<span class="sw-time">([^<]*)<\/span>/g)].map((match) => match[1]), ['08:02:40', '08:02:20', ''], 'as recorded, then the company');
  assert.match(html, /Times are when each line was written\. The order is the record’s\./);
  assert.match(html, /<span>#<\/span><span>Time<\/span>/);
  // Advanced's first and last record carry their time beside their reference, as recorded.
  assert.match(html, /<span class="adv-refs">08:02:40 · session record \d+<br><span class="adv-dim">→ 08:02:20 · session record \d+<\/span>/);
});

// P51: a record with no time shows none - no column, no line, no guess.
test('a record with no time shows no time anywhere', () => {
  const report = buildReport(model([read('apps/web/.env', undefined)]), DEFAULT_POLICY, new Redactor('test'));
  const html = english(new ReportPageRenderer().render({ report, withIndexLink: false, timeZone: 'UTC' }));
  assert.doesNotMatch(html, /class="rp-when"|class="sw-time"|<span>Time<\/span>|Times are when/);
});

test('an unknown zone is read as UTC rather than failing the page', () => {
  assert.equal(clockIn('Not/AZone').time(T0), '08:02:10');
  assert.equal(clockIn('Europe/Warsaw').time(T0), '10:02:10');
  assert.equal(clockIn(undefined).day(T0, 'pl'), 'środa, 23 września');
});

// Found on a real report: "Monday 21 September, 18:46 – 15:28" - a conversation over two days read as time running back.
test('a conversation over more than one day names both days', () => {
  const report = buildReport(model([read('apps/web/.env', 0), read('apps/api/.env', 2 * 24 * 60 * 60 - 3 * 60 * 60)]), DEFAULT_POLICY, new Redactor('test'));
  const html = english(new ReportPageRenderer().render({ report, withIndexLink: false, timeZone: 'UTC' }));
  assert.match(html, /Report from <b>Wednesday 23 September, 08:02 – Friday 25 September, 05:02<\/b>/);
});
