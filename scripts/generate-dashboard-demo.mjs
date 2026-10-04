// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// A clearly labelled, entirely fictional session for exploring the report without private transcripts.
import { writeFile } from 'node:fs/promises';
import { buildReport } from '../src/report/build-report.ts';
import { DEFAULT_POLICY } from '../src/core/policy/default-policy.ts';
import { Redactor } from '../src/core/redaction/redactor.ts';
import { ReportPageRenderer } from '../src/report/render/report-page/report-page-renderer.ts';

const sessionId = 'demo-fictional';
const agents = [
  { id: sessionId, type: 'main', depth: 0 },
  { id: 'agent-demo-handler', type: 'Explore', depth: 1 },
  { id: 'agent-demo-webhook', type: 'general-purpose', depth: 1 },
  { id: 'agent-demo-schema', type: 'Explore', depth: 2 },
  { id: 'agent-demo-env', type: 'Explore', depth: 1 },
  { id: 'agent-demo-unknown', type: 'Explore', depth: 1 },
];
const evidence = (agentId, record) => ({
  source: agentId === sessionId ? { kind: 'main' } : { kind: 'agent', agentId }, record,
});
const tasks = [
  [sessionId, agents[1].id, 'Find the webhook handler in the application code'],
  [sessionId, agents[2].id, 'Diagnose the webhook error and check its configuration'],
  [agents[2].id, agents[3].id, 'Check the schema of the data sent to the webhook'],
  [sessionId, agents[4].id, 'Check how the application loads environment variables'],
  [sessionId, agents[5].id, 'Find the missing encryption key configuration'],
];
const delegations = tasks.map(([parentAgentId, childAgentId, description], index) => ({
  id: 'task-' + index, parentAgentId, childAgentId, description,
  requestedType: agents.find(agent => agent.id === childAgentId).type,
  reports: [], followUps: [], evidence: evidence(parentAgentId, index + 1), completeness: 'complete',
}));
function event(id, agentId, sequence, toolName, targets, commands, outcome, content) {
  return {
    id, agentId, sequence, toolName, input: {}, targets, commands, outcome,
    resultShape: toolName === 'Bash' ? 'listing' : 'content',
    toolKnown: true, completeness: outcome === 'unknown' ? 'partial' : 'complete',
    evidence: evidence(agentId, sequence),
    ...(outcome === 'unknown' ? {} : { result: { content, stage: 'model', completeness: 'complete', evidence: evidence(agentId, sequence + 1) } }),
  };
}
const events = [
  ...delegations.map((task, index) => event(task.id, task.parentAgentId, index + 1, 'Agent', [], [], 'succeeded', 'Task handed over')),
  event('handler', agents[1].id, 1, 'Read', ['src/webhook.ts'], [], 'succeeded', 'Handler code'),
  event('search', agents[2].id, 6, 'Bash', [], ['grep -rn WEBHOOK_SECRET apps/web'], 'succeeded',
    'apps/web/.env.development:12:WEBHOOK_SECRET=DEMO_ONLY_NOT_A_SECRET'),
  event('schema', agents[3].id, 1, 'Read', ['src/webhook-schema.ts'], [], 'succeeded', 'Data schema'),
  event('denied', agents[4].id, 1, 'Read', ['apps/web/.env.local'], [], 'blocked', 'Permission denied'),
  event('missing', agents[5].id, 1, 'Read', ['apps/web/.env.production'], [], 'unknown'),
];
const model = {
  sessionId, projectRoot: { kind: 'absent' }, agents, delegations, events, messages: [], completeness: 'partial',
  provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
  gaps: [{ kind: 'result-missing', evidence: evidence(agents[5].id, 1) }],
};
const report = buildReport(model, DEFAULT_POLICY, new Redactor('fictional-dashboard-demo'));
// The tab says it is a demonstration, so a screenshot of it is never taken for a report of a real session.
const html = new ReportPageRenderer().render({ report, withIndexLink: false })
  .replace('<title>Report · agentwhy</title>', '<title>Demonstration — fictional data · agentwhy</title>');
// The report is written inside this package and nowhere else: the command belongs to the repository that owns
// the renderer, and a script that reaches into a sibling directory fails for everyone who does not have one.
await writeFile('demo.report.html', html, 'utf8');
console.log('Demonstration report written to demo.report.html. Every value in it is fictional.');
