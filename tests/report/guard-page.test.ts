// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { ToolEvent } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { ReportPageRenderer } from '../../src/report/render/report-page/report-page-renderer.ts';

// `.ai/specs/2026-10-25-the-ai-changed-its-own-guard.md` OG1-OG6 on the page: what changed, who did it, never "All good.".
const PROJECT = '/Users/someone/the-app';
let sequence = 0;
function call(toolName: string, extra: Partial<ToolEvent>, outcome: ToolEvent['outcome'] = 'succeeded'): ToolEvent {
  sequence += 1;
  const evidence = { source: { kind: 'main' as const }, record: sequence };
  return {
    id: 'call-' + sequence, agentId: 'main', sequence, toolName, input: {}, targets: [], commands: [], resultShape: 'none', toolKnown: true,
    outcome, evidence, completeness: 'complete', workingDirectory: PROJECT, ...extra,
  };
}
function page(events: readonly ToolEvent[], extra: Partial<SessionModel> = {}, withIndexLink = false): string {
  const model: SessionModel = {
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], sessionId: 'main',
    projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [], events: [...events],
    completeness: 'complete', messages: [], gaps: [], ...extra,
  };
  const report = buildReport(model, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' }, home: '/Users/someone' });
  return new ReportPageRenderer().render({ report, withIndexLink })
    .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
    .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');
}
const settings = `${PROJECT}/.claude/settings.local.json`;
const takeOut = (outcome: ToolEvent['outcome'] = 'succeeded') => call('Edit', {
  targets: [settings], removed: ['"deny": [\n      "Read(./.env)"\n    ]'], written: ['"deny": []'],
}, outcome);

test('OG1, OG2, OG4: a block taken out is said with its file, never under "All good.", and the Files tab says its rules are today\'s', () => {
  const html = page([takeOut(), call('Edit', { targets: [`${PROJECT}/CLAUDE.md`], removed: ['a'], written: ['b'] })]);
  assert.match(html, /Your AI changed what protects your files\./);
  assert.match(html, /What protects your files/);
  assert.match(html, /Took the block off <code>[^<]*\.env<\/code>/);
  assert.match(html, /Your AI did it\./);
  assert.match(html, /Changed the instructions every later conversation starts with/);
  assert.match(html, /This conversation changed what protects your files\. What this page shows as blocked or tracked is how it is today\./);
  assert.doesNotMatch(html, /All good\./);
  // No value of the file is on the page: only the name its rule is for.
  assert.doesNotMatch(html, /Read\(\.\/\.env\)/);
});

test('OG5: a stopped attempt is the protection holding - said in mint, no note, and the clean answer stands', () => {
  const html = page([takeOut('blocked')]);
  assert.match(html, /Tried to change what protects your files/);
  assert.match(html, /It was stopped, so nothing changed\./);
  assert.doesNotMatch(html, /Your AI changed what protects your files\./);
  assert.doesNotMatch(html, /how it is today\./);
});

test('OG5: a change of unknown outcome asks for a look, and says the file may not have changed', () => {
  const html = page([takeOut('unknown')]);
  assert.match(html, /Your AI changed what protects your files\./);
  assert.match(html, /Whether the file changed is not known\./);
});

test('a conversation that changed no guard file draws no section and no note', () => {
  const html = page([call('Edit', { targets: [`${PROJECT}/src/app.ts`], removed: ['a'], written: ['b'] })]);
  assert.doesNotMatch(html, /What protects your files|class="rp-did rp-guard"|class="rp-guard-note"/);
});

// The review of steps 2-3.
test('a change that only blocked more files asks nothing: the clean answer stands, the line says it is more protected', () => {
  const html = page([call('Edit', { targets: [settings], removed: ['"deny": []'], written: ['"deny": [\n      "Read(./.env)"\n    ]'] })]);
  assert.match(html, /Blocked <code>[^<]*\.env<\/code>/);
  assert.match(html, /More protected/);
  assert.doesNotMatch(html, /Your AI changed what protects your files\./);
  assert.doesNotMatch(html, /how it is today\./);
});

test('a stopped edit of an instruction file is said as stopped, never as done', () => {
  const html = page([call('Edit', { targets: [`${PROJECT}/CLAUDE.md`], removed: ['a'], written: ['b'] }, 'blocked')]);
  assert.match(html, /It was stopped, so nothing changed\./);
  assert.doesNotMatch(html, /Nothing to do, unless you didn’t ask for it\./);
});

test('a helper\'s change names the helper and its task, and a served page offers Settings', () => {
  const html = page([takeOut()].map((event) => ({ ...event, agentId: 'helper' })), {
    agents: [{ id: 'main', type: 'main', depth: 0 }, { id: 'helper', type: 'general-purpose', depth: 1 }],
    delegations: [{
      id: 'd1', parentAgentId: 'main', childAgentId: 'helper', description: 'Make the <tests> pass', prompt: 'Make the <tests> pass',
      reports: [], followUps: [], completeness: 'complete', evidence: { source: { kind: 'main' }, record: 99 },
    }],
  } as unknown as Partial<SessionModel>, true);
  assert.match(html, /did it, asked to: Make the &lt;tests&gt; pass/);
  assert.match(html, /href="settings\.html"[^>]*>[^<]*(?:<[^>]+>)*Check in Settings/);
});

// The plan's step 4: the row, `check` and the text report ask the page's question, so one conversation gets one answer.
test('step 4: the row\'s status, check and the text report say a weakened protection as the page does', async () => {
  const { statusOfRecord, LOOK_OF_STATUS } = await import('../../src/report/start/render/session-status.ts');
  const { actionsOf } = await import('../../src/report/check/session-actions.ts');
  const { asksOf, digestOf } = await import('../../src/report/check/actions-digest.ts');
  const { TextReportRenderer } = await import('../../src/report/render/text-report-renderer.ts');
  const build = (events: readonly ToolEvent[]) => buildReport({
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], sessionId: 'main',
    projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [], events: [...events],
    completeness: 'complete', messages: [], gaps: [],
  }, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' }, home: '/Users/someone' });
  const asks = (report: ReturnType<typeof build>) => asksOf(digestOf([actionsOf(report)], { asked: '7d', sessionsUnreadable: 0, policyKind: 'default' }));

  const weakened = build([takeOut()]);
  assert.equal(weakened.tally.guardWeakened, 1);
  assert.equal(LOOK_OF_STATUS[statusOfRecord({ tally: weakened.tally, incomplete: false })], 'guard');
  assert.equal(asks(weakened).files, 1, 'check --fail-on any fails');
  assert.equal(asks(weakened).rotate, 0, 'check --fail-on rotate does not: no key was read');
  assert.match(new TextReportRenderer(120).render(weakened), /! \S*settings\.local\.json — took out the block for \S*\.env/);

  for (const events of [
    [takeOut('blocked')],
    [call('Edit', { targets: [settings], removed: ['"deny": []'], written: ['"deny": [\n      "Read(./.env)"\n    ]'] })],
    [call('Edit', { targets: [`${PROJECT}/CLAUDE.md`], removed: ['a'], written: ['b'] })],
  ]) {
    const calm = build(events);
    assert.equal(calm.tally.guardWeakened, undefined);
    assert.equal(LOOK_OF_STATUS[statusOfRecord({ tally: calm.tally, incomplete: false })], 'none');
    assert.equal(asks(calm).files, 0);
  }
});

// The review of step 4: the chat's answer names the look and says what changed, as the page does.
test('step 4: agentwhy why says what changed in what protects the files, and the card counts it', async () => {
  const { chatAnswer } = await import('../../src/report/render/chat/chat-answer.ts');
  const { cardView } = await import('../../src/report/render/chat/chat-views.ts');
  const { translator } = await import('../../src/report/render/report-copy.ts');
  const report = buildReport({
    provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], sessionId: 'main',
    projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }], delegations: [], events: [takeOut()],
    completeness: 'complete', messages: [], gaps: [],
  }, DEFAULT_POLICY, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' }, home: '/Users/someone' });
  const answer = chatAnswer(report, translator('en'));
  assert.match(answer, /\*\*Changed your protection\*\*/);
  assert.match(answer, /\*\*What protects your files\*\*\n- .*settings\.local\.json.* - Took the block off `[^`]*\.env`/);
  assert.match(cardView(report, translator('en')), /What protects your files: 1/);
});
