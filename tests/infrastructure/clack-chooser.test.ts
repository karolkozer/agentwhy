import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { ClackChooser } from '../../src/infrastructure/clack-chooser.ts';
import { TerminalBanner } from '../../src/infrastructure/terminal-banner.ts';
import type { Choice } from '../../src/ports/chooser.ts';

const CHOICES: readonly Choice[] = [
  { label: 'Fix the webhook signature check', detail: '2026-09-15 08:10 · 2 delegations · 1a2b3c4d' },
  { label: 'Debug webhook retries', detail: '2026-09-14 19:10 · no delegations · 5e6f7a8b' },
  { label: 'Rename the env loader', detail: '2026-09-14 10:00 · no delegations · 9c0d1e2f' },
];

const ESC = String.fromCharCode(27);
const DOWN = `${ESC}[B`;
const ENTER = String.fromCharCode(13);
const CTRL_C = String.fromCharCode(3);

/**
 * A chooser driven by bytes rather than by fingers. Keys arrive apart, the way typing does: an Escape followed at
 * once by more bytes is read as the start of an escape sequence, not as a key of its own.
 */
async function chosenAfter(keys: readonly string[], choices: readonly Choice[] = CHOICES): Promise<number | undefined> {
  const input = new PassThrough();
  const output = new PassThrough();
  output.resume();

  const chooser = new ClackChooser(input as unknown as NodeJS.ReadStream, output as unknown as NodeJS.WriteStream);
  const chosen = chooser.choose('Which session?', choices);
  for (const key of keys) {
    input.write(key);
    await delay(80);
  }
  return chosen;
}

test('the arrow keys move and Enter chooses where they stopped', async () => {
  assert.equal(await chosenAfter([DOWN, ENTER]), 1);
});

test('typing narrows the list, and Enter chooses what is left', async () => {
  assert.equal(await chosenAfter([...'rename', ENTER]), 2);
});

// A person remembers roughly when, or has an id from somewhere else; both are on the row, so both find it.
test('the detail beside a title is searchable too', async () => {
  assert.equal(await chosenAfter([...'19:10', ENTER]), 1, 'by time');
  assert.equal(await chosenAfter([...'9c0d', ENTER]), 2, 'by id');
});

test('Escape and Ctrl-C leave without choosing', async () => {
  assert.equal(await chosenAfter([ESC]), undefined);
  assert.equal(await chosenAfter([CTRL_C]), undefined);
});

test('Enter on a search that matches nothing chooses nothing', async () => {
  assert.equal(await chosenAfter([...'zzz', ENTER]), undefined);
});

test('an empty list is not something to choose from', async () => {
  assert.equal(await chosenAfter([], []), undefined);
});

test('the mark is drawn above the list, before anything of the list', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let written = '';
  output.on('data', (chunk: Buffer) => {
    written += chunk.toString();
  });

  const chooser = new ClackChooser(
    input as unknown as NodeJS.ReadStream,
    output as unknown as NodeJS.WriteStream,
    new TerminalBanner(['MARK ROW ONE', 'MARK ROW TWO']),
  );
  const chosen = chooser.choose('Which session?', CHOICES);
  await delay(80);
  input.write(ESC);

  assert.equal(await chosen, undefined);
  assert.ok(written.startsWith('MARK ROW ONE\nMARK ROW TWO\n'), 'the mark comes first');
  assert.ok(written.indexOf('Which session?') > written.indexOf('MARK ROW TWO'), 'and the list below it');
});

