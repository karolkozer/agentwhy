// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// The Settings page from entirely fictional data: the state the design file "agentwhy Settings" opens in, and a second
// state with everything on, for comparing the page with the design one to one. Writes demo.settings.html and
// demo.settings-on.html, which are gitignored like every generated page.
import { writeFile } from 'node:fs/promises';
import { SettingsRenderer } from '../src/report/start/settings/settings-renderer.ts';

const NOW = Date.parse('2026-09-23T10:00:00Z');
const LINKS = { conversations: 'demo.index.html', toFix: 'to-fix.html', month: 'demo.month.html', settings: 'demo.settings.html' };
const BUILT_IN = ['**/.env*', '**/*.env', '**/.npmrc', '**/secrets/**', '**/.ssh/**', '**/id_rsa*'];
const NOTICES = {
  on: 'value',
  clean: 'once',
  say: 'agent',
  notify: ['chat'],
  from: { on: 'default', clean: 'default', say: 'default', notify: 'default' },
  path: '/Users/someone/.agentwhy/notices.json',
  unusable: false,
};

function index(settings) {
  return {
    now: NOW,
    since: NOW - 30 * 86_400_000,
    asked: '30d',
    project: '/Users/someone/projects/test-project-for-agentwhy',
    shared: false,
    widen: 'agentwhy start --since 60d',
    entries: [],
    settings: { level: 'no-read', protected: BUILT_IN, allowed: [], origin: { kind: 'default' }, notices: NOTICES, ...settings },
  };
}

// As the design file opens: alerts on for just you, search protection off, and one rule of the project's the hooks do not read.
const first = index({
  hooks: { watch: 'local', refuse: false, reads: { watch: 'default', refuse: 'default' }, path: '.claude/settings.local.json', sharedPath: '.claude/settings.json' },
  mine: { '**/.env.local': { file: 'local', rule: './.env.local', whole: true } },
  held: { local: ['**/.env.local'], shared: [] },
});

// Everything on: the hooks read the local file, which holds the built-in list, the project's rule and one of the person's.
const on = index({
  hooks: { watch: 'local', refuse: 'shared', reads: { watch: 'local', refuse: 'local' }, path: '.claude/settings.local.json', sharedPath: '.claude/settings.json' },
  mine: {
    ...Object.fromEntries(BUILT_IN.map((pattern) => [pattern, { file: 'local', rule: pattern, whole: true }])),
    '**/.env.local': { file: 'local', rule: './.env.local', whole: true },
    '**/contract.pdf': { file: 'local', rule: '**/contract.pdf', whole: true },
  },
  held: { local: [...BUILT_IN, '**/.env.local', '**/contract.pdf'], shared: [] },
  notices: { ...NOTICES, on: 'refused' },
});

const renderer = new SettingsRenderer(LINKS);
await writeFile('demo.settings.html', renderer.render(first));
await writeFile('demo.settings-on.html', renderer.render(on));
console.log('demo.settings.html and demo.settings-on.html written');
