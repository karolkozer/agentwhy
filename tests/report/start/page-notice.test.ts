// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ConversationsRenderer } from '../../../src/report/start/conversations/conversations-renderer.ts';
import { MonthRenderer } from '../../../src/report/start/month/month-renderer.ts';
import { OnboardingRenderer } from '../../../src/report/start/onboarding/onboarding-renderer.ts';
import type { SessionIndex } from '../../../src/report/start/session-index.ts';
import { SettingsRenderer } from '../../../src/report/start/settings/settings-renderer.ts';
import { ToFixRenderer } from '../../../src/report/start/to-fix/to-fix-renderer.ts';

const LINKS = { conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html', onboarding: 'onboarding.html' };

function index(behind?: { from: string; to: string; shared: boolean }, pluginBehind?: { running: string; newer: string }): SessionIndex {
  return {
    now: 0, since: 0, asked: '7d', shared: false, widen: 'agentwhy start --since 14d', entries: [],
    settings: {
      level: 'no-read', protected: [], allowed: [], origin: { kind: 'default' },
      hooks: {
        watch: 'local', refuse: false, reads: { watch: 'default', refuse: 'default' },
        path: '.claude/settings.local.json', sharedPath: '.claude/settings.json',
        ...(behind === undefined ? {} : { behind }),
        ...(pluginBehind === undefined ? {} : { pluginBehind }),
      },
    },
  };
}

// `nothing-updates-by-itself` U4: every page `start` serves draws it while the hooks are behind; the onboarding never.
test('Conversations, To fix, This month and Settings draw the update notice while the hooks are behind, and only then', () => {
  const behind = { from: '0.2.0', to: '0.3.0', shared: false };
  for (const renderer of [new ConversationsRenderer(LINKS), new ToFixRenderer(LINKS), new MonthRenderer(LINKS), new SettingsRenderer(LINKS)]) {
    const name = renderer.constructor.name;
    assert.equal(renderer.render(index(behind)).match(/<aside class="upd" data-update-notice/g)?.length, 1, name);
    assert.doesNotMatch(renderer.render(index()), /data-update-notice/, name);
  }
});

test('the onboarding never draws it: the hooks it writes are this release\'s', () => {
  assert.doesNotMatch(new OnboardingRenderer(LINKS).render(index({ from: '0.2.0', to: '0.3.0', shared: false })), /data-update-notice/);
});

// `agentwhy-as-a-plugin.md` AP13, both ways: hooks older than the plugin keep U4's notice; hooks newer get the plugin's.
test('AP13: in the plugin\'s run, hooks behind it keep their notice, and hooks ahead of it draw the plugin\'s', () => {
  const renderer = new SettingsRenderer(LINKS);
  const ahead = renderer.render(index(undefined, { running: '0.4.2', newer: '0.5.0' }));
  assert.equal(ahead.match(/<aside class="upd" data-update-notice/g)?.length, 1);
  const notice = /<aside class="upd"[\s\S]*?<\/aside>/.exec(ahead)?.[0] ?? '';
  assert.match(notice, /A newer agentwhy is out/);
  assert.doesNotMatch(notice, /data-upd-update/);
  const both = renderer.render(index({ from: '0.2.0', to: '0.4.2', shared: false }, { running: '0.4.2', newer: '0.5.0' }));
  assert.equal(both.match(/<aside class="upd" data-update-notice/g)?.length, 1, 'one notice at a time');
  assert.match(/<aside class="upd"[\s\S]*?<\/aside>/.exec(both)?.[0] ?? '', /data-upd-update/, 'the one that can do something: the hooks behind come up to the plugin\'s release');
  assert.doesNotMatch(new OnboardingRenderer(LINKS).render(index(undefined, { running: '0.4.2', newer: '0.5.0' })), /data-update-notice/);
});
