import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { SessionIndex } from '../../../../src/report/start/session-index.ts';
import { SettingsRenderer } from '../../../../src/report/start/settings/settings-renderer.ts';

// `.ai/plans/2026-09-24-onboarding.md`, step 6: Settings leads back to the onboarding where a run serves it (W25).

const LINKS = { conversations: 'index.html', toFix: 'to-fix.html', month: 'month.html', settings: 'settings.html', onboarding: 'onboarding.html' };

function index(extra: Partial<SessionIndex> = {}): SessionIndex {
  return {
    now: 0, since: 0, asked: '7d', shared: false, widen: 'agentwhy start --since 14d', entries: [],
    settings: { level: 'no-read', protected: [], allowed: [], origin: { kind: 'default' } },
    ...extra,
  };
}

test('W25, W25a: General carries "See the welcome again" where the onboarding is served, and only there', () => {
  const html = new SettingsRenderer(LINKS).render(index({ onboarding: { intro: false } }));
  assert.equal(html.match(/<section class="set-box set-again">/g)?.length, 1, 'a card of its own, drawn as Uninstall is');
  assert.match(html, /<a class="pill pill-outline pill-lg" href="onboarding.html">/, 'a button, not coloured text (\u00a79.3)');
  const who = html.indexOf('class="set-box set-who"');
  const again = html.indexOf('class="set-box set-again"');
  const uninstall = html.indexOf('class="set-box set-uninstall"');
  assert.ok(who < again && (uninstall === -1 || again < uninstall), 'in General, after who it is for, and before Uninstall');
  assert.doesNotMatch(new SettingsRenderer(LINKS).render(index()), /class="set-box set-again"/, 'a run that did not write it does not lead to it');
  const { onboarding: _onboarding, ...without } = LINKS;
  assert.doesNotMatch(new SettingsRenderer(without).render(index({ onboarding: { intro: false } })), /class="set-box set-again"/);
});
