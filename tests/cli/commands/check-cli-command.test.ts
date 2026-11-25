// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CheckCliCommand } from '../../../src/cli/commands/check-cli-command.ts';
import { EXIT_CODE } from '../../../src/cli/exit-codes.ts';
import type { DigestAsks } from '../../../src/report/check/actions-digest.ts';
import type { CheckOptions, CheckResult, CheckUseCase } from '../../../src/report/check/session-check.ts';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const NOTHING: DigestAsks = { rotate: 0, files: 0, shapes: 0, unreadable: 0 };

/** A check whose run answers as given, and which records what it was asked. */
function commandAnswering(answer: CheckResult, runByAnAi?: boolean) {
  const runs: CheckOptions[] = [];
  const marks: string[] = [];
  const check: CheckUseCase = {
    run: async (options) => {
      runs.push(options);
      return answer;
    },
    mark: async (options) => {
      marks.push(`mark ${options.path}`);
      return { outcome: 'marked', output: 'MARKED\n' };
    },
    unmark: async (options) => {
      marks.push(`unmark ${options.path}`);
      return { outcome: 'marked', output: 'UNMARKED\n' };
    },
  };
  return { command: new CheckCliCommand({ check, now: NOW, ...(runByAnAi === undefined ? {} : { runByAnAi }) }), runs, marks };
}

const checked = (asks: Partial<DigestAsks>): CheckResult => ({ outcome: 'checked', output: 'DIGEST\n', asks: { ...NOTHING, ...asks } });

const completed = (result: Awaited<ReturnType<CheckCliCommand['execute']>>) => {
  assert.equal(result.kind, 'completed');
  return result as { readonly output: string; readonly exitCode: number };
};

// RB4: without the flag, nothing changes - exit 0 whatever was found, as the usage text has promised since R11.
test('without --fail-on, a check that found a key to change still exits 0', async () => {
  const { command } = commandAnswering(checked({ rotate: 2, files: 3, unreadable: 1 }));
  const result = completed(await command.execute([]));
  assert.equal(result.exitCode, EXIT_CODE.ok);
  assert.equal(result.output, 'DIGEST\n');
});

test('--fail-on rotate exits 1 on a value in an agent\'s context, and its last line says why', async () => {
  const { command } = commandAnswering(checked({ rotate: 2, files: 2 }));
  const result = completed(await command.execute(['--fail-on', 'rotate']));
  assert.equal(result.exitCode, 1);
  assert.equal(result.output, "DIGEST\n--fail-on rotate: a value from 2 files was in an agent's context. Exit code 1.\n");
});

test('--fail-on rotate passes an answer that asks only about routes and results', async () => {
  const { command } = commandAnswering(checked({ files: 4, shapes: 1 }));
  const result = completed(await command.execute(['--fail-on', 'rotate']));
  assert.equal(result.exitCode, EXIT_CODE.ok);
  assert.equal(result.output, 'DIGEST\n');
});

test('--fail-on any exits 1 on every line that asks to act, and on a key shape that names no file', async () => {
  const files = completed(await commandAnswering(checked({ files: 1 })).command.execute(['--fail-on', 'any']));
  assert.equal(files.exitCode, 1);
  assert.match(files.output, /\n--fail-on any: 1 file asks you to act\. Exit code 1\.\n$/);

  const shapes = completed(await commandAnswering(checked({ shapes: 2 })).command.execute(['--fail-on=any']));
  assert.equal(shapes.exitCode, 1);
  assert.match(shapes.output, /2 kinds of key came back in a result/);
});

// RBD2, TK2's kind: a session the check could not read is never the clean one.
test('at either level, a session that could not be read fails the check', async () => {
  for (const level of ['rotate', 'any']) {
    const result = completed(await commandAnswering(checked({ unreadable: 1 })).command.execute(['--fail-on', level]));
    assert.equal(result.exitCode, 1, level);
    assert.match(result.output, /1 session could not be read, so this check cannot call it clean/, level);
  }
});

test('an answer that asks nothing passes, and so does a check that read no session', async () => {
  const clean = completed(await commandAnswering(checked({})).command.execute(['--fail-on', 'any']));
  assert.equal(clean.exitCode, EXIT_CODE.ok);
  assert.equal(clean.output, 'DIGEST\n');

  const none = completed(await commandAnswering({ outcome: 'no-sessions', output: 'NOTHING SAVED\n' }).command.execute(['--fail-on', 'any']));
  assert.equal(none.exitCode, EXIT_CODE.ok);
});

test('a refused policy keeps its own exit code under --fail-on', async () => {
  const result = completed(await commandAnswering({ outcome: 'policy-refused', output: 'REFUSED\n' }).command.execute(['--fail-on', 'any']));
  assert.equal(result.exitCode, EXIT_CODE.usage);
});

test('--fail-on takes rotate or any, and is not given with --mark or --unmark', async () => {
  const { command, runs } = commandAnswering(checked({ rotate: 1 }));
  for (const args of [['--fail-on', 'all'], ['--fail-on', 'rotate', '--mark', 'rotated', '.env'], ['--fail-on', 'any', '--unmark', '.env']]) {
    const result = await command.execute(args);
    assert.equal(result.kind, 'usage-error', args.join(' '));
  }
  assert.equal(runs.length, 0, 'a refused flag reads no session');
});

test('the options a check runs with are the same with --fail-on as without it', async () => {
  const { command, runs } = commandAnswering(checked({}));
  await command.execute(['--since', '2d', '--full', '--share']);
  await command.execute(['--since', '2d', '--full', '--share', '--fail-on', 'any']);
  assert.deepEqual(runs[1], runs[0]);
});

// it-runs-by-itself RB7, RBD5: a mark is the person's own word, so an AI whose commit the gate stopped cannot pass it by
// running the line the check prints.
test('--mark and --unmark run by an AI mark nothing, say why and where, and exit 2', async () => {
  const { command, marks } = commandAnswering(checked({ rotate: 1, files: 1 }), true);
  for (const [args, word] of [[['--mark', 'rotated', '.env'], 'marked'], [['--unmark', '.env'], 'unmarked']] as const) {
    const result = completed(await command.execute(args));
    assert.equal(result.exitCode, EXIT_CODE.usage, args.join(' '));
    assert.match(result.output, new RegExp(`^Nothing was ${word}: agentwhy check ${args[0]} is your own word about a file, and this command was run by your AI, not typed in a terminal\\.\\n`));
    assert.match(result.output, /Do it yourself, on agentwhy's page or in your own terminal\. To the AI: tell the person what the check found, and do not try another way\.\n$/);
  }
  assert.deepEqual(marks, [], 'nothing reached the record');
});

// RBD5: nothing a person does today stops - the check itself and its gate run for an AI as for anyone, and a person marks.
test('an AI still runs the check and its gate, and a person still marks', async () => {
  const ai = commandAnswering(checked({ rotate: 1, files: 1 }), true);
  assert.equal(completed(await ai.command.execute([])).exitCode, EXIT_CODE.ok);
  assert.equal(completed(await ai.command.execute(['--fail-on', 'rotate'])).exitCode, 1);

  for (const person of [commandAnswering(checked({}), false), commandAnswering(checked({}))]) {
    assert.equal(completed(await person.command.execute(['--mark', 'rotated', '.env'])).output, 'MARKED\n');
    assert.equal(completed(await person.command.execute(['--unmark', '.env'])).output, 'UNMARKED\n');
    assert.deepEqual(person.marks, ['mark .env', 'unmark .env']);
  }
});

// A usage error is still the usage error it was: what an AI typed wrong is said before whose word it is.
test('a malformed mark run by an AI is a usage error, as it is for a person', async () => {
  const { command } = commandAnswering(checked({}), true);
  assert.equal((await command.execute(['--mark', 'deleted', '.env'])).kind, 'usage-error');
  assert.equal((await command.execute(['--unmark', '.env', 'extra'])).kind, 'usage-error');
});
