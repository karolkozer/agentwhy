import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hookRefusalsIn } from '../../../../src/adapter/codex/events/hook-refusals.ts';
import { refusalReason } from '../../../../src/refuse/render/refusal-words.ts';

/** A cell's output as Codex recorded a refusal (CKB7, CKB11): its words around agentwhy's reason, the newline dropped. */
const cellOutput = (reason: string, command: string) =>
  `Script failed\nWall time 0.2 seconds\nOutput:\nScript error:\nCommand blocked by PreToolUse hook: ${reason.trimEnd()}. Command: ${command}`;

// `codex-blocks-too` CK12: agentwhy's own sentences, read back - so a change to them that this stops reading fails here.
test('every route of refusalReason is read back: the path, the rule and the refused line', () => {
  const named = hookRefusalsIn(cellOutput(refusalReason('../../.env', '**/.env*', 0, { kind: 'named' }), 'cat ../../.env'));
  assert.deepEqual(named.map(({ path, pattern, command }) => [path, pattern, command]), [['../../.env', '**/.env*', 'cat ../../.env']]);

  const glob = hookRefusalsIn(cellOutput(refusalReason('.env', '**/.env*', 0, { kind: 'glob', word: '.env*' }), "rg --files --hidden -g '.env*' -g '!node_modules'"));
  assert.deepEqual(glob.map(({ path, command }) => [path, command]), [['.env', "rg --files --hidden -g '.env*' -g '!node_modules'"]]);

  const search = hookRefusalsIn(cellOutput(refusalReason('apps/web/.env.local', '**/.env*', 2, { kind: 'search' }), 'grep -rn KEY .'));
  assert.deepEqual(search.map(({ path, pattern }) => [path, pattern]), [['apps/web/.env.local', '**/.env*']]);
  assert.match(search[0]?.reason ?? '', /^agentwhy refused this command: this search would read apps\/web\/\.env\.local, .+Do not ask them to paste this file or a secret value into the chat; they can inspect it in their IDE\.$/);
});

test('two refusals in one cell are two, in order', () => {
  const text = [
    cellOutput(refusalReason('.env', '**/.env*', 0, { kind: 'named' }), 'cat .env'),
    `Command blocked by PreToolUse hook: ${refusalReason('secrets/key.pem', '**/secrets/**', 0, { kind: 'named' }).trimEnd()}. Command: cat secrets/key.pem`,
  ].join('\n');
  assert.deepEqual(hookRefusalsIn(text).map(({ path }) => path), ['.env', 'secrets/key.pem']);
});

// XB1: no field types a refusal; a reason nobody here wrote is not guessed at.
test('another hook\'s refusal, and agentwhy\'s words anywhere but after Codex\'s, are no refusal', () => {
  assert.deepEqual(hookRefusalsIn('Command blocked by PreToolUse hook: policy says no. Command: cat .env'), []);
  assert.deepEqual(hookRefusalsIn(`echo "${refusalReason('.env', '**/.env*', 0, { kind: 'named' }).trimEnd()}"`), []);
});
