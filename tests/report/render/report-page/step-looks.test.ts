// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Redactor } from '../../../../src/core/redaction/redactor.ts';
import { toolKey, type AgentRuns, type RunFile, type RunStep } from '../../../../src/report/report-model.ts';
import { translator } from '../../../../src/report/render/report-copy.ts';
import { agentTone, foldFileOf, foldKey, foldSentence, guardStepsOf, labelOf, readsPrivate, toneOf } from '../../../../src/report/render/report-page/step-looks.ts';

// `specs/2026-11-23-the-story-at-a-glance.md` SG2, SG13: which steps fold, what a fold says, and an AI's strongest look.
const redactor = new Redactor('test');

const file = (path: string, how: RunFile['how'], extra: Partial<RunFile> = {}): RunFile =>
  ({ path: redactor.term(path), how, private: true, ...extra });

const step = (extra: Partial<RunStep> = {}): RunStep => ({
  sequence: 1, did: redactor.term('Read'), toolKnown: true, outcome: 'succeeded', files: [], evidence: redactor.term('main#1'), ...extra,
});
const reading = (path: string): RunStep => step({ files: [file(path, 'read')] });
const plain = (did = 'Read'): RunStep => step({ did: redactor.term(did), files: [{ path: redactor.term('README.md'), how: 'read' }] });
const planning = (server = 'ccd_turn', tool = 'update_plan'): RunStep => step({
  did: redactor.term(`mcp__${server}__${tool}`), toolKnown: false, mcp: { server: redactor.term(server), tool: redactor.term(tool) },
});

const wrote = { size: 0, blank: 0, covers: 0, carried: [], evidence: redactor.term('main#0') };
const agent = (agentIndex: number, steps: readonly RunStep[]): AgentRuns => ({ agentIndex, runs: [{ wrote, steps }] });

test('steps of one look and one verb share a key, and steps with nothing private share one whatever they did', () => {
  assert.equal(foldKey(reading('.env')), 'coral:read');
  assert.equal(foldKey(reading('.env.test')), 'coral:read');
  assert.equal(foldKey(step({ files: [file('.env', 'changed')] })), 'coral:changed');
  assert.equal(foldKey(step({ files: [file('.env', 'read', { tracked: true })] })), 'sand:read');
  assert.equal(foldKey(step({ outcome: 'blocked', files: [file('.env', 'stopped')] })), 'mint:stopped');
  assert.equal(foldKey(step({ files: [file('.env', 'named')] })), 'blue:named');
  assert.equal(foldKey(step({ files: [file('.env', 'opened')] })), 'blue:opened');
  assert.equal(foldKey(plain()), 'grey');
  assert.equal(foldKey(step({ did: redactor.term('Bash') })), 'grey');
});

test('a stopped step and one whose end is not recorded never fold with steps that touched nothing private', () => {
  assert.equal(foldKey(step({ outcome: 'blocked' })), undefined);
  assert.equal(foldKey(step({ outcome: 'unknown' })), undefined);
  assert.equal(foldKey(step({ ...planning(), outcome: 'unknown' })), undefined);
});

test('a tool the adapter does not know folds with itself alone', () => {
  const key = foldKey(planning());
  assert.equal(key, 'tool:' + toolKey('mcp__ccd_turn__update_plan', { server: 'ccd_turn', tool: 'update_plan' }));
  assert.equal(foldKey(planning()), key);
  assert.notEqual(foldKey(planning('other')), key);
  assert.notEqual(foldKey(planning('ccd_turn', 'wrap_up')), key);
});

test('a hand-over, several private files and a file not known never fold', () => {
  assert.equal(foldKey(step({ gave: { back: true }, files: [file('.env', 'read')] })), undefined);
  assert.equal(foldKey(step({ files: [file('.env', 'read'), file('.env.test', 'read')] })), undefined);
  assert.equal(foldKey(step({ files: [file('.env', 'unknown')] })), undefined);
  assert.equal(foldKey(step({ files: [file('.env', 'changed', { tracked: true })] })), undefined, 'a change to a tracked file is not said as a read');
});

test('a fold says its count, and only the plural its language asks for', () => {
  const reads = (n: number): RunStep[] => Array.from({ length: n }, (_, at) => reading(`.env.${at}`));
  const say = (lang: 'en' | 'pl' | 'de', steps: readonly RunStep[]): string => foldSentence(steps, foldKey(steps[0] as RunStep) as string, translator(lang), (path) => path);
  assert.equal(say('en', reads(7)), 'Read 7 private files, one after another');
  assert.equal(say('pl', reads(7)), 'Przeczytano 7 prywatnych plików, jeden po drugim');
  assert.equal(say('pl', reads(3)), 'Przeczytano 3 prywatne pliki, jeden po drugim');
  assert.equal(say('de', reads(2)), 'Hat 2 private Dateien gelesen, eine nach der anderen');
  assert.equal(say('en', [plain(), plain()]), '2 steps that touched nothing private');
  assert.match(say('en', [planning(), planning()]), /^Used <code>update_plan<\/code> 2 times\. We can.t tell which files it opened\.$/);
});

// The review of 2026-11-24 (I1): three reads of one file are three steps and one file, and a row must not count steps as files.
test('a fold of one file says the file and how often, and a fold of several counts the files, never the steps', () => {
  const twice = [reading('.env'), reading('.env'), reading('.env')];
  const name = (text: string): string => foldSentence(twice, foldKey(twice[0] as RunStep) as string, translator('en'), () => text);
  assert.equal(name('.env'), 'Read <code>.env</code> 3 times, one after another');
  const mixed = [reading('.env'), reading('.env'), reading('.env.test')];
  assert.equal(foldSentence(mixed, 'coral:read', translator('en'), (path) => path), 'Read 2 private files, one after another');
  const named = [step({ files: [file('.env', 'named')] }), step({ files: [file('.env', 'named')] })];
  assert.equal(foldSentence(named, 'blue:named', translator('en'), (path) => path), 'Saw the name of <code>.env</code> 2 times');
  assert.equal(foldSentence(twice, 'coral:read', translator('pl'), (path) => path), 'Przeczytano <code>.env</code> 3 razy z rzędu');
  assert.equal(foldSentence(twice, 'coral:read', translator('de'), (path) => path), 'Hat <code>.env</code> 3-mal hintereinander gelesen');
});

// I8: the first private read is a read, and a change of a private file is not one.
test('only a read of a private file nobody lets pass is a first private read', () => {
  assert.equal(readsPrivate(reading('.env')), true);
  assert.equal(readsPrivate(step({ files: [file('.env', 'changed')] })), false);
  assert.equal(readsPrivate(step({ files: [file('.env', 'read', { tracked: true })] })), false);
  assert.equal(readsPrivate(plain()), false);
});

test('the file of a folded step is the private one it did the most to, or the first it named', () => {
  const named = step({ files: [file('.env', 'named')] });
  assert.equal(foldFileOf(named)?.path, '.env');
  assert.equal(foldFileOf(step({ files: [{ path: redactor.term('README.md'), how: 'read' }] }))?.path, 'README.md');
  assert.equal(foldFileOf(step()), undefined);
});

test('an AI takes the strongest look of its own steps and its helpers’', () => {
  const helper = agent(1, [reading('.env')]);
  const main = agent(0, [plain(), step({ gave: { agentIndex: 1, back: true } })]);
  const byAgent = new Map([[0, main], [1, helper]]);
  assert.equal(agentTone(byAgent, 0, new Set()), 'coral');
  assert.equal(agentTone(byAgent, 1, new Set()), 'coral');
  assert.equal(agentTone(byAgent, 2, new Set()), 'grey', 'a helper the record does not hold: grey, as the page has drawn it (SGD1)');
  const loop = new Map([[0, agent(0, [step({ gave: { agentIndex: 1, back: true } })])], [1, agent(1, [step({ gave: { agentIndex: 0, back: true } })])]]);
  assert.equal(agentTone(loop, 0, new Set()), 'grey');
});

// WK7 (develop, 2026-11-24): a key the AI wrote over, or a write agentwhy stopped, is the story - never one of the ordinary
// steps, never a read, and never said in a read's words.
test('a write over a key never folds, is no read, and is said in its own words', () => {
  const written = step({ did: redactor.term('Write'), keyWrite: { kind: 'written', path: redactor.term('.env'), keys: 1 } });
  const stopped = step({ did: redactor.term('Write'), keyWrite: { kind: 'stopped', path: redactor.term('.env') } });
  for (const each of [written, stopped]) {
    assert.equal(foldKey(each), undefined);
    assert.equal(readsPrivate(each), false);
  }
  assert.equal(toneOf(written), 'coral');
  assert.equal(labelOf(written), 'sb.tag.keyWritten');
  assert.equal(labelOf(reading('.env')), 'sb.tag.read');
  // With a private file of the same step beside it, still no fold and no read.
  assert.equal(foldKey({ ...written, files: [file('.env', 'read')] }), undefined);
  assert.equal(readsPrivate({ ...written, files: [file('.env', 'read')] }), false);
});

// The AI changing what protects the files is said on the page and in the chat; its step is not one of those that did nothing.
test('the step that changed a guard file is known by its AI and its action number', () => {
  const guard = guardStepsOf({ guardChanges: [{ path: redactor.term('.claude/settings.json'), file: 'block', agentIndex: 0, step: 4, outcome: 'changed', said: 'other', via: 'tool' }] });
  assert.equal(guard(0, step({ sequence: 4 })), true);
  assert.equal(guard(0, step({ sequence: 5 })), false);
  assert.equal(guard(1, step({ sequence: 4 })), false);
  assert.equal(guardStepsOf({})(0, step()), false);
});
