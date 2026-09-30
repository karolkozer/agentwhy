import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PassThrough } from 'node:stream';
import { TerminalBanner } from '../../src/infrastructure/terminal-banner.ts';

function writing(): { stream: NodeJS.WritableStream; written: () => string } {
  const stream = new PassThrough();
  let written = '';
  stream.on('data', (chunk: Buffer) => {
    written += chunk.toString();
  });
  return { stream: stream as unknown as NodeJS.WritableStream, written: () => written };
}

// `init` asks three things in a row: the mark belongs above the first, and above none of the rest.
test('the lines are drawn once, however many prompts share the banner', () => {
  const { stream, written } = writing();
  const banner = new TerminalBanner(['MARK ONE', 'MARK TWO']);

  banner.drawOn(stream);
  banner.drawOn(stream);

  assert.equal(written(), 'MARK ONE\nMARK TWO\n');
});

test('no lines is nothing written, and not an empty line', () => {
  const { stream, written } = writing();

  new TerminalBanner().drawOn(stream);

  assert.equal(written(), '');
});
