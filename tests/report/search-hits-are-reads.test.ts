// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ContentFingerprints } from '../../src/core/access/content-fingerprints.ts';
import type { ToolEvent } from '../../src/core/event.ts';
import { DEFAULT_POLICY } from '../../src/core/policy/default-policy.ts';
import type { Policy } from '../../src/core/policy/policy.ts';
import { Redactor } from '../../src/core/redaction/redactor.ts';
import type { SessionModel } from '../../src/core/session-model.ts';
import { buildReport } from '../../src/report/build-report.ts';
import { actionsOf } from '../../src/report/check/session-actions.ts';
import { filesRead } from '../../src/report/flow-reads.ts';
import { fileStory } from '../../src/report/render/report-page/file-story.ts';
import { ReportPageRenderer } from '../../src/report/render/report-page/report-page-renderer.ts';
import { toDoItems } from '../../src/report/render/report-page/to-do.ts';
import { TextReportRenderer } from '../../src/report/render/text-report-renderer.ts';
import type { FlowReached } from '../../src/report/report-model.ts';

// `.ai/specs/2026-09-25-search-hits-are-reads.md`: a search's hit line is a line of the file it names. The row below is
// invented - the shape of the maintainer's find of 2026-09-24, none of its data - and the key is assembled at run time.
const ROW = '5,Ada,Lovelace,ada@example.test,+48 500 000 000,Poznan,PL';
const STRIPE = ['sk_', 'live_', 'Test0000000000000000000'].join('');
const WITH_CSV: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv' }] };
const TOLD_CSV: Policy = { ...DEFAULT_POLICY, protected: [...DEFAULT_POLICY.protected, { pattern: '**/customers.csv', mode: 'tell' }] };

let sequence = 0;
function shell(command: string, output: string, extra: Partial<ToolEvent> = {}): ToolEvent {
  sequence += 1;
  const evidence = { source: { kind: 'main' as const }, record: sequence };
  return {
    id: 'call-' + sequence, agentId: 'main', sequence, toolName: 'Bash', input: {}, targets: [], commands: [command],
    resultShape: 'listing', toolKnown: true, outcome: 'succeeded', evidence, completeness: 'complete', result: { stage: 'model', completeness: 'complete', content: output, evidence },
    ...extra,
  };
}

function session(events: ToolEvent[]): SessionModel {
  return {
    provider: 'claude-code',
    turns: [], reviews: [], contexts: [], deliveries: [], capabilities: [],
    sessionId: 'main', projectRoot: { kind: 'absent' }, agents: [{ id: 'main', type: 'main', depth: 0 }],
    delegations: [], events, completeness: 'complete', messages: [], gaps: [],
  };
}

const report = (events: ToolEvent[], policy: Policy = WITH_CSV) =>
  buildReport(session(events), policy, new Redactor('test'), { share: false, projectRoot: { kind: 'absent' } });
const reached = (model: ReturnType<typeof report>): FlowReached[] =>
  model.flows.flatMap((flow) => flow.steps).filter((step): step is FlowReached => step.kind === 'reached');
const english = (html: string): string => html
  .replace(/<span class="i18n" lang="(pl|de)">[\s\S]*?<\/span>(?=<span class="i18n"|[^<]*<)/g, '')
  .replace(/<span class="i18n" lang="en">([\s\S]*?)<\/span>/g, '$1');

// H1, H5, H7, H8, H11: the maintainer's case - a search for a name printed a customer's row. A recursive search writes
// what it found as `./customers.csv`; since 2026-10-07 a path is recorded as the file is named, so one file is one row
// however the line that reached it wrote it (`protected-access.ts`, `sameFile`).
test('a row a search printed makes the file read, counted, and to see to - and nothing of the row is kept', () => {
  const model = report([shell('grep -rniI -e "Ada" .', `./customers.csv:6:${ROW}\n./src/app.ts:3:// Ada`)]);
  const [step] = reached(model);

  assert.deepEqual(step?.lines, [{ path: 'customers.csv', count: 1 }]);
  assert.equal(step?.carriedValue, false, 'no value was traced: the line itself is what was read');
  assert.deepEqual(step === undefined ? [] : filesRead(step), ['customers.csv']);
  assert.equal(model.stories[0]?.lines, 1);
  assert.deepEqual(model.privateFiles.map((file) => [file.path, file.keys, file.names, file.mixed]), [['customers.csv', [], [], undefined]], 'a row names no key');

  assert.deepEqual(actionsOf(model).rotate.map((file) => file.path), ['customers.csv'], 'H7: on the list, as data');
  assert.deepEqual(toDoItems(model).map((item) => [item.path, item.kind]), [['customers.csv', 'data']]);
  const [entry] = fileStory(model, 'customers.csv').entries;
  assert.deepEqual([entry?.kind, entry?.lines, entry?.inResult], ['read', 1, true]);

  const page = english(new ReportPageRenderer().render({ report: model, withIndexLink: false }));
  assert.match(page, /No command asked for this file\. <code>Bash \(grep\)<\/code> printed 1 line of it\./);
  assert.match(new TextReportRenderer(100).render(model), /in a result · 1 line printed +reached/);
  for (const text of ['Lovelace', 'ada@example.test', '500 000', 'Poznan']) {
    assert.ok(!JSON.stringify(model).includes(text), `the model holds no "${text}"`);
    assert.ok(!page.includes(text), `the page holds no "${text}"`);
  }
});

// H2, H3 (HD3), H6: lines are credited to their own file, context lines count, and a key line is read as one.
test('a key line and the lines around it are that file’s alone, read for names and never for values', () => {
  const output = [
    './.env-1-# payments',
    `./.env:2:STRIPE_SECRET_KEY=${STRIPE}`,
    './.env-3-SUPABASE_URL=https://project.example.test',
    '--',
    `./customers.csv:6:${ROW}`,
  ].join('\n');
  const model = report([shell('grep -rn -C1 -e STRIPE -e Ada .', output)]);

  assert.deepEqual(reached(model)[0]?.lines, [{ path: '.env', count: 3 }, { path: 'customers.csv', count: 1 }]);
  const env = model.privateFiles.find((file) => file.path === '.env');
  assert.deepEqual(env?.names, ['STRIPE_SECRET_KEY', 'SUPABASE_URL']);
  assert.deepEqual(env?.keyed.map((line) => [line.name, line.key]), [['STRIPE_SECRET_KEY', 'stripe-key']]);
  assert.equal(env?.mixed, undefined, 'a hit says whose it is, so nothing is mixed');
  assert.deepEqual(model.privateFiles.find((file) => file.path === 'customers.csv')?.names, [], 'the other file gets none of .env’s names');
  assert.ok(!JSON.stringify(model).includes(STRIPE));
  assert.ok(!JSON.stringify(model).includes('project.example.test'));
});

// H1, H12, H13: what printed no line of a file read nothing of it.
test('a search that printed names, counts or nothing it finished leaves the file only named', () => {
  for (const [command, output, outcome] of [
    ['grep -rl Ada .', './customers.csv\n./src/app.ts', 'succeeded'],
    ['grep -rc Ada .', './customers.csv:2\n./src/app.ts:1', 'succeeded'],
    ['rg --files', './customers.csv', 'succeeded'],
    ['grep -rn Ada .', `./customers.csv:6:${ROW}`, 'unknown'],
  ] as const) {
    const model = report([shell(command, output, outcome === 'unknown' ? { outcome, completeness: 'partial' } : {})]);
    assert.equal(reached(model)[0]?.lines, undefined, command);
    assert.deepEqual(actionsOf(model).rotate, [], command);
    assert.notEqual(fileStory(model, 'customers.csv').entries[0]?.kind, 'read', command);
  }
});

// H3: one file searched prints its lines with no path, and every one of them is that file's.
test('a search of one named file is a read of the lines it printed', () => {
  const model = report([shell('grep KEY .env', `STRIPE_SECRET_KEY=${STRIPE}\nOTHER_KEY=plain`)]);
  assert.deepEqual(reached(model)[0]?.lines, [{ path: '.env', count: 2 }]);
  assert.deepEqual(model.privateFiles[0]?.names, ['STRIPE_SECRET_KEY', 'OTHER_KEY']);
  const [entry] = fileStory(model, '.env').entries;
  assert.deepEqual([entry?.kind, entry?.lines, entry?.inResult], ['read', 2, undefined]);
  assert.deepEqual(actionsOf(model).rotate.map((file) => [file.path, file.keyed]), [['.env', true]]);
  const page = english(new ReportPageRenderer().render({ report: model, withIndexLink: false }));
  assert.match(page, /A search printed 2 lines of this file, with <code>Bash \(grep\)<\/code>\./);

  // A colon in a line's text is not a file name before it: `https:` is no path, and the line is still .env's.
  for (const command of ['grep URL .env', 'rg URL .env', 'grep -rn URL .env']) {
    const url = report([shell(command, (command.includes('-n') ? '3:' : '') + 'SUPABASE_URL=https://project.example.test')]);
    assert.deepEqual(reached(url)[0]?.lines, [{ path: '.env', count: 1 }], command);
    assert.deepEqual(url.privateFiles[0]?.names, ['SUPABASE_URL'], command);
  }
});

// H1: the Grep tool, where its input asked for the matching lines.
test('the Grep tool in content mode prints lines, and in its default mode names files', () => {
  const lines = report([shell('', `customers.csv:6:${ROW}`, { toolName: 'Grep', commands: [], printsMatches: true })]);
  assert.deepEqual(reached(lines)[0]?.lines, [{ path: 'customers.csv', count: 1 }]);
  const names = report([shell('', 'customers.csv', { toolName: 'Grep', commands: [] })]);
  assert.equal(reached(names)[0]?.lines, undefined);
});

// H7 with F57a: a file the person only asked to hear about was let be read; a row in it is not something to fix.
test('a told data file a search printed stays off the list, and is still said to be read', () => {
  const model = report([shell('grep -rn Ada .', `./customers.csv:6:${ROW}`)], TOLD_CSV);
  assert.deepEqual(actionsOf(model).rotate, []);
  assert.deepEqual(actionsOf(model).told, ['customers.csv']);
  assert.equal(fileStory(model, 'customers.csv').entries[0]?.kind, 'read');
});

// A step repeated is drawn once, from its first call: a names-only search must not swallow the read after it.
test('a search that printed lines is never merged into one before it that printed names', () => {
  const model = report([shell('grep -rl Ada .', './customers.csv'), shell('grep -rn Ada .', `./customers.csv:6:${ROW}`)]);
  assert.deepEqual(fileStory(model, 'customers.csv').entries.map((entry) => entry.kind), ['named', 'read']);
});

/** What an AI writes to edit a file: Python on standard input, its replacement text holding a quoted `.env`. */
const python = (opener: string, ...body: string[]): string => [`python3 - ${opener}`, ...body, 'PY'].join('\n');
const EDIT = python("<<'PY'", "p = 'src/looks.ts'", 's = open(p).read()',
  's = s.replace("""const step = 1;""", """const step = read(\'.env\', 1);""")', "open(p, 'w').write(s)");

// H3 as amended 2026-11-24 (`2026-10-11-a-name-that-is-no-file.md` NX5): found by the maintainer in a conversation of their
// own, over a worktree with no `.env` in it. The test runner's lines, piped to a grep, were a file's the edit only wrote about.
test('a name in the text an AI writes with code is no file a search on that line printed', () => {
  for (const command of [
    `${EDIT}\nnode --test tests/looks.test.ts 2>&1 | grep -E "pass|fail"`,
    `${EDIT}\ngrep -n "step" -A10 src/looks.ts\nnode --test tests/looks.test.ts 2>&1 | grep -E "pass|fail"`,
    `${EDIT}\ngrep -rn "step" src/looks.ts`,
  ]) {
    const model = report([shell(command, '# pass 2\n# fail 0')]);
    assert.deepEqual(reached(model).map((step) => [step.files, step.lines]), [[['.env'], undefined]], command);
    assert.deepEqual(reached(model).flatMap(filesRead), [], command);
    assert.deepEqual(fileStory(model, '.env').entries.map((entry) => entry.kind), ['named'], command);
    assert.deepEqual(actionsOf(model).rotate, [], command);
  }
});

// NX5 only takes a read away: a line that names two files was no one's it could be told, and setting one aside as text
// makes the other no more the file the search printed (NXB5: three such reads in the first build, each false).
test('a name set aside as text makes no other file of its line the one a search printed', () => {
  const model = report([shell(`${EDIT}\nls customers.csv\nnpm test 2>&1 | grep pass`, '# pass 2')]);
  assert.deepEqual(reached(model).flatMap((step) => step.lines ?? []), []);
});

// NX5, its other side: where the line could have handed the file's text on, the lines stay its own, as they were.
test('a name code could have opened, run or been handed keeps the lines a search on its line printed', () => {
  const searched = 'npm test 2>&1 | grep KEY';
  for (const command of [
    'cat .env | grep KEY',
    `${EDIT}\ncat .env | grep KEY`,
    `${EDIT}\nF=.env; grep KEY "$F"`,
    `${EDIT}\ngrep KEY .env`,
    `python3 -c "print(open('.env').read())" | grep KEY`,
    `${python("<<'PY'", "print(open('.env').read())")}\n${searched}`,
    `${python("<<'PY'", "NAMES = ['.env']", 'for name in NAMES: print(open(name).read())')}\n${searched}`,
    `${python("<<'PY'", 'print(f"{open(\'.env\').read()}")')}\n${searched}`,
    `${python("<<'PY'", 'import os', 'os.system("cat \'.env\'")')}\n${searched}`,
    `${python("<<'PY'", 'import subprocess', 'print(subprocess.run("cat \'.env\'", shell=True))')}\n${searched}`,
    `${python("<<'PY'", 'exec("print(open(\'.env\').read())")')}\n${searched}`,
    `${python("<<'PY'", 'import json', 'for name in json.loads(\'{"files": [(".env")]}\'): print(open(name).read())')}\n${searched}`,
    // The shell fills in what an unquoted heredoc asks it to run, before the code is read.
    `${python('<<PY', 'print("""text $(cat \'.env\')""")')}\n${searched}`,
    // Another language's strings are not read: what is not known to be text stays as it was.
    `node - <<'JS'\nconst s = "x = read('.env')"; require('fs').writeFileSync('a.js', s);\nJS\n${searched}`,
  ]) {
    const model = report([shell(command, 'STRIPE_SECRET_KEY=plain\nOTHER_KEY=plain')]);
    assert.deepEqual(reached(model).flatMap((step) => step.lines ?? []), [{ path: '.env', count: 2 }], command);
  }
});

// NX5 with CT1 (`2026-10-11-the-file-by-its-text.md`): a script an edit wrote and the line then ran may print the file for real.
// The edit's text does not say so, and the file's own lines in what came back do.
test('a file whose own lines came back is read, though its name is only the text of an edit', () => {
  const env = ['STRIPE_SECRET_KEY=made-up-for-this-test-4711', 'DATABASE_URL=postgres://made.example.test/shop'];
  const write = python("<<'PY'", "open('show.py', 'w').write(\"print(open('.env').read())\")");
  const root = { kind: 'known' as const, path: '/p' };
  const model = { ...session([shell(`${write}\npython3 show.py | grep -v "^#"`, env.join('\n'), { workingDirectory: '/p' })]), projectRoot: root };
  const fingerprints = ContentFingerprints.of([{ path: '/p/.env', lines: env, private: true }], 'test');
  const read = (view: { readonly fingerprints?: ContentFingerprints }): string[] =>
    reached(buildReport(model, WITH_CSV, new Redactor('test'), { share: false, projectRoot: root, ...view })).flatMap(filesRead);
  assert.deepEqual(read({ fingerprints }), ['.env']);
  assert.deepEqual(read({}), [], 'and the name alone says nothing of it');
});

// NX5 on the other route: an interpreter's own output is the file's only where its code names the file (`python-open`).
test('what an edit printed of its own is no value of the file its text names', () => {
  const edit = python("<<'PY'", "p = 'src/looks.ts'", 'done = 1', 's = open(p).read() + """const step = read(\'.env\');"""', "open(p, 'w').write(s)", 'print("RESULT_TOKEN=kept-as-it-was-4711")');
  const model = report([shell(edit, 'RESULT_TOKEN=kept-as-it-was-4711')]);
  assert.deepEqual(fileStory(model, '.env').entries.map((entry) => entry.kind), ['named']);
  assert.deepEqual(model.privateFiles.map((file) => [file.path, file.names]), [['.env', []]]);
});
