// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Redacted } from '../../../src/core/redaction/redacted.ts';
import type { IndexEntry, SessionIndex } from '../../../src/report/start/session-index.ts';
import { ConversationsRenderer } from '../../../src/report/start/conversations/conversations-renderer.ts';
import { ToFixRenderer } from '../../../src/report/start/to-fix/to-fix-renderer.ts';
import { MonthRenderer } from '../../../src/report/start/month/month-renderer.ts';

// `protected-everywhere` GD21: Outside projects | All at the head of the computer's Conversations, To fix and This month.

const NOW = Date.parse('2026-10-06T15:00:00Z');
const LINKS = { conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html', onboarding: 'onboarding.html' };
const ZERO = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, unknownAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const entry = (name: string, project: IndexEntry['project']): IndexEntry => ({
  name, provider: 'claude-code', title: ('Asked in ' + name) as Redacted, modifiedAt: NOW - 3_600_000, delegations: 0,
  report: { kind: 'generated', file: name + '.html', tally: ZERO, incomplete: false, files: [] }, ...(project === undefined ? {} : { project }),
});
const index = (extra: Partial<SessionIndex> = {}): SessionIndex => ({
  now: NOW, timeZone: 'UTC', since: NOW - 7 * 86_400_000, asked: '7d', shared: false, widen: 'agentwhy start --since 14d',
  entries: [entry('a', { id: '-t21', name: 'test-21', place: '~/Projects/test-21', kind: 'not-set-up' }), entry('b', { id: '-tmp', name: 'scratch', place: '/tmp/scratch', kind: 'none' })],
  settings: { level: 'no-read', protected: ['**/.env*'], allowed: [], origin: { kind: 'default' } },
  scope: 'computer', computerView: { shown: 'outside' }, ...extra,
});
const pages = (model: SessionIndex): string[] => [new ConversationsRenderer(LINKS), new ToFixRenderer(LINKS), new MonthRenderer(LINKS)].map((page) => page.render(model));
const english = (html: string): string => html.replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>/g, '');

test('GD21: the switch stands at the head of each of the three pages, the choice shown pressed and the other one posting', () => {
  for (const html of pages(index())) {
    const bar = /<main class="shell-main[^"]*" id="main"><div class="cs" data-scope[\s\S]*?<\/div><p class="cs-say">[\s\S]*?<\/p>/.exec(html)?.[0] ?? '';
    assert.ok(bar !== '', 'first in the content');
    assert.match(english(bar), /<button type="button" class="tabs-pill tabs-on" aria-pressed="true"><span class="i18n" lang="en">Outside projects<\/span>(<span class="i18n"[^>]*>[^<]*<\/span>)*<\/button>/);
    assert.match(english(bar), /aria-pressed="false" data-scope-to="projects"><span class="i18n" lang="en">Projects<\/span>(<span class="i18n"[^>]*>[^<]*<\/span>)*<\/button>/, 'no count: there may be thousands');
    assert.doesNotMatch(bar, /cs-n/);
    assert.match(english(bar), /Conversations of projects not set up yet, and of chats with no project\./);
    assert.match(html, /fetch\('api\/view'/, 'its script');
  }
  const all = pages(index({ computerView: { shown: 'projects' } }))[0] ?? '';
  assert.match(english(all), /data-scope-to="outside"/);
  assert.match(english(all), /The conversations of the projects you set up, each named by its project\./);
});

test('GD21: no switch on a page that offers no choice, nor on a project’s', () => {
  const { computerView: _view, ...noChoice } = index();
  const { scope: _scope, ...project } = index();
  for (const html of [...pages(noChoice), ...pages({ ...project, project: '/Users/someone/Projects/app' })]) {
    assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, ''), /class="cs"/);
  }
});

test('GD20: a row says why it is on the computer’s page - not set up, or no project at all, its folder on hover', () => {
  const conversations = english(pages(index())[0] ?? '');
  assert.match(conversations, /<span class="cw-project" title="~\/Projects\/test-21"><span class="tag tag-grey tag-badge tag-outlined">test-21 · <span class="i18n" lang="en">not set up<\/span><\/span><\/span>/);
  assert.match(conversations, /<span class="cw-project" title="\/tmp\/scratch"><span class="tag tag-grey tag-badge tag-outlined"><span class="i18n" lang="en">No project<\/span><\/span><\/span>/);
});
