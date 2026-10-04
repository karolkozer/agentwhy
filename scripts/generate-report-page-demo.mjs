// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
// The new report page from an entirely fictional session: the files of the design file "agentwhy App" - keys for
// Stripe, Supabase, Google and OpenAI, one key no provider is known for, a customer list with none - and a helper that
// passed a value back. Writes demo.report-page.html, gitignored like every generated page.
//
// Every key below is assembled when the script runs, so no string in this file has the shape of a real key: a public
// repository's secret scanner would otherwise, rightly, flag it.
import { writeFile } from 'node:fs/promises';
import { DEFAULT_POLICY } from '../src/core/policy/default-policy.ts';
import { Redactor } from '../src/core/redaction/redactor.ts';
import { buildReport } from '../src/report/build-report.ts';
import { ReportPageRenderer } from '../src/report/render/report-page/report-page-renderer.ts';

const fake = (...parts) => parts.join('');
const STRIPE = fake('sk_', 'live_', 'Demo0000000000000000000');
const SUPABASE = fake('sbp_', 'demo00000000000000000000');
const GOOGLE = fake('AIza', 'Demo000000000000000000000000000000000');
const OPENAI = fake('sk-', 'proj-', 'Demo00000000000000000000');

const FILES = [
  ['apps/web/.env.production', [`STRIPE_SECRET_KEY=${STRIPE}`, `SUPABASE_ACCESS_TOKEN=${SUPABASE}`, `RESEND_API_KEY=${fake('re_', 'demo_value_0000')}`]],
  ['apps/web/.env', [`SUPABASE_ACCESS_TOKEN=${SUPABASE}`, `GOOGLE_API_KEY=${GOOGLE}`]],
  ['packages/ticket-widget/.env', [`STRIPE_SECRET_KEY=${STRIPE}`]],
  ['apps/web/.env.development', [`STRIPE_SECRET_KEY=${STRIPE}`, `SUPABASE_ACCESS_TOKEN=${SUPABASE}`]],
  ['apps/web/.env.test', [`SUPABASE_ACCESS_TOKEN=${SUPABASE}`]],
  ['data/exports/customers.csv', ['name,email,plan', 'Ada,ada@example.test,pro', 'Grace,grace@example.test,team']],
  ['apps/web/.env.local', [`OPENAI_API_KEY=${OPENAI}`]],
];

let sequence = 0;
// A fictional morning: each record written some seconds after the one before, for the page's times (M4).
const START = Date.parse('2026-09-23T08:02:10.000Z');
const read = (agentId, path, content) => {
  sequence += 1;
  const evidence = { source: agentId === 'main' ? { kind: 'main' } : { kind: 'agent', agentId }, record: sequence, at: START + sequence * 19_000 };
  return {
    id: 'call-' + sequence, agentId, sequence, toolName: 'Read', input: {}, targets: [path], commands: [], resultShape: 'content',
    toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete',
    result: { content, stage: 'model', completeness: 'complete', evidence: { ...evidence, record: sequence + 1000 } },
  };
};

const helper = 'agent-demo-helper6';
// Everyday files, as a session reads and changes them around its work: the Files view lists them as nothing to do.
const EVERYDAY = [['README.md', '# Ticket app'], ['AGENTS.md', 'Use pnpm.'], ['package.json', '{ "name": "ticket-app" }'], ['apps/web/src/app.ts', 'export {};']];

const events = [
  ...FILES.map(([path, lines]) => read('main', path, lines.join('\n'))),
  ...EVERYDAY.map(([path, content]) => read('main', path, content)),
  read(helper, FILES[0][0], FILES[0][1].join('\n')),
];

const model = {
  sessionId: 'main',
  projectRoot: { kind: 'absent' },
  agents: [{ id: 'main', type: 'main', depth: 0 }, { id: helper, type: 'Explore', depth: 1 }],
  delegations: [{
    id: 'task-demo', parentAgentId: 'main', childAgentId: helper, description: 'Find out why the app breaks when something is deleted',
    prompt: 'fictional', requestedType: 'Explore', reports: [{ content: `The key is ${STRIPE}`, evidence: { source: { kind: 'agent', agentId: helper }, record: 99 } }],
    followUps: [], evidence: { source: { kind: 'main' }, record: 1 }, completeness: 'complete',
  }],
  events,
  completeness: 'complete',
  messages: [],
  provider: 'claude-code', turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
  gaps: [],
};

// The customer list is private here because the person added it, as the design file has it; the built-in rules do not
// protect a CSV.
const policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv' }] };
const report = buildReport(model, policy, new Redactor('demo'));
// M3: the project's own settings deny `.env.local` - protected now, and read before, so its row carries the status bar.
await writeFile('demo.report-page.html', new ReportPageRenderer().render({ report, withIndexLink: true, denied: ['**/.env.local'], timeZone: 'Europe/Warsaw' }));
console.log('demo.report-page.html written');
