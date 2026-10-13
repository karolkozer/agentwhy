// Copyright 2026 Nessprim Karol Kozer
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { printedOutput } from '../../../src/core/access/printed-output.ts';

// `2026-10-13-each-command-its-own-result.md` EC9: the text a call printed is the one its result wraps, then the one the
// record keeps apart from Codex's header, then the result as written - asked alike by every reader of printed lines.
test('what a call printed is the text its result wraps, then the text kept apart, then the result as written', () => {
  const wrapped = '{"chunk_id":"aed82c","exit_code":0,"output":".env\\nsrc/app.ts\\n"}';
  assert.equal(printedOutput({ result: { content: wrapped, printedText: '.env\nsrc/app.ts\n' } as never, execution: { status: 'completed', exitCode: 0 } }), '.env\nsrc/app.ts\n');
  assert.equal(printedOutput({ result: { content: 'Script completed\n…\nOutput:\n\nREADME.md\n' } as never, execution: { status: 'completed', printed: 'README.md\n' } }), 'README.md\n');
  assert.equal(printedOutput({ result: { content: 'README.md\n' } as never }), 'README.md\n', 'Claude Code, and a Codex item: as written');
  assert.equal(printedOutput({}), undefined);
  assert.equal(printedOutput(undefined), undefined);
});
