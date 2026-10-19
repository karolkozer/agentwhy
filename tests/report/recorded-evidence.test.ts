// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ContentFingerprints } from '../../src/core/access/content-fingerprints.ts';
import { correlate } from '../../src/core/correlation/correlate.ts';
import { agentSource, mainSource } from '../../src/core/evidence.ts';
import type { Execution } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import type { Policy } from '../../src/core/policy/policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { CallRecord, ResultRecord, SessionRecords } from '../../src/core/session-records.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { actionsOf } from '../../src/report/check/session-actions.ts';
import { fileStory } from '../../src/report/render/report-page/file-story.ts';
import { helperViews } from '../../src/report/render/report-page/helpers.ts';
import { agentRuns } from '../../src/report/render/report-page/record-view.ts';
import { ReportPageRenderer } from '../../src/report/render/report-page/report-page-renderer.ts';
import { toDoItems } from '../../src/report/render/report-page/to-do.ts';
import { buildSessionView } from '../../src/report/render/session-view.ts';
import type { ReportModel } from '../../src/report/report-model.ts';

// `.ai/specs/2026-09-27-what-codex-wrote.md` §4.G, X10, X11, X17, X31, and the acceptance table of its plan: the rules for
// evidence a runtime records about running a call, through `correlate` and `buildReport`, with no adapter in between.
// The values are invented and assembled at run time.
const VALUE = ['orchid', 'Lantern', '4821', 'tide'].join('-');
const ENV = `PROJECT_TOKEN=${VALUE}\nDEBUG=true`;
const MAIN = 'main';
const HELPER = 'helper';

let record = 0;
const at = (agentId = MAIN) => ({ source: agentId === MAIN ? mainSource() : agentSource(agentId), record: (record += 1) });

function shell(id: string, command: string, agentId = MAIN): CallRecord {
  return {
    id, agentId, sequence: record, toolName: 'shell', input: { command }, targets: [], commands: [command],
    resultShape: 'listing', toolKnown: true, evidence: at(agentId),
  };
}

function ran(callId: string, output: string, execution: Execution, agentId = MAIN): ResultRecord {
  return { callId, content: output, stage: 'execution', completeness: 'unknown', execution, evidence: at(agentId) };
}

function records(overrides: Partial<SessionRecords>): SessionRecords {
  return {
    sessionId: MAIN, provider: 'codex', agents: [{ id: MAIN, type: 'main', depth: 0 }], calls: [], results: [], delegations: [], delegationIndex: [],
    messages: [], deliveredReports: [], agentReports: [], workingDirectories: ['/Users/someone/Projects/shop'], followUps: [], followUpIndex: [],
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [], gaps: [], ...overrides,
  };
}

function report(overrides: Partial<SessionRecords>, policy: Policy = DEFAULT_POLICY): ReportModel {
  const model = correlate(records(overrides));
  return buildReport(model, policy, new Redactor('test', model.projectRoot, false), { share: false, projectRoot: model.projectRoot });
}

const seen = (built: ReportModel): number => buildSessionView(built).agents.filter((entry) => entry.saw).length;

test('a failed read with only a missing-file diagnostic reaches nothing, and the attempt stays visible', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', 'cat: .env: No such file or directory\n', { status: 'failed', exitCode: 1 })],
  });

  assert.equal(built.tally.filesReached, 0);
  assert.equal(built.tally.contentsSeen, 0);
  assert.equal(built.tally.unknownAttempts, 1);
  assert.deepEqual(built.stories.map((story) => [story.path, story.outcome]), [['.env', 'unknown']]);
  assert.equal(built.headline.severity, 'attention', 'an attempt with no established outcome is never "nothing happened"');
  assert.ok(built.missing.some((line) => /the record does not show all of this: what an action reached/.test(line)));
  assert.ok(built.gaps.some((gap) => gap.kind === 'capability-absent' && gap.question === 'access'), 'and by kind, for a page to say it');
});

test('exit 0 with an effect no profile establishes confirms no read either', () => {
  const built = report({
    calls: [shell('exec_a', 'python3 read.py .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
  });

  assert.equal(built.tally.filesReached, 0);
  assert.equal(built.tally.unknownAttempts, 1);
});

test('one proven read and one failed target: only the proven file counts, whatever the final exit', () => {
  const built = report({
    calls: [shell('exec_a', 'grep -n PROJECT_TOKEN .env apps/web/.env')],
    // grep exits 2 when one file is missing; the other's numbered hit shows it was read. The diagnostic names a path too.
    results: [ran('exec_a', `.env:1:PROJECT_TOKEN=${VALUE}\ngrep: apps/web/.env: No such file or directory\n`, { status: 'failed', exitCode: 2 })],
  });

  assert.equal(built.tally.filesReached, 1);
  assert.deepEqual(built.stories.map((story) => [story.path, story.outcome]).sort(), [['.env', 'succeeded'], ['apps/web/.env', 'unknown']]);
  assert.equal(built.tally.unknownAttempts, 1);
  // Printed to the process, not handed to the model: the file was read, and nobody is said to have seen its lines.
  assert.equal(built.tally.contentsSeen, 0);
});

test('a call whose files had different outcomes gives each its own step, so the flow agrees with the tally', () => {
  const built = report({
    calls: [shell('exec_a', 'grep -n PROJECT_TOKEN .env apps/web/.env')],
    results: [{
      callId: 'exec_a', content: `.env:1:PROJECT_TOKEN=${VALUE}\ngrep: apps/web/.env: No such file or directory\n`, stage: 'model',
      completeness: 'unknown', execution: { status: 'failed', exitCode: 2 }, evidence: at(),
    }],
  });

  const reached = built.flows.flatMap((flow) => flow.steps).flatMap((step) => (step.kind === 'reached' ? [[step.files, step.outcome]] : []));
  assert.deepEqual(reached, [[['.env'], 'succeeded'], [['apps/web/.env'], 'unknown']]);
  assert.equal(built.tally.filesReached, 1);
  assert.equal(built.tally.contentsSeen, 1, 'the printed lines of the file reached were handed to the model');
  assert.equal(seen(built), built.tally.contentsSeen);
});

test('a value in the recorded output with only a count delivered is kept as found, with no agent said to have seen it', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: 'Script completed\n33', completeness: 'complete', evidence: at() }],
  });

  assert.equal(built.tally.filesReached, 1, 'the read is established');
  assert.deepEqual(built.privateFiles.map((file) => [file.path, file.names.length > 0]), [['.env', true]], 'what the file holds is still read');
  assert.equal(built.tally.contentsSeen, 0, 'no model was handed the value');
  assert.equal(seen(built), built.tally.contentsSeen);
});

test('the same value delivered to the model is seen once, and a later use names the delivery as its source', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: `Script completed\n${ENV}`, completeness: 'complete', evidence: at() }],
    messages: [{ agentId: MAIN, kind: 'said', text: `The token is ${VALUE}.`, completeness: 'complete', evidence: at() }],
  });

  assert.equal(built.tally.contentsSeen, 1);
  assert.equal(seen(built), built.tally.contentsSeen, 'the page and the index say the same');
  assert.deepEqual(built.graph.main.received, ['.env']);
  assert.deepEqual(built.uses.map((use) => [use.landed, use.source]), [['said', 'delivered']]);
  assert.ok(!JSON.stringify(built).includes(VALUE), 'the value itself never enters the report');
});

// Found by looking at the page: the index said the conversation read `.env`, and its report said "only saw a name -
// nothing to do", because every reader but the index went by the steps of calls, and no call returned the value.
test('a value its code handed back is a read on every page that says what was read, and names no call', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: `Script completed\n${ENV}`, completeness: 'complete', evidence: at() }],
  });

  const steps = built.flows.find((flow) => flow.agentIndex === 0)?.steps ?? [];
  assert.deepEqual(steps.map((step) => step.kind), ['reached', 'received']);
  const reached = steps[0];
  assert.ok(reached?.kind === 'reached' && reached.processOutput === true && !reached.carriedValue, 'the command is not said to have shown it');
  assert.deepEqual(actionsOf(built).rotate.map((file) => file.path), ['.env'], 'check, To fix and the to-do list');
  assert.deepEqual(toDoItems(built).map((item) => item.path), ['.env']);
  assert.deepEqual(helperViews(built).map((view) => view.status), ['read']);
  const story = fileStory(built, '.env');
  assert.deepEqual(story.entries.map((entry) => [entry.kind, entry.received === true]), [['named', false], ['read', true]]);
  assert.equal(story.readers, 1);
  assert.equal(story.opened, 1, 'only the command reached the file');

  const tab = agentRuns(built);
  assert.match(tab, /lang="en">Was handed the file’s contents</);
  assert.match(tab, /We see what the command printed, not how much of it reached the AI\./);
  assert.ok(!tab.includes('The contents did not come back'), 'what a process printed is not what the agent was handed (X10)');
});

test('a value only in the recorded output is not a read, and no page says it was', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: 'Script completed\n33', completeness: 'complete', evidence: at() }],
  });

  assert.deepEqual(built.flows[0]?.steps.map((step) => step.kind), ['reached']);
  assert.deepEqual(actionsOf(built).rotate, []);
  assert.deepEqual(toDoItems(built), []);
});

// Found in the maintainer's run: under "Codex doesn't record every step, so we can't say it read nothing private" the
// same screen said of `.env` "It didn't see what is inside, so nothing to do" (X10).
test('a name seen in a record with gaps is never "nothing to do"', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: 'Script completed\n33', completeness: 'complete', evidence: at() }],
    capabilities: [{ question: 'actions', state: 'absent', source: mainSource() }],
  });
  const page = new ReportPageRenderer().render({ report: built, withIndexLink: false });

  assert.match(page, /lang="en">It saw 1 private file name\./);
  assert.match(page, /lang="en">The record doesn’t show whether it saw what is inside\./);
  assert.ok(!page.includes('so nothing to do'), 'the gap card above it says what the record cannot show');
});

// Found 2026-10-05 in a VS Code conversation: the agent found `demo.env` with `rg --files`, and `cat demo.env` was stopped by
// agentwhy's hook. The report said "It saw 1 private file name" and nothing of the stop (CK12, amended: a stop outranks a
// name seen). Beside it, a search of a tracked file for a name it does not hold exited 1 - recorded as failed - and the
// file was "an attempt with no known end": it was opened, and nothing came back.
test('a stop outranks a name seen, and a search that matched nothing opened its file and showed nothing of it', () => {
  const listed = { ...shell('find', "rg --files -g '*.env'"), toolName: 'exec_command' };
  const stopped: CallRecord = { ...shell('stopped', 'cat .env'), toolName: 'Bash', targets: ['.env'] };
  const built = report({
    calls: [listed, stopped, shell('search', 'rg -n Julian .env.local')],
    results: [
      ran('find', '.env\n', { status: 'completed', exitCode: 0 }),
      { callId: 'stopped', content: 'refused', stage: 'model', completeness: 'complete', evidence: at(),
        denial: { kind: 'agentwhy refuse', recognised: true, source: 'rule' } },
      ran('search', '', { status: 'failed', exitCode: 1 }),
    ],
    capabilities: [{ question: 'actions', state: 'absent', source: mainSource() }],
  });
  const page = new ReportPageRenderer().render({ report: built, withIndexLink: false });

  assert.deepEqual([built.tally.refusedAttempts, built.tally.unknownAttempts, built.tally.printedUnseen], [1, 0, undefined],
    'the search ended as documented, and printed nothing anyone could have seen');
  assert.match(page, /lang="en">Your protection worked\./, 'the stop is what the report leads with');
  assert.match(page, /lang="en">All good\.[\s\S]*?lang="en">Nothing to fix\.[\s\S]*?class="hero-lead"><span class="i18n" lang="en">Your protection worked\. Codex doesn’t write down every step/,
    'as the clean page answers a stop, with what Codex does not write down after it (F17 amended 2026-10-05)');
  assert.doesNotMatch(page, /lang="en">The record doesn’t show whether it saw what is inside/, 'every attempt here has a known end');
  assert.match(page, /lang="en">It didn’t see what is inside, so nothing to do\./, 'the file it searched it saw nothing of');
});

// The same across agents: the main agent saw the name, a helper was stopped from opening the file - the file is Stopped.
test('a file one agent saw the name of and another was stopped from is Stopped', () => {
  const listed = { ...shell('find', "rg --files -g '*.env'"), toolName: 'exec_command' };
  const stopped: CallRecord = { ...shell('stopped', 'cat .env', HELPER), toolName: 'Bash', targets: ['.env'] };
  const built = report({
    agents: [{ id: MAIN, type: 'main', depth: 0 }, { id: HELPER, type: 'subagent', depth: 1 }],
    calls: [listed, stopped],
    results: [
      ran('find', '.env\n', { status: 'completed', exitCode: 0 }),
      { callId: 'stopped', content: 'refused', stage: 'model', completeness: 'complete', evidence: at(HELPER),
        denial: { kind: 'agentwhy refuse', recognised: true, source: 'rule' } },
    ],
  });
  const page = new ReportPageRenderer().render({ report: built, withIndexLink: false });
  assert.match(page, /lang="en">Your protection worked\./);
});

// F17 as amended 2026-10-05 by the maintainer: "why is this amber and not green, that all is fine?" - a Codex report said
// "Nothing to fix that we can see" in amber over a record whose only gaps are what Codex never writes down. Where the
// record leaves nothing about a private file not known, and shows one reached or stopped, it is answered as the clean
// page answers ("Claude's looks better", the same day), and what Codex does not write down is said in the lead - as
// the conversation's row says it. Nothing reached, or an attempt at a private file with no known end, or an action left
// unjoined, keeps the question mark.
const TRACKED: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv', mode: 'tell' }] };
const CODEX_GAPS = { capabilities: [{ question: 'actions' as const, state: 'absent' as const, source: mainSource() }] };
const hero = (built: ReportModel): string => {
  const page = new ReportPageRenderer().render({ report: built, withIndexLink: false });
  const start = page.indexOf('<section class="hero');
  return page.slice(start, page.indexOf('</section>', start));
};

test('a Codex record that leaves nothing private not known is "All good.", with what Codex does not write down under it', () => {
  const rows = 'name,city\nAda,Lodz\n';
  const read = report({
    calls: [shell('exec_a', 'cat customers.csv'), shell('exec_b', "awk -F, '{print $2}' customers.csv")],
    results: [ran('exec_a', rows, { status: 'completed', exitCode: 0 }), ran('exec_b', 'city\nLodz\n', { status: 'completed', exitCode: 0 })],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: `Script completed\n${rows}`, completeness: 'complete', evidence: at() }],
    ...CODEX_GAPS,
  }, TRACKED);
  assert.equal(read.tally.unknownAttempts, 1, 'awk ran on the file it had read, with no end the record establishes');
  assert.match(hero(read), /class="hero-tick"[\s\S]*?lang="en">All good\.[\s\S]*?class="hero-action hero-calm"[^>]*><span class="i18n" lang="en">Nothing to fix\.[\s\S]*?class="hero-lead"><span class="i18n" lang="en">Your AI read only private files you let it read in this conversation\. Codex doesn’t write down every step, so this report may not show everything it opened\./,
    'an attempt with no known end at a file already read adds nothing to what is known of it');
  assert.doesNotMatch(hero(read), /hero-unsure|that we can see/);

  const named = report({
    calls: [{ ...shell('find', "rg --files -g '*.env'"), toolName: 'exec_command' }],
    results: [ran('find', '.env\n', { status: 'completed', exitCode: 0 })],
    ...CODEX_GAPS,
  });
  assert.match(hero(named), /lang="en">All good\.[\s\S]*?lang="en">Nothing to fix\.[\s\S]*?lang="en">Your AI didn’t read anything private in this conversation\. Codex doesn’t write down every step/);
  assert.match(hero(named), /lang="pl">Wszystko w porządku\.[\s\S]*?lang="pl">Nie ma nic do naprawy\.[\s\S]*?lang="pl">Twoje AI nie przeczytało w tej rozmowie nic prywatnego\. Codex nie zapisuje każdego kroku/);
});

// F17 as amended 2026-10-10 by the maintainer: a Codex conversation that read one ordinary file said "Couldn't check
// fully" while the same record stopped from a private file said "All good". Where every gap is the format's, nothing
// reached is answered as the clean page answers too, with what Codex does not write down in the lead - as its row says it.
test('a Codex record whose gaps are its format’s alone is "All good." though it reached nothing private', () => {
  const note = 'Note inside DOCS folder.\n';
  const built = report({
    calls: [shell('exec_a', 'cat docs/note.md')],
    results: [{ ...ran('exec_a', note, { status: 'completed', exitCode: 0 }), stage: 'model', completeness: 'complete' }],
    ...CODEX_GAPS,
  });
  assert.deepEqual(built.gapReasons, { format: true });
  assert.match(hero(built), /class="hero-tick"[\s\S]*?lang="en">All good\.[\s\S]*?lang="en">Nothing to fix\.[\s\S]*?lang="en">Your AI didn’t read anything private in this conversation\. Codex doesn’t write down every step, so this report may not show everything it opened\./);
  assert.doesNotMatch(hero(built), /hero-unsure|that we can see/);
});

test('a Codex record keeps the question mark where nothing private was reached, or something about one is not known', () => {
  const amber = (built: ReportModel, why: string): void => {
    assert.match(hero(built), /class="hero-unsure"[\s\S]*?class="hero-action hero-amber"[^>]*><span class="i18n" lang="en">But Codex doesn’t write down every step\./, why);
    assert.doesNotMatch(hero(built), /hero-tick|hero-calm/, why);
  };
  amber(report({
    calls: [shell('exec_a', 'ls src')],
    results: [ran('exec_a', 'app.ts\n', { status: 'completed', exitCode: 0 })],
    ...CODEX_GAPS,
  }), 'nothing private reached, and an output no cell is shown to have carried: a gap of its own, as its row says');
  amber(report({
    calls: [shell('exec_a', 'cat docs/note.md')],
    results: [{ ...ran('exec_a', 'Note inside DOCS folder.\n', { status: 'completed', exitCode: 0 }), stage: 'model', completeness: 'complete' }],
    capabilities: [...CODEX_GAPS.capabilities, { question: 'actions', state: 'unmeasured', source: mainSource() }],
  }), 'nothing private reached, in a file whose own reading left its actions unmeasured - a turn interrupted, say');
  amber(report({
    calls: [shell('exec_a', "awk -F= '{print $1}' .env")],
    results: [ran('exec_a', 'PROJECT_TOKEN\n', { status: 'completed', exitCode: 0 })],
    ...CODEX_GAPS,
  }), 'an attempt at a private file with no known end');
  amber(report({
    calls: [{ ...shell('find', "rg --files -g '*.env'"), toolName: 'exec_command' }],
    results: [ran('find', '.env\n', { status: 'completed', exitCode: 0 })],
    ...CODEX_GAPS,
    gaps: [{ kind: 'relation-unresolved', agentId: MAIN }],
  }), 'a record left unjoined');
});

// The maintainer, 2026-10-11, over the helper conversations of Codex's desktop app, terminal and VS Code panel: their
// rows said "Read - tracked" and their pages "Nothing to fix that we can see" in amber - a helper no item joined, a
// command a cell built while it ran. Read only what the person tracks, the page answers as the row does; an attempt of
// no known end at another private file keeps the question mark.
test('a Codex record that read only tracked files is "All good." as its row says, whatever else it leaves open', () => {
  const rows = 'name,city\nAda,Lodz\n';
  const helperGaps = {
    capabilities: [...CODEX_GAPS.capabilities, { question: 'actions' as const, state: 'unmeasured' as const, source: mainSource() }],
    gaps: [{ kind: 'relation-unresolved' as const, agentId: MAIN }],
  };
  const read = (more: Partial<SessionRecords> = {}) => report({
    calls: [shell('exec_a', 'cat customers.csv'), ...(more.calls ?? [])],
    results: [ran('exec_a', rows, { status: 'completed', exitCode: 0 }), ...(more.results ?? [])],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: `Script completed\n${rows}`, completeness: 'complete', evidence: at() }],
    ...helperGaps,
  }, TRACKED);
  assert.match(hero(read()), /class="hero-tick"[\s\S]*?lang="en">All good\.[\s\S]*?lang="en">Nothing to fix\.[\s\S]*?lang="en">Your AI read only private files you let it read in this conversation\. Codex doesn’t write down every step, so this report may not show everything it opened\./);
  assert.match(hero(read()), /lang="pl">Wszystko w porządku\./);

  const unsure = read({ calls: [shell('exec_b', "awk -F= '{print $1}' .env")], results: [ran('exec_b', 'PROJECT_TOKEN\n', { status: 'completed', exitCode: 0 })] });
  assert.match(hero(unsure), /class="hero-unsure"[\s\S]*?But Codex doesn’t write down every step\./, 'another private file with no known end');
  // Another tracked file's text printed and no agent shown to have received it (X14): not known to have reached the AI.
  const both: Policy = { ...TRACKED, protected: [...TRACKED.protected, { pattern: '**/orders.csv', mode: 'tell' }] };
  // Plain words, so no value is traced out of either: X14 counts a print to nobody only where none was seen.
  const prose = 'plain words about the launch plan for spring\n';
  const unseen = report({
    calls: [shell('exec_a', 'cat customers.csv'), shell('exec_b', 'cat orders.csv')],
    results: [
      { ...ran('exec_a', prose, { status: 'completed', exitCode: 0 }), stage: 'model', completeness: 'complete' },
      ran('exec_b', 'more plain words about the autumn plan\n', { status: 'completed', exitCode: 0 }),
    ],
    ...helperGaps,
  }, both);
  assert.deepEqual([unseen.tally.filesRead, unseen.tally.printedUnseen], [1, 1], 'one handed to the AI, one printed to nobody');
  assert.match(hero(unseen), /class="hero-unsure"/, 'printed to nobody the record shows');
});

// XD4, amended 2026-10-05: an older record's commands are read from the code it ran, so its words no longer say they
// are not recorded at all - only what each one did.
test('an older Codex record says its commands were read from the code it ran', () => {
  const built = report({
    calls: [shell('exec_a', 'ls src')],
    results: [ran('exec_a', 'app.ts\n', { status: 'completed', exitCode: 0 })],
    capabilities: [{ question: 'access', state: 'absent', source: mainSource() }],
  });
  assert.match(hero(built), /lang="en">But Codex didn’t record what its commands did\.[\s\S]*?lang="en">Codex saved this conversation in an older way: it keeps the code it ran, not what each command did\. We read the commands from that code\. Here’s what it shows\./);
});

test('a value only in a follow-up is handed to that helper once, and never counts a second helper', () => {
  const spawn: CallRecord = { ...shell('call_spawn', ''), toolName: 'spawn_agent', commands: [], input: { task_name: 'check' }, resultShape: 'none' };
  const built = report({
    agents: [{ id: MAIN, type: 'main', depth: 0 }, { id: HELPER, type: 'subagent', depth: 1 }],
    calls: [shell('exec_a', 'cat .env'), spawn],
    results: [
      ran('exec_a', ENV, { status: 'completed', exitCode: 0 }),
      { callId: 'call_spawn', content: 'started', launchNotice: true, stage: 'model', completeness: 'complete', evidence: at() },
    ],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: ENV, completeness: 'complete', evidence: at() }],
    delegations: [{ callId: 'call_spawn', parentAgentId: MAIN, prompt: 'Look at the settings.', description: 'check', evidence: spawn.evidence }],
    delegationIndex: [{ callId: 'call_spawn', agentId: HELPER, depth: 1, recordedParentAgentId: MAIN }],
    followUps: [{ callId: 'call_more', senderAgentId: MAIN, text: `Use ${VALUE} to sign in.`, evidence: at() }],
    followUpIndex: [{ callId: 'call_more', agentId: HELPER }],
  });

  assert.equal(built.delegations.length, 1, 'one helper, one row');
  assert.deepEqual(built.uses.map((use) => [use.agentIndex, use.landed]), [[0, 'delegation']]);
  assert.ok(!JSON.stringify(built).includes(VALUE));
});

test('a value only in a final message is found for the main agent; user text with it is not the agent writing it', () => {
  const built = report({
    calls: [shell('exec_a', 'cat .env')],
    results: [ran('exec_a', ENV, { status: 'completed', exitCode: 0 })],
    contexts: [{ kind: 'conversation', author: 'person', agentId: MAIN, text: `Is ${VALUE} right?`, completeness: 'complete', evidence: at() }],
    messages: [{ agentId: MAIN, kind: 'said', text: `Yes, ${VALUE}.`, channel: 'final', completeness: 'complete', evidence: at() }],
  });

  assert.deepEqual(built.uses.map((use) => [use.landed, use.source]), [['said', 'none']], 'one use: the agent\'s own words');
  assert.equal(built.tally.wroteInMessages, 1);
  assert.ok(!JSON.stringify(built).includes(VALUE));
});

// X19-X23: what the runtime recorded crosses the boundary as settings, indexes, sizes and counts - never its free text -
// and beside the evaluation policy, which it never changes.
test('recorded permissions, reviews, later words and capabilities reach the report redacted and apart from the policy', () => {
  const permissions = (write: string) => ({
    approval: 'never', approver: 'person' as const, sandbox: 'workspace-write', network: 'restricted' as const, complete: true,
    scopes: [{ access: 'read' as const, target: { kind: 'special' as const } }, { access: 'write' as const, target: { kind: 'path' as const, path: write } }],
  });
  const reviewer = { source: { kind: 'review' as const, reviewId: 'r1' }, record: 2 };
  const spawn: CallRecord = { ...shell('call_spawn', ''), toolName: 'spawn_agent', commands: [], input: {}, resultShape: 'none' };
  const overrides: Partial<SessionRecords> = {
    agents: [{ id: MAIN, type: 'main', depth: 0 }, { id: HELPER, type: 'subagent', depth: 1 }],
    calls: [shell('exec_a', 'cat .env'), spawn],
    results: [
      ran('exec_a', ENV, { status: 'completed', exitCode: 0 }),
      { callId: 'call_spawn', content: 'started', launchNotice: true, stage: 'model', completeness: 'complete', evidence: at() },
    ],
    delegations: [{ callId: 'call_spawn', parentAgentId: MAIN, prompt: 'Look.', evidence: spawn.evidence }],
    delegationIndex: [{ callId: 'call_spawn', agentId: HELPER }],
    followUps: [{ callId: 'call_more', senderAgentId: MAIN, text: `Use ${VALUE} now.`, evidence: at() }],
    followUpIndex: [{ callId: 'call_more', agentId: HELPER }],
    turns: [
      { id: 't1', agentId: MAIN, permissions: permissions('/Users/someone/Projects/shop'), evidence: at() },
      { id: 't2', agentId: MAIN, permissions: permissions('/Users/someone/Projects/shop'), evidence: at() },
      { id: 't1', agentId: HELPER, permissions: permissions('/Users/someone/elsewhere'), evidence: at(HELPER) },
    ],
    reviews: [{
      id: 'r1', reviewedAgentId: MAIN, evidence: reviewer,
      verdicts: [
        { outcome: 'allowed', turnId: 't1', risk: 'low', rationale: `Reading ${VALUE} is fine.`, evidence: reviewer },
        { outcome: 'unrecognised', evidence: { ...reviewer, record: 3 } },
      ],
    }],
    deliveries: [{ recipientAgentId: MAIN, status: 'confirmed', text: 'Script completed', completeness: 'complete', evidence: at() }],
    contexts: [{ kind: 'code', author: 'agent', agentId: MAIN, text: 'await tools.exec_command()', completeness: 'complete', evidence: at() }],
    capabilities: [
      { question: 'actions', state: 'absent', source: mainSource(), agentId: MAIN },
      { question: 'actions', state: 'absent', source: agentSource(HELPER), agentId: HELPER },
      { question: 'own-words', state: 'supported', source: mainSource(), agentId: MAIN },
    ],
  };
  const full = report(overrides);
  const { recorded } = full;

  assert.deepEqual(recorded.permissions.map((each) => [each.turns, each.agentIndexes, each.approval, each.sandbox, each.readScopes, each.writeScopes, each.writablePaths]), [
    [2, [0], 'never', 'workspace-write', 1, 1, ['.']],
    [1, [1], 'never', 'workspace-write', 1, 1, ['/Users/someone/elsewhere']],
  ]);
  assert.deepEqual(recorded.reviews, [{
    reviewedAgentIndex: 0,
    verdicts: [
      { outcome: 'allowed', turnKnown: true, risk: 'low', rationaleSize: `Reading ${VALUE} is fine.`.length, evidence: 'review 1 record 2' },
      { outcome: 'unrecognised', turnKnown: false, evidence: 'review 1 record 3' },
    ],
  }]);
  assert.deepEqual(full.delegations[0]?.laterInstructions.map((each) => each.size), [`Use ${VALUE} now.`.length]);
  assert.deepEqual(recorded.capabilities, [
    { question: 'actions', state: 'absent', sources: 2 }, { question: 'own-words', state: 'supported', sources: 1 },
  ]);
  assert.equal(recorded.deliveries, 1);
  assert.deepEqual(recorded.contexts, { code: 1, conversation: 0, 'unjoined-instruction': 0, 'orphan-output': 0 });
  // X21, X22: the policy the report was evaluated by is its own, whatever was recorded then.
  assert.match(full.scope.policy.origin, /BUILT-IN DEFAULT/);
  assert.equal(full.tally.filesReached, report({ ...overrides, turns: [] }).tally.filesReached, 'recorded permissions decide nothing');
  assert.ok(!JSON.stringify(full).includes(VALUE), 'no free text of a reviewer or an instruction is quoted');

  // Shared, a path outside the project is a category, as every other path is.
  const model = correlate(records(overrides));
  const shared = buildReport(model, DEFAULT_POLICY, new Redactor('test', model.projectRoot, true), { share: true, projectRoot: model.projectRoot });
  assert.deepEqual(shared.recorded.permissions.map((each) => each.writablePaths), [['.'], ['outside the project']]);
});

// XD12 and the Files tab, decided by the maintainer 2026-10-10 ("XD12 i … Not known … zrob"): a Codex panel cell ran
// `if [ -f docs/note.md ]; then cat docs/note.md; else rg --files docs | rg …; fi` and returned `.output` alone, so which
// branch ran is not recorded. Neither could reach a private file, so the row has nothing to say of it - but whether
// `docs/note.md` was read is not known either, and the Files tab said in mint that nothing was opened.
const BRANCHES = "if [ -f docs/note.md ]; then cat docs/note.md; else rg --files docs | rg '(^|/)note\\.md$'; fi";
const handed = (callId: string, content: string): ResultRecord =>
  ({ callId, content, stage: 'model', completeness: 'complete', execution: { status: 'completed' }, evidence: at() });

test('XD12: a command of no known end that could reach nothing protected leaves the row nothing to say', () => {
  const built = report({ calls: [shell('cell', BRANCHES)], results: [handed('cell', 'Note inside DOCS folder.\n')], ...CODEX_GAPS });
  assert.equal(built.tally.unknownAttempts, 0);
  assert.deepEqual(built.gapReasons, { format: true }, 'its gap stays in the record, and is no reason the row gives');
  assert.ok(built.gaps.some((gap) => gap.kind === 'capability-absent' && gap.question === 'access'), 'the record still says what it does not show');
  assert.match(hero(built), /lang="en">All good\.[\s\S]*?lang="en">Your AI didn’t read anything private in this conversation\./);

  // Each thing that could reach more keeps the reason: a script, a folder's files searched, a listing not read whole.
  const unread = (command: string, result: ResultRecord): ReportModel['gapReasons'] =>
    report({ calls: [shell('cell', command)], results: [result], ...CODEX_GAPS }).gapReasons;
  // `2026-10-13-each-command-its-own-result.md` EC4: and where every such command ran code, the row says which.
  assert.deepEqual(unread('python3 show.py', handed('cell', 'done\n')), { unread: 1, unreadCode: ['python'] });
  assert.deepEqual(unread('rg TOKEN docs', handed('cell', '')), { unread: 1 });
  assert.deepEqual(unread('ls -a docs', { ...handed('cell', 'note.md\n'), stage: 'execution', completeness: 'unknown' }), { unread: 1, unsure: 1 });
});

// `2026-10-13-each-command-its-own-result.md` EC4: the row names the code only where every command it counts ran code -
// a row that also searched a folder says what it said, since the search is a reason the code is not.
test('EC4: the languages are the row’s only where every command it counts ran code', () => {
  const reasons = (...lines: string[]): ReportModel['gapReasons'] => report({
    calls: lines.map((line, at) => shell(`cell${at}`, line)), results: lines.map((_, at) => handed(`cell${at}`, 'done\n')), ...CODEX_GAPS,
  }).gapReasons;
  assert.deepEqual(reasons("node -e 'x'", 'python3 a.py', 'cat docs/note.md'), { unread: 2, unreadCode: ['python', 'node'] }, 'the cat is XD12\'s, and no reason');
  assert.deepEqual(reasons('python3 a.py', 'rg TOKEN docs'), { unread: 2 });
  assert.deepEqual(reasons('python3 a.py && git status'), { unread: 1 });
});

// `2026-10-13-a-printing-sed-reaches-its-file.md` PSB1: the maintainer's two Codex conversations of 2026-10-13 read
// `src/index.ts` and `src/utils/greet.ts` with two `sed`s on one line - the terminal's with `&&` and exit 0, the VS Code
// panel's with `;` and no exit - and both rows said "1 command ran, and the record doesn't say what it reached".
test('PS1: two seds that only print lines of the files they name leave the row nothing to say', () => {
  const printed = 'export const greet = () => "hi";\n';
  for (const [why, command, result] of [
    ['the terminal: `&&`, exit 0', "sed -n '1,200p' src/index.ts && sed -n '1,200p' src/utils/greet.ts", { ...handed('cell', printed), execution: { status: 'completed', exitCode: 0 } }],
    ['the panel: `;`, no exit', "sed -n '1,200p' src/index.ts; sed -n '1,200p' src/utils/greet.ts", handed('cell', printed)],
    ['a numbered read', "nl -ba src/index.ts | sed -n '1,120p'", handed('cell', `     1\t${printed}`)],
  ] as const) {
    const built = report({ calls: [shell('cell', command)], results: [result], ...CODEX_GAPS });
    assert.deepEqual(built.gapReasons, { format: true }, why);
    assert.ok(built.gaps.some((gap) => gap.kind === 'capability-absent' && gap.question === 'access'), `${why}: the record still says what it does not show`);
  }
  // A script that may open another file keeps the reason.
  const other = report({ calls: [shell('cell', "sed '1r other.txt' src/index.ts")], results: [handed('cell', printed)], ...CODEX_GAPS });
  assert.deepEqual(other.gapReasons, { unread: 1 });
});

// `2026-10-11-a-listing-reads-no-file.md` LN1, LNB1: the maintainer's retest of 2026-10-11 - Codex listed a blocked folder
// with `rg --files` and `find -print` (its panel recorded no exit, its desktop app `ls` of a missing folder as failed) and
// was stopped reading it; the row said "Couldn't check fully", the window "We can't tell whether your AI opened a file".
// A listing held whole read no file: what is left is the stop and the names.
test('LN1: a listing of a blocked folder with no known end read no file, and leaves the stop to be said', () => {
  const blocked: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/lessons/blocked/**' }] };
  const listed = 'lessons/blocked/a/exercise.py\nlessons/blocked/a/teoria.md\n';
  const refusal = 'agentwhy refused this command: lessons/blocked/*/teoria.md expands to lessons/blocked/a/teoria.md, which this project\'s policy protects (**/lessons/blocked/**).';
  const built = (result: ResultRecord) => report({
    calls: [shell('list', 'rg --files lessons/blocked; find lessons/blocked -maxdepth 2 -type f -print'), shell('read', 'rg -n "^#" lessons/blocked/*/teoria.md')],
    results: [result, { callId: 'read', content: refusal, stage: 'model', completeness: 'complete', evidence: at(), denial: { kind: 'hook', recognised: true, source: 'rule' } }],
    ...CODEX_GAPS,
  }, blocked);
  for (const [why, result] of [
    ['the panel: completed, no exit', handed('list', listed)],
    ['the desktop app: failed', { ...handed('list', 'ls: lessons/blocked: No such file or directory\n'), execution: { status: 'failed', exitCode: 1 } }],
  ] as const) {
    const one = built(result);
    assert.equal(one.tally.unknownAttempts, 0, why);
    assert.equal(one.tally.refusedAttempts, 1, why);
    assert.ok(!one.findings.some((finding) => finding.outcome === 'unknown'), why);
  }
  // Not held whole, a listing may hide a name, and keeps its question (XD12).
  const partial = built({ ...handed('list', listed), completeness: 'partial' });
  assert.ok(partial.findings.some((finding) => finding.outcome === 'unknown'));
});

test('the Files tab says it cannot tell where a file’s command has no known end, never that nothing was opened', () => {
  const built = report({ calls: [shell('cell', BRANCHES)], results: [handed('cell', 'Note inside DOCS folder.\n')], ...CODEX_GAPS });
  assert.deepEqual(built.everydayFiles.map((file) => [file.path, file.how]), [['docs/note.md', 'unknown']]);
  const page = new ReportPageRenderer().render({ report: built, withIndexLink: false });
  const files = page.slice(page.indexOf('<div class="fl'));
  assert.match(files, /class="hero-unsure"[\s\S]*?lang="en">We can’t tell whether your AI opened a file\.[\s\S]*?class="hero-action hero-amber"[^>]*><span class="i18n" lang="en">The record doesn’t say what happened to 1 file\./);
  assert.match(files, /lang="pl">Nie wiadomo, czy Twoje AI otworzyło jakiś plik\./);
  assert.match(files, /lang="en">Not recorded</);
  assert.doesNotMatch(files, /didn’t open any file|lang="en">Name only</);
  assert.match(page, /lang="en">Your AI tried to open this file, and the record doesn’t say what happened\./, 'its window says the same');

  // A file the same command only named, where its end is known, keeps its name only.
  const listed = report({ calls: [shell('cell', 'ls docs')], results: [handed('cell', 'note.md\n')], ...CODEX_GAPS });
  assert.deepEqual(listed.everydayFiles.map((file) => file.how), ['named']);
});

// 2026-10-10: `find … -name plan_nauki.md` named the file by its bare word and printed it back by its whole path - one
// file, which the counts made two: "Your AI only saw the names of 2 of them" over a conversation with one.
test('a file named by its word and printed back by its whole path is one file in every count', () => {
  const place: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '/Users/someone/Projects/shop/plan_nauki.md', everywhere: true }] };
  const built = report({
    calls: [{ ...shell('find', 'find "/Users/someone/Projects/shop" -iname "plan_nauki.md"'), toolName: 'Bash', workingDirectory: '/Users/someone/Projects/shop' }],
    // Claude Code's shape: a result with no process record, which establishes the call's own outcome.
    results: [{ callId: 'find', content: '/Users/someone/Projects/shop/plan_nauki.md\n', stage: 'model', completeness: 'complete', evidence: at() }],
  }, place);
  assert.deepEqual(new Set(built.findings.map((finding) => finding.source)), new Set(['input', 'result']), 'named by its word, and printed back');
  assert.equal(built.tally.filesReached, 1);
  assert.equal(built.graph.main.filesReached, 1);
});

// `2026-10-09-the-file-not-its-name.md` FN16-FN17 as amended 2026-10-11, found on the maintainer's round of that day: in
// all six places - three Claude Code, three Codex - `cd <lesson> && for f in $(find . -type f); do echo "=== $f"; cat
// "$f"; done` read a tracked `exercise.py`, and every report said nothing private was read: the names stood behind the
// loop's own `=== `, in the folder of a relative `cd`. Claude Code records where the line ran before its `cd` or after it
// (FNB21); a Codex cell of a known exit leaves the loop's own end unknown (X11), and what it printed says the read.
const LESSON_LOOP = 'cd lessons/01 && for f in $(find . -type f); do echo "=== $f"; cat "$f"; done';
const LESSON_PRINTED = '=== ./teoria.md\n# notes\n=== ./exercise.py\nx = 1\n';
const LESSON_TRACKED: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/lessons/01/exercise.py', mode: 'tell' }] };
const handedWhole = (callId: string, content: string): ResultRecord => ({ callId, content, stage: 'model', completeness: 'complete', evidence: at() });

test('FN17: a loop that printed each file under its own echo, after a relative cd, read them - in the folder it moved to', () => {
  const root = '/Users/someone/Projects/course';
  for (const ranIn of [root, root + '/lessons/01']) {
    const built = report({
      provider: 'claude-code', workingDirectories: [root],
      calls: [{ ...shell('b1', LESSON_LOOP), toolName: 'Bash', workingDirectory: ranIn }],
      results: [handedWhole('b1', LESSON_PRINTED)],
    }, LESSON_TRACKED);
    assert.deepEqual(fileStory(built, 'lessons/01/exercise.py').entries.map((entry) => entry.kind), ['read'], ranIn);
    assert.equal(built.tally.filesRead, 1, ranIn);
    assert.deepEqual(actionsOf(built).told, ['lessons/01/exercise.py'], ranIn);
    assert.deepEqual(built.everydayFiles.filter((file) => file.how === 'read').map((file) => file.path), ['lessons/01/teoria.md'], ranIn);
    assert.equal(built.gapReasons, undefined, ranIn);
  }

  const codex = report({
    calls: [{ ...shell('exec_a', LESSON_LOOP), workingDirectory: '/Users/someone/Projects/shop' }],
    results: [{ ...ran('exec_a', LESSON_PRINTED, { status: 'completed', exitCode: 0 }), stage: 'model', completeness: 'complete' }],
    ...CODEX_GAPS,
  }, LESSON_TRACKED);
  assert.deepEqual(fileStory(codex, 'lessons/01/exercise.py').entries.map((entry) => entry.kind), ['read']);
  assert.deepEqual(fileStory(codex, 'lessons/01/teoria.md').entries.map((entry) => entry.kind), ['read'], 'its story says the read its row does, never "Tried to open it"');

  // The VS Code panel: the cell returned the lines escaped in a result object, and the adapter carries them decoded (XD11).
  const wrapped = JSON.stringify({ chunk_id: 'aed82c', wall_time_seconds: 0.1, exit_code: 0, original_token_count: 9, output: LESSON_PRINTED });
  const panel = report({
    calls: [{ ...shell('exec_a', LESSON_LOOP), workingDirectory: '/Users/someone/Projects/shop' }],
    results: [{ ...handedWhole('exec_a', wrapped), printedText: LESSON_PRINTED }],
    ...CODEX_GAPS,
  }, LESSON_TRACKED);
  assert.deepEqual(fileStory(panel, 'lessons/01/exercise.py').entries.map((entry) => entry.kind), ['read']);
});

// FN17 as amended 2026-10-11: a loop that printed what it listed with no name beside it - no `echo` - read files the record
// does not name. Neither "Nothing private" nor, in mint, "Your AI didn't open any file": the row and the Files tab say why
// they cannot tell.
test('FN17: a loop that printed what it listed and named none of it is a read the record does not establish', () => {
  const built = report({
    provider: 'claude-code',
    calls: [{ ...shell('b1', 'cd lessons/01 && for f in $(find . -type f); do cat "$f"; done'), toolName: 'Bash' }],
    results: [handedWhole('b1', '# notes\nx = 1\n')],
  }, LESSON_TRACKED);
  assert.deepEqual(built.gapReasons, { unread: 1 });
  const page = new ReportPageRenderer().render({ report: built, withIndexLink: false });
  const files = page.slice(page.indexOf('<div class="fl'));
  assert.match(files, /class="hero-unsure"[\s\S]*?lang="en">We can’t tell whether your AI opened a file\.[\s\S]*?class="hero-action hero-amber"[^>]*><span class="i18n" lang="en">The record doesn’t say what 1 command reached\./);
  assert.match(files, /lang="pl">Zapis nie mówi, po co sięgnęło 1 polecenie\./);
  assert.match(files, /lang="de">Das Protokoll sagt nicht, was 1 Befehl erreicht hat\./);
  assert.doesNotMatch(files, /didn’t open any file/);
  assert.doesNotMatch(hero(built), /All good/);
});

// FN17 as amended 2026-10-11, the second round of that day: the same question, three more shapes - each read, each said.
test('FN17: a loop over a glob, a script xargs hands each name, and a Codex `for file do` read what they printed', () => {
  const root = '/Users/someone/Projects/course';
  const claude = (command: string, printed: string) => report({
    provider: 'claude-code', workingDirectories: [root],
    calls: [{ ...shell('b1', command), toolName: 'Bash', workingDirectory: root }],
    results: [handedWhole('b1', printed)],
  }, LESSON_TRACKED);
  for (const built of [
    claude(`cd "${root}" && for f in lessons/01/*; do echo "===== $f ====="; cat "$f"; echo; done`, '===== lessons/01/exercise.py =====\nx = 1\n\n===== lessons/01/teoria.md =====\n# notes\n'),
    claude(`cd "${root}/lessons/01" && for f in *; do echo "=== $f ==="; cat "$f"; done`, '=== exercise.py ===\nx = 1\n=== teoria.md ===\n# notes\n'),
    claude(`cd "${root}/lessons/01" && find . -type f -print0 | sort -z | xargs -0 -I{} sh -c 'printf "\\n===== %s =====\\n" "{}"; cat "{}"'`, '\n===== ./exercise.py =====\nx = 1\n\n===== ./teoria.md =====\n# notes\n'),
  ]) {
    assert.deepEqual(fileStory(built, 'lessons/01/exercise.py').entries.map((entry) => entry.kind), ['read']);
    assert.deepEqual(built.everydayFiles.filter((file) => file.how === 'read').map((file) => file.path), ['lessons/01/teoria.md']);
  }
  const codex = report({
    calls: [{ ...shell('exec_a', `find lessons/01 -type f -exec sh -c 'for file do printf "\\n===== %s =====\\n" "$file"; cat "$file"; done' sh {} +`), workingDirectory: '/Users/someone/Projects/shop' }],
    results: [{ ...ran('exec_a', '\n===== lessons/01/teoria.md =====\n# notes\n\n===== lessons/01/exercise.py =====\nx = 1\n', { status: 'completed', exitCode: 0 }), stage: 'model', completeness: 'complete' }],
    ...CODEX_GAPS,
  }, LESSON_TRACKED);
  assert.deepEqual(fileStory(codex, 'lessons/01/exercise.py').entries.map((entry) => entry.kind), ['read']);
});

// FNB44, found 2026-10-11 on the VS Code panel: Codex listed with `rg --files | rg …` and then printed the tracked lesson,
// and the row said "Read 8 private files · Not yet" - a blocked folder's files read, which nothing opened. Every panel
// cell opens with Codex's own `Script completed`; read as a line of the tracked file, it was found again in the listing's
// cell, and a step that carried a value had every file it named read. A file's values come from what its command printed,
// and a carried value reads the file it came from.
test('FNB44: Codex\'s own header is no value of a file, and a carried value reads only the file it came from', () => {
  const header = (printed: string) => `Script completed\nWall time 0.1 seconds\nOutput:\n\n${printed}`;
  const listed = 'lessons/01/exercise.py\nlessons/03/exercise.py\n';
  const printed = '# A lesson about lists\ncolors = ["red", "green"]\n';
  const policy: Policy = { ...LESSON_TRACKED, protected: [...LESSON_TRACKED.protected, { pattern: '**/lessons/03/**' }] };
  const built = report({
    calls: [shell('exec_a', "rg --files | rg 'lessons'"), shell('exec_b', 'cat lessons/01/exercise.py')],
    results: [
      { ...handedWhole('exec_a', header(listed)), execution: { status: 'completed', printed: listed } },
      { ...handedWhole('exec_b', header(printed)), execution: { status: 'completed', printed } },
    ],
    ...CODEX_GAPS,
  }, policy);
  assert.deepEqual(actionsOf(built).read ?? [], [], 'no blocked file was read');
  assert.deepEqual(fileStory(built, 'lessons/03/exercise.py').entries.map((entry) => entry.kind), ['named']);
  assert.deepEqual(fileStory(built, 'lessons/01/exercise.py').entries.map((entry) => entry.kind), ['named', 'read']);
});

// `2026-10-11-the-file-by-its-text.md` CT1, CT5, found by CTB1 on the maintainer's test projects: a tracked lesson printed
// by `cat teoria.md exercise.py` beside a `wc -l *` said "Only saw a name", and the file's own lines were in the output.
// Known by its text, the file was read, whatever the command; a read the command establishes stands without the text;
// another lesson's file made from the same template reads no line of this one.
const COURSE = '/Users/someone/Projects/course';
const TRACKED_LINES = ['colors = ["purple", "teal", "amber", "coral"]', 'print("Last colour in the list:", colors[-1])'];
const TEMPLATE_LINE = 'TEMPLATE: write each answer below its task';
const courseText = (): ContentFingerprints => ContentFingerprints.of([
  { path: `${COURSE}/lessons/01/exercise.py`, lines: [TEMPLATE_LINE, ...TRACKED_LINES], private: true },
  { path: `${COURSE}/lessons/02/exercise.py`, lines: [TEMPLATE_LINE, 'numbers = [4, 8, 15, 16, 23, 42] # the slicing lesson'], private: false },
], 'test');
const readByText = (command: string, printed: string, fingerprints?: ContentFingerprints): ReportModel => {
  const model = correlate(records({
    provider: 'claude-code', workingDirectories: [COURSE],
    calls: [{ ...shell('b1', command), toolName: 'Bash', workingDirectory: COURSE }],
    results: [handedWhole('b1', printed)],
  }));
  return buildReport(model, LESSON_TRACKED, new Redactor('test', model.projectRoot, false),
    { share: false, projectRoot: model.projectRoot, ...(fingerprints === undefined ? {} : { fingerprints }) });
};
const storyOf = (built: ReportModel) => fileStory(built, 'lessons/01/exercise.py').entries.map((entry) => entry.kind);

test('CT1: a private file whose own lines a call showed was read, whatever the command', () => {
  const beside = `cd "${COURSE}/lessons/01"; wc -l *; cat teoria.md exercise.py`;
  const printed = `  12 teoria.md\n   3 exercise.py\n# notes\n${TEMPLATE_LINE}\n${TRACKED_LINES.join('\n')}\n`;
  assert.deepEqual(storyOf(readByText(beside, printed)), ['named'], 'read from its command alone, a name');
  assert.deepEqual(storyOf(readByText(beside, printed, courseText())), ['read'], 'known by its text, a read');
  assert.deepEqual(readByText(beside, printed, courseText()).findings.filter((finding) => String(finding.path).endsWith('exercise.py')).map((finding) => finding.source),
    ['input'], 'the access the call named is the read, never a second one beside it');
  assert.equal(readByText(beside, printed, courseText()).tally.filesRead, 1);
  // L018: Step by step asks the story's question, so it says read too (found 2026-10-19, where it said a name).
  const stepHows = (built: ReportModel): string[] => (built.runs ?? []).flatMap((agent) => agent.runs.flatMap((run) =>
    run.steps.flatMap((step) => step.files.filter((file) => file.private === true).map((file) => file.how))));
  assert.deepEqual(stepHows(readByText(beside, printed, courseText())), ['read']);

  // A loop the reader does not know names the file by its text: the access is the output's.
  const unnamed = readByText('for f in $(git ls-files lessons); do cat "$f"; done', `${TRACKED_LINES.join('\n')}\n`, courseText());
  assert.deepEqual(storyOf(unnamed), ['read']);
  assert.deepEqual(actionsOf(unnamed).told, ['lessons/01/exercise.py']);

  // Another lesson, made from the same template: its lines are no line of this one.
  assert.deepEqual(storyOf(readByText('cat lessons/02/exercise.py', `${TEMPLATE_LINE}\nnumbers = [4, 8, 15, 16, 23, 42] # the slicing lesson\n`, courseText())), []);
});

// CT9, CTB4: the VS Code panel's cell of 16:39 built its commands while it ran and returned the lesson whole inside JSON
// parts. Its text, read through, is carried beside the cell itself where none of its commands could be read, and beside
// its first command where they could: either way the lesson's own lines in it are a read, and nothing else is.
test('CT9: a private file\'s lines in what a Codex cell returned are a read by that cell', () => {
  const cellOf = (call: CallRecord, cellText: string): ReportModel => {
    const model = correlate(records({
      workingDirectories: [COURSE], calls: [{ ...call, workingDirectory: COURSE }],
      results: [{ callId: call.id, stage: 'model', completeness: 'complete', evidence: at(), cellText }],
    }));
    return buildReport(model, LESSON_TRACKED, new Redactor('test', model.projectRoot, false),
      { share: false, projectRoot: model.projectRoot, fingerprints: courseText() });
  };
  const lesson = `${TEMPLATE_LINE}\n${TRACKED_LINES.join('\n')}\n`;
  const own: CallRecord = { ...shell('call_b:cell', ''), toolName: 'exec', input: {}, commands: [], resultShape: 'none' };
  assert.deepEqual(storyOf(cellOf(own, `Script completed\n${lesson}`)), ['read'], 'a cell no command of which could be read');
  assert.deepEqual(storyOf(cellOf(shell('call_a:command:1', 'ls lessons/01'), lesson)), ['read'], 'beside its first command');
  assert.deepEqual(storyOf(cellOf(own, `Script completed\n${TEMPLATE_LINE}\n`)), [], 'a template\'s line is no lesson\'s');
  assert.equal(cellOf(own, lesson).tally.filesRead, 1);
});

test('CT5: a read the command establishes stands where the text is not found', () => {
  const transformed = readByText('cat lessons/01/exercise.py', 'a file changed since, or printed another way\n', courseText());
  assert.deepEqual(storyOf(transformed), ['read']);
  const refused = correlate(records({
    provider: 'claude-code', workingDirectories: [COURSE],
    calls: [{ ...shell('b1', 'cat lessons/01/exercise.py'), toolName: 'Bash', workingDirectory: COURSE }],
    results: [{ ...handedWhole('b1', TRACKED_LINES.join('\n')), denial: { kind: 'hook', recognised: true, source: 'rule' } as never }],
  }));
  const built = buildReport(refused, LESSON_TRACKED, new Redactor('test', refused.projectRoot, false), { share: false, projectRoot: refused.projectRoot, fingerprints: courseText() });
  assert.deepEqual(built.findings.map((finding) => finding.outcome), ['blocked'], 'a refused call read nothing, whatever its result quotes');
});

// `2026-10-12-a-read-outside-the-project.md` RXB2: the computer's Track of a file and another project's block of it are
// both written as its whole path. The block holds (RW4), and the read is one to act on, never one the person allowed.
test('a pattern another project blocks is no told file, though the computer tracks the same text', () => {
  const note = '/Users/someone/Projects/lessons/note.md';
  const policy: Policy = {
    ...DEFAULT_POLICY,
    protected: [{ pattern: note, mode: 'tell' }, ...DEFAULT_POLICY.protected, { pattern: note, project: '/Users/someone/Projects/lessons' }],
  };
  const built = report({
    calls: [shell('exec_a', `cat '${note}'`)],
    results: [{ ...ran('exec_a', 'This is a note.\n', { status: 'completed', exitCode: 0 }), stage: 'model', completeness: 'complete' }],
  }, policy);

  assert.deepEqual(built.findings.map((finding) => [finding.path, finding.told === true]), [[note, false]]);
  assert.deepEqual(actionsOf(built).told ?? [], []);
  // Tracked alone, it is told, as before.
  const tracked = report({
    calls: [shell('exec_b', `cat '${note}'`)],
    results: [{ ...ran('exec_b', 'This is a note.\n', { status: 'completed', exitCode: 0 }), stage: 'model', completeness: 'complete' }],
  }, { ...DEFAULT_POLICY, protected: [{ pattern: note, mode: 'tell' }, ...DEFAULT_POLICY.protected] });
  assert.deepEqual(actionsOf(tracked).told, [note]);
});
