// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { IDENTIFIER_NOT_SHOWN, OUTSIDE_THE_PROJECT } from '../../../../src/core/project-root.ts';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import type { AgentRuns, FileHow, RunFile, RunStep, WroteBefore } from '../../../../src/report/report-model.ts';
import { RUN_FILES_KEPT } from '../../../../src/report/runs.ts';
import { translator } from '../../../../src/report/render/report-copy.ts';
import { tryLine } from '../../../../src/report/render/report-page/step-by-step-view.ts';
import { triesAfterStops, type TryNote } from '../../../../src/report/render/report-page/tries.ts';

// `specs/2026-11-17-tried-again-after-a-stop.md` TA1-TA6: what one AI did with a file after it was first stopped over it.
const redactor = new Redactor('test');
const ENV = redactor.path('.env');

type FileSpec = readonly [path: string, how: FileHow, extra?: Partial<RunFile>];

let sequence = 0;
function step(did: string, ...files: FileSpec[]): RunStep {
  sequence += 1;
  const stopped = files.some(([, how]) => how === 'stopped');
  return {
    sequence, did: redactor.term(did), toolKnown: true, outcome: stopped ? 'blocked' : 'succeeded',
    ...(stopped ? { refusedBy: 'rule' as const } : {}), evidence: redactor.term('session record ' + sequence),
    files: files.map(([path, how, extra]) => ({ path: redactor.path(path), how, private: true, ...extra })),
  };
}

const NOTHING_WRITTEN: WroteBefore = { size: 0, blank: 0, covers: 1, carried: [], evidence: redactor.term('session record 0') };

const agent = (steps: readonly RunStep[], stepsLeftOut?: number): AgentRuns => ({
  agentIndex: 0, runs: [{ wrote: NOTHING_WRITTEN, steps }], ...(stepsLeftOut === undefined ? {} : { stepsLeftOut }),
});

const say = (note: TryNote | undefined, lang: 'en' | 'pl' | 'de' = 'en'): string | undefined =>
  note === undefined ? undefined : tryLine(note, translator(lang), (path) => path);

test('one stop and nothing after it adds no line', () => {
  const steps = [step('Read', ['.env', 'stopped']), step('Read', ['src/app.ts', 'read'])];
  assert.equal(triesAfterStops(agent(steps)).size, 0);
});

test('a stop and two more: the first says what came after, each later one how many stops came before', () => {
  const steps = [step('Read', ['.env', 'stopped']), step('Read', ['.env', 'stopped']), step('Read', ['.env', 'stopped'])];
  const notes = triesAfterStops(agent(steps));
  assert.deepEqual(notes.get(steps[0] as RunStep), { kind: 'after', path: ENV, more: 2, ended: 'stopped', ways: 1 });
  assert.equal(say(notes.get(steps[0] as RunStep)), 'It tried to open <code>.env</code> 2 more times after this. It was stopped every time.');
  assert.equal(say(notes.get(steps[1] as RunStep)), 'It had already been stopped from opening <code>.env</code> once before.');
  assert.equal(say(notes.get(steps[2] as RunStep)), 'It had already been stopped from opening <code>.env</code> 2 times before.');
});

test('a stop, then a read another way: not every try was stopped, in two ways, and the read says it was stopped before', () => {
  const steps = [step('Read', ['.env', 'stopped']), step('Bash (cat)', ['.env', 'read'])];
  const notes = triesAfterStops(agent(steps));
  assert.equal(say(notes.get(steps[0] as RunStep)),
    'It tried to open <code>.env</code> once more after this. Not every try was stopped: it read the file. It tried 2 different ways.');
  assert.equal(say(notes.get(steps[1] as RunStep)), 'It had already been stopped from opening <code>.env</code> once before.');
});

test('the strongest later try names how it ended: read over opened over stopped', () => {
  const steps = [step('Read', ['.env', 'stopped']), step('Bash (wc)', ['.env', 'opened']), step('Read', ['.env', 'stopped']), step('Bash (cat)', ['.env', 'read'])];
  const after = triesAfterStops(agent(steps)).get(steps[0] as RunStep);
  assert.equal(after?.kind === 'after' ? after.ended : undefined, 'read');
  assert.equal(after?.kind === 'after' ? after.ways : undefined, 3, 'Read, Bash (wc), Bash (cat)');
});

// TA1: a listing that printed the name is not a try - seeing a name is not reaching for the file.
test('a name seen after a stop is no try', () => {
  const steps = [step('Read', ['.env', 'stopped']), step('Bash (ls)', ['.env', 'named'])];
  const notes = triesAfterStops(agent(steps));
  assert.equal(notes.size, 0);
});

// SB14 as amended 2026-10-20: a stopped step speaks of the blocked file it was stopped for, not a tracked one beside it.
test('a step stopped over a blocked file and a tracked one speaks of the blocked one', () => {
  const both = (): RunStep => step('Bash (cat)', ['customers.csv', 'stopped', { tracked: true }], ['bank-details.txt', 'stopped']);
  const steps = [both(), both()];
  const notes = triesAfterStops(agent(steps));
  const first = notes.get(steps[0] as RunStep);
  assert.equal(first?.path, redactor.path('bank-details.txt'));
  assert.equal(say(first), 'It tried to open <code>bank-details.txt</code> once more after this. It was stopped again.');
});

// TA1, TAD3: another AI's tries are in its own timeline; there is no order across AIs.
test('another AI’s tries are not counted', () => {
  const mine = [step('Read', ['.env', 'stopped'])];
  const helper = [step('Bash (cat)', ['.env', 'read'])];
  assert.equal(triesAfterStops(agent(mine)).size, 0);
  assert.equal(triesAfterStops(agent(helper)).size, 0, 'a read with no stop before it in its own AI says nothing');
});

// TA5: tries past the cut are not in the report, so the first stop does not count what came after it.
test('where steps were cut, the first stop says nothing and the later tries keep their lines', () => {
  const steps = [step('Read', ['.env', 'stopped']), step('Read', ['.env', 'stopped'])];
  const notes = triesAfterStops(agent(steps, 12));
  assert.equal(notes.get(steps[0] as RunStep), undefined);
  assert.equal(say(notes.get(steps[1] as RunStep)), 'It had already been stopped from opening <code>.env</code> once before.');
});

// TA2 across runs: tries are counted over the AI's whole order, not one stretch of writing.
test('tries in later stretches of the same AI count', () => {
  const first = step('Read', ['.env', 'stopped']);
  const second = step('Bash (cat)', ['.env', 'stopped']);
  const runs: AgentRuns = { agentIndex: 0, runs: [{ wrote: NOTHING_WRITTEN, steps: [first] }, { wrote: NOTHING_WRITTEN, steps: [second] }] };
  const after = triesAfterStops(runs).get(first);
  assert.equal(after?.kind === 'after' ? after.more : undefined, 1);
});

// TA8: the lines in pl and de, with the counts in their forms.
test('the lines are said in pl and de', () => {
  const after: TryNote = { kind: 'after', path: ENV, more: 3, ended: 'stopped', ways: 2 };
  assert.equal(say(after, 'pl'), 'Potem jeszcze 3 razy próbowano otworzyć <code>.env</code>. Za każdym razem próbę zatrzymano. Próbowano na 2 różne sposoby.');
  assert.equal(say({ kind: 'before', path: ENV, stops: 5 }, 'pl'), 'Już 5 razy wcześniej zatrzymano próbę otwarcia <code>.env</code>.');
  assert.equal(say(after, 'de'), 'Danach wurde noch 3-mal versucht, <code>.env</code> zu öffnen. Jeder Versuch wurde gestoppt. Es wurde auf 2 verschiedene Weisen versucht.');
  assert.equal(say({ kind: 'before', path: ENV, stops: 1 }, 'de'), 'Ein Versuch, <code>.env</code> zu öffnen, wurde schon einmal gestoppt.');
});

// TA4: counts and outcomes, never intent.
test('no line speaks of intent', () => {
  const lines = (['read', 'changed', 'opened', 'unknown', 'stopped'] as const).flatMap((ended) => [1, 3].map((more) =>
    say({ kind: 'after', path: ENV, more, ended, ways: 2 }) ?? ''));
  for (const line of lines) assert.doesNotMatch(line, /prob|insist|around|purpose|on purpose|sneak|bypass/i, line);
});

// Review 2026-11-17: under `--share` every path outside the project is one phrase, so a key stopped in the home folder and
// another file read there were one file, and the line said the stopped key had been read.
test('under --share a path that stands for several files has no line', () => {
  const outside = redactor.term(OUTSIDE_THE_PROJECT);
  const hidden = redactor.term('logs/' + IDENTIFIER_NOT_SHOWN + '.log');
  const as = (path: typeof outside, how: FileHow): RunStep => ({ ...step('Read'), files: [{ path, how, private: true }] });
  const steps = [as(outside, 'stopped'), as(outside, 'read'), as(hidden, 'stopped'), as(hidden, 'stopped')];
  assert.equal(triesAfterStops(agent(steps)).size, 0);
});

/** A step cut as `runs.ts` cuts one (SB4): 24 files kept, private ones first, the rest counted. */
function cutStep(did: string, privateKept: number, leftOut: number): RunStep {
  const files: RunFile[] = Array.from({ length: RUN_FILES_KEPT }, (_, at) => at < privateKept
    ? { path: redactor.path('keys/' + at + '.pem'), how: 'read', private: true }
    : { path: redactor.path('src/file' + at + '.ts'), how: 'read' });
  return { ...step(did), files, filesLeftOut: leftOut };
}

// Review 2026-11-17 (TA5): a later listing kept 24 of 31 files and cut the one tried, so the line counted one try too few
// and said "stopped again" over a read.
test('a later step whose cap may have cut an everyday file keeps the first stop silent', () => {
  const app = (): RunStep => ({ ...step('Read'), files: [{ path: redactor.path('src/app.ts'), how: 'stopped' }] });
  const listing = cutStep('Bash (grep)', 0, 7);
  const steps = [app(), app(), listing];
  const notes = triesAfterStops(agent(steps));
  assert.equal(notes.get(steps[0] as RunStep), undefined);
  assert.equal(say(notes.get(steps[1] as RunStep)), 'It had already been stopped from opening <code>src/app.ts</code> once before.');
});

// SB4: private files are kept first, so only a step that kept nothing but private files can have cut one.
test('a private file is cut only from a step that kept nothing but private files', () => {
  const env = (): RunStep => step('Read', ['.env', 'stopped']);
  const everyday = cutStep('Bash (grep)', 3, 7);
  const full = cutStep('Bash (cat)', RUN_FILES_KEPT, 3);
  const kept = [env(), everyday, env()];
  assert.equal(triesAfterStops(agent(kept)).get(kept[0] as RunStep)?.kind, 'after', 'an everyday listing cut no private file');
  const cut = [env(), full, env()];
  assert.equal(triesAfterStops(agent(cut)).get(cut[0] as RunStep), undefined, 'a step full of private files may have cut it');
});

// Review 2026-11-17: an unknown outcome may have been a refusal (`EventOutcome`), so it never says a try went through.
test('a later try of unknown outcome does not say it went through', () => {
  const steps = [step('Read', ['.env', 'stopped']), step('Bash (cat)', ['.env', 'unknown'])];
  assert.equal(say(triesAfterStops(agent(steps)).get(steps[0] as RunStep)),
    'It tried to open <code>.env</code> once more after this. We can’t tell whether a later try read the file. It tried 2 different ways.');
});

// Review 2026-11-17: the count before a try and the count after a stop agreed on no rule - a tracked file in a call stopped
// over a blocked one was a stopped try after, and no stop before.
test('a try in a call stopped over another file counts as a stop before and after', () => {
  const steps = [
    step('Read', ['customers.csv', 'stopped', { tracked: true }]),
    step('Bash (cat)', ['customers.csv', 'stopped', { tracked: true }], ['.env', 'stopped']),
    step('Read', ['customers.csv', 'read', { tracked: true }]),
  ];
  const notes = triesAfterStops(agent(steps));
  assert.equal(say(notes.get(steps[0] as RunStep)),
    'It tried to open <code>customers.csv</code> 2 more times after this. Not every try was stopped: it read the file. It tried 2 different ways.');
  assert.equal(say(notes.get(steps[2] as RunStep)), 'It had already been stopped from opening <code>customers.csv</code> 2 times before.');
});

// `2026-11-23-a-write-over-the-key.md` WK7 (fix round 2): a stop of a write by agentwhy's write check is said with a write's verbs,
// and what came after it never suggests a key was lost unless a later write is itself one that put the placeholder over it.
const SETTINGS = redactor.path('settings.yml');
function writeStep(keyWrite: RunStep['keyWrite'] | undefined, how: FileHow = keyWrite?.kind === 'stopped' ? 'stopped' : 'changed', did = 'Write'): RunStep {
  sequence += 1;
  return {
    sequence, did: redactor.term(did), toolKnown: true, outcome: how === 'stopped' ? 'blocked' : 'succeeded',
    ...(how === 'stopped' ? { refusedBy: 'check' as const } : {}), evidence: redactor.term('session record ' + sequence),
    files: [{ path: SETTINGS, how }], ...(keyWrite === undefined ? {} : { keyWrite }),
  };
}

test('WK7: after a stopped write, the later writes are said as writes, and a write that kept the key does not read as a loss', () => {
  const steps = [writeStep({ kind: 'stopped', path: SETTINGS }), writeStep(undefined, 'changed', 'Edit'), writeStep(undefined, 'changed', 'Edit')];
  const notes = triesAfterStops(agent(steps));
  assert.deepEqual(notes.get(steps[0] as RunStep), { kind: 'after', path: SETTINGS, more: 2, ended: 'changed', ways: 2, write: true });
  assert.equal(say(notes.get(steps[0] as RunStep)),
    'It tried to write to <code>settings.yml</code> 2 more times after this. A later write changed the file. It tried 2 different ways.');
  assert.equal(say(notes.get(steps[1] as RunStep)), 'It had already been stopped from writing to <code>settings.yml</code> once before.');
  assert.doesNotMatch(say(notes.get(steps[0] as RunStep)) ?? '', /open|Not every try was stopped/);
});

test('WK7: a later write that did put the placeholder over the key is said as one', () => {
  const steps = [writeStep({ kind: 'stopped', path: SETTINGS }), writeStep({ kind: 'written', path: SETTINGS, keys: 1 })];
  const notes = triesAfterStops(agent(steps));
  assert.equal(say(notes.get(steps[0] as RunStep)),
    'It tried to write to <code>settings.yml</code> once more after this. Not every try was stopped: a later write put the placeholder over the key.');
});

test('WK7: two stopped writes say a write was stopped every time, and before', () => {
  const steps = [writeStep({ kind: 'stopped', path: SETTINGS }), writeStep({ kind: 'stopped', path: SETTINGS })];
  const notes = triesAfterStops(agent(steps));
  assert.equal(say(notes.get(steps[0] as RunStep)), 'It tried to write to <code>settings.yml</code> once more after this. It was stopped again.');
  assert.equal(say(notes.get(steps[1] as RunStep)), 'It had already been stopped from writing to <code>settings.yml</code> once before.');
  assert.match(say(notes.get(steps[0] as RunStep), 'pl') ?? '', /^Potem jeszcze raz próbowano zapisać <code>settings\.yml<\/code>\./);
  assert.match(say(notes.get(steps[1] as RunStep), 'pl') ?? '', /^Już raz wcześniej zatrzymano próbę zapisu <code>settings\.yml<\/code>\./);
  assert.match(say(notes.get(steps[0] as RunStep), 'de') ?? '', /^Danach wurde noch einmal versucht, in <code>settings\.yml<\/code> zu schreiben\./);
  assert.match(say(notes.get(steps[1] as RunStep), 'de') ?? '', /^Ein Versuch, in <code>settings\.yml<\/code> zu schreiben, wurde schon einmal gestoppt\./);
});

test('WK7: a read stop keeps its words, a write after it included', () => {
  const steps = [step('Read', ['.env', 'stopped']), step('Edit', ['.env', 'changed'])];
  const notes = triesAfterStops(agent(steps));
  assert.equal(say(notes.get(steps[0] as RunStep)), 'It tried to open <code>.env</code> once more after this. Not every try was stopped: it changed the file. It tried 2 different ways.');
  assert.equal(say(notes.get(steps[1] as RunStep)), 'It had already been stopped from opening <code>.env</code> once before.');
});
