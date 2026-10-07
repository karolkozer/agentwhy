// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// The onboarding from entirely fictional data: the example files of the design file "agentwhy Onboarding", for
// comparing the page with the design one to one (`.ai/plans/2026-09-24-onboarding.md`, step 7). Writes
// demo.onboarding.html (files to fix, with the intro), demo.onboarding-clean.html (nothing to fix) and
// demo.onboarding-empty.html (no conversations yet), gitignored like every page - and the computer-wide path
// (`.ai/specs/2026-10-05-protected-everywhere.md`), as the approved mock draws it: demo.onboarding-everywhere.html from a
// project nobody set up, and demo.onboarding-home.html from the home folder.
import { writeFile } from 'node:fs/promises';
import { OnboardingRenderer } from '../src/report/start/onboarding/onboarding-renderer.ts';
import { globalDefaults } from '../src/setup/global-defaults.ts';

const NOW = Date.parse('2026-09-24T10:00:00Z');
const HOUR = 3_600_000;
const ZERO = { contentsSeen: 0, filesReached: 0, onlyThroughResult: 0, namedByCall: 0, refusedAttempts: 0, valuesReturned: 0, valuesWritten: 0, wroteInMessages: 0, filesWrittenOnward: 0, valueUses: 0 };
const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];
const LINKS = { conversations: 'demo.index.html', toFix: 'demo.to-fix.html', month: 'month.html', settings: 'demo.settings.html', onboarding: 'demo.onboarding.html' };

// A project nobody has set up: no hook, the built-in list, the product's notice defaults.
const settings = {
  level: 'no-read',
  protected: BUILT_IN,
  allowed: [],
  origin: { kind: 'default' },
  hooks: { watch: false, refuse: false, reads: { watch: 'default', refuse: 'default' }, path: '.claude/settings.local.json', sharedPath: '.claude/settings.json' },
  mine: {},
  held: { local: [], shared: [] },
  // Both told lists read and empty: every row is on Block, and Tell me can be chosen (F57).
  told: { local: [], shared: [] },
  notices: {
    on: 'value', clean: 'once', say: 'agent', notify: ['chat'],
    from: { on: 'default', clean: 'default', say: 'default', notify: 'default' },
    path: '/Users/someone/.agentwhy/notices.json',
    unusable: false,
  },
};

// Fifty-six conversations, as the design's scan counts them, one every three hours.
const entries = Array.from({ length: 56 }, (_unused, at) => ({
  name: 'c' + String(at + 1).padStart(2, '0'),
  title: 'Fix the website',
  modifiedAt: NOW - HOUR / 60 - at * 3 * HOUR,
  delegations: 0,
  report: { kind: 'generated', file: 'c' + String(at + 1).padStart(2, '0') + '.html', tally: ZERO, incomplete: false, files: [] },
}));
const first = (n) => entries.slice(0, n).map((entry) => entry.name);

const base = { now: NOW, timeZone: 'UTC', since: NOW - 7 * 24 * HOUR, asked: '7d', shared: false, widen: 'agentwhy start --since 14d', entries, settings };
const renderer = new OnboardingRenderer(LINKS);

// The design's three files your AI already read.
await writeFile('demo.onboarding.html', renderer.render({
  ...base,
  onboarding: { intro: true },
  check: { rows: [{ label: 'rotate', path: '.env', sessions: first(23) }, { label: 'rotate', path: '.env.b9', sessions: first(22) }, { label: 'rotate', path: './.env', sessions: first(1) }], refusedAttempts: 0 },
}));
await writeFile('demo.onboarding-clean.html', renderer.render({ ...base, onboarding: { intro: false } }));
await writeFile('demo.onboarding-empty.html', renderer.render({ ...base, entries: [], onboarding: { intro: false } }));
// The mock's Mac: server keys blocked already; AWS, Google Cloud, GitHub and saved Git passwords here; the rest not.
const here = new Set(['ssh', 'aws', 'gcloud', 'github', 'git-credentials']);
const everywhere = {
  rows: globalDefaults('darwin').map((row) => ({ ...row, present: here.has(row.id) })),
  blocked: ['**/.ssh/**'],
  told: [],
  codex: true,
};
await writeFile('demo.onboarding-everywhere.html', renderer.render({
  ...base,
  project: '/Users/someone/Projects/my-app',
  place: '~/Projects/my-app',
  onboarding: { intro: false },
  everywhere,
}));
await writeFile('demo.onboarding-home.html', renderer.render({
  ...base,
  notAProject: 'home',
  onboarding: { intro: false, atProject: true },
  everywhere,
}));
console.log('demo.onboarding.html, demo.onboarding-clean.html, demo.onboarding-empty.html, demo.onboarding-everywhere.html and demo.onboarding-home.html written');
