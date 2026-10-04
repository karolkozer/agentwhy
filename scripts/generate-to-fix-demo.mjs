// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// The To fix page from entirely fictional data: the example files of the design file "agentwhy To fix", for comparing
// the page with the design one to one. Writes demo.to-fix.html and demo.to-fix-clean.html, gitignored like every page.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ToFixRenderer } from '../src/report/start/to-fix/to-fix-renderer.ts';

const NOW = Date.parse('2026-09-23T10:00:00Z');
const HOUR = 3_600_000;
const ZERO = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const ASKED = ['Find out why the AI chat stopped answering', 'Fix the sign-up button on the home page', 'Connect the payments page to Stripe',
  'Add a missing setting for emails', 'Make the pricing page look better on phones', 'Export the customer list for the newsletter'];
const LINKS = { conversations: 'demo.index.html', toFix: 'demo.to-fix.html', month: 'month.html', settings: 'demo.settings.html' };

// A session id as Claude Code writes one, made up from the conversation's place, so the developer details look as they do.
const sessionId = (at) => {
  const hex = createHash('sha256').update('demo conversation ' + at).digest('hex');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-8' + hex.slice(17, 20) + '-' + hex.slice(20, 32);
};
// Thirty-two conversations, newest first, one every five hours.
const entries = Array.from({ length: 32 }, (_unused, at) => ({
  name: sessionId(at),
  title: ASKED[at % ASKED.length],
  modifiedAt: NOW - HOUR / 60 - at * 5 * HOUR,
  delegations: at % 3,
  report: { kind: 'generated', file: sessionId(at) + '.html', tally: ZERO, incomplete: false, files: [] },
}));
// What happened to .env in each conversation, as its report tells it: your AI read it, and a helper it brought in read it
// too and passed a key back. Fictional, like everything here.
const main = { index: 0, actions: 41 };
const helper = { index: 1, ordinal: 1, broughtBy: 'main', askedTo: 'Find out why the chat stopped answering', actions: 12 };
const story = {
  entries: [
    { agent: main, kind: 'read', count: 1, did: 'Read', outcome: 'succeeded', evidence: ['main:14'], at: NOW - 3 * HOUR },
    { agent: helper, kind: 'read', count: 2, did: 'Bash: cat', outcome: 'succeeded', evidence: ['agent-1:3', 'agent-1:5'], at: NOW - 2 * HOUR },
    { agent: helper, kind: 'passed', count: 1, outcome: 'succeeded', evidence: ['agent-1:9'], to: main, at: NOW - 2 * HOUR + 60_000 },
  ],
  holders: [
    { agent: main, read: true, passed: false, saved: false, repeated: false, used: false, stopped: false },
    { agent: helper, read: true, passed: true, saved: false, repeated: false, used: false, stopped: false },
  ],
  readers: 2, opened: 3, stopped: 0, complete: true,
};
for (const entry of entries) entry.report.stories = { sessionId: entry.name, files: new Map([['.env', story], ['.env.b9', story]]) };
const first = (n) => entries.slice(0, n).map((entry) => entry.name);
const MARKED = Date.parse('2026-09-19T12:43:00Z');

const check = {
  rows: [
    // What the conversations read from it, names only - the wizard names the services and the lines to replace.
    { label: 'rotate', path: '.env', sessions: first(23), reopened: { result: 'rotated', at: MARKED }, keyed: true, read: {
      keys: ['stripe-key', 'supabase-key'],
      names: ['STRIPE_SECRET_KEY', 'SUPABASE_SERVICE_KEY', 'NODE_ENV'],
      keyed: [{ name: 'STRIPE_SECRET_KEY', key: 'stripe-key' }, { name: 'SUPABASE_SERVICE_KEY', key: 'supabase-key' }],
    } },
    { label: 'rotate', path: '.env.b9', sessions: first(22) },
    { label: 'rotate', path: './.env', sessions: first(1), reopened: { result: 'rotated', at: MARKED } },
    { label: 'template', path: '.env.example', sessions: first(32) },
    { label: 'template', path: './.env.example', sessions: first(1), reopened: { result: 'not-secret', at: MARKED } },
    { label: 'route', path: '.env.local', sessions: first(19) },
    { label: 'result', path: './.env.b9', sessions: first(1) },
  ],
  refusedAttempts: 1,
  history: [
    { path: '.env.production', label: 'rotate', result: 'rotated', at: Date.parse('2026-09-18T15:00:00Z'), note: 'New keys in Stripe and Supabase', sessions: [], status: 'standing', reopened: false },
    { path: '.env.development', label: 'rotate', result: 'rotated', at: Date.parse('2026-09-18T14:00:00Z'), sessions: [], status: 'standing', reopened: false },
    { path: '.env.test', label: 'rotate', result: 'rotated', at: Date.parse('2026-09-17T11:00:00Z'), sessions: [], status: 'standing', reopened: false },
    { path: 'customers.csv', label: 'rotate', result: 'handled', at: Date.parse('2026-09-16T09:00:00Z'), note: 'Told the IT team', sessions: [], status: 'standing', reopened: false },
  ],
};

const index = (withCheck) => ({
  now: NOW, timeZone: 'UTC', since: NOW - 7 * 24 * HOUR, asked: '7d',
  project: '/Users/someone/projects/test-project-for-agentwhy', shared: false, widen: 'agentwhy start --since 14d', entries,
  settings: { level: 'no-read', protected: ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'], allowed: [], origin: { kind: 'default' } },
  check: withCheck,
});

const renderer = new ToFixRenderer(LINKS);
await writeFile('demo.to-fix.html', renderer.render(index(check)));
await writeFile('demo.to-fix-clean.html', renderer.render(index({ rows: [], refusedAttempts: 0, history: check.history })));
console.log('demo.to-fix.html and demo.to-fix-clean.html written');
