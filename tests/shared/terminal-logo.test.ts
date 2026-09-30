import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ESCAPES } from '../../src/shared/colour.ts';
import { logoWidth, TAGLINE, terminalLogo } from '../../src/shared/terminal-logo.ts';


test('the mark is two rows of one width, so the words beside it line up', () => {
  const rows = terminalLogo([TAGLINE, 'session 1a2b3c4d'], { colour: false, ascii: false });

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.indexOf(TAGLINE), rows[1]?.indexOf('session 1a2b3c4d'));
});

// Criterion 11 of findings-worth-reading: colour laid over text never changes the text.
test('without its escapes, the coloured mark is the plain one', () => {
  const coloured = terminalLogo([TAGLINE], { colour: true, ascii: false });

  assert.ok(coloured.some((row) => row !== row.replace(ESCAPES, '')), 'it is coloured');
  assert.deepEqual(
    coloured.map((row) => row.replace(ESCAPES, '')),
    terminalLogo([TAGLINE], { colour: false, ascii: false }),
  );
});

test('under --ascii the name is written in letters, and nothing but ASCII is drawn', () => {
  const rows = terminalLogo([TAGLINE], { colour: false, ascii: true });

  assert.equal(rows[0], `agentwhy   ${TAGLINE}`);
  for (const row of rows) assert.match(row, /^[\x20-\x7e]*$/);
  assert.deepEqual(terminalLogo([], { colour: false, ascii: true }), ['agentwhy']);
});

test('a row with nothing beside it ends where the letters do', () => {
  for (const row of terminalLogo([], { colour: false, ascii: false })) assert.equal(row, row.trimEnd());
});

test('the width it reports is where the words beside it start', () => {
  assert.equal(terminalLogo([TAGLINE], { colour: false, ascii: false })[0]?.indexOf(TAGLINE), logoWidth(false));
  assert.equal(terminalLogo([TAGLINE], { colour: false, ascii: true })[0]?.indexOf(TAGLINE), logoWidth(true));
});
