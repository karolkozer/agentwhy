import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { printable } from '../../src/shared/printable.ts';

// Found by a review: a session's title and a folder's name reached the terminal guarded by rules of their own, or none.
test('what a terminal obeys is shown as a space', () => {
  assert.equal(printable('shop\u001b[2K\u001b[1Gx'), 'shop [2K [1Gx', 'an escape sequence');
  assert.equal(printable('shop\u009b31m'), 'shop 31m', 'a C1 control');
  assert.equal(printable('Stop\u{202e}0.3.0\u{2028}\u{2066}x\u{200f}'), 'Stop 0.3.0  x ', 'direction marks and a line separator');
});

test('letters of any script are left as they are', () => {
  assert.equal(printable('zażółć gęślą jaźń · 東京 · שלום · مرحبا'), 'zażółć gęślą jaźń · 東京 · שלום · مرحبا');
});
